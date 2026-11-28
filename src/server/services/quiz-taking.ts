/**
 * Quizzes from the student's side: list, take, automatic scoring and feedback.
 *
 *  - Only students with access to the course (and its instructor / admins) can see or take a quiz.
 *  - Correct answers NEVER reach the browser before the attempt is submitted.
 *  - Grading uses the per-option `correct` flags (migrated Tutor data and new questions alike):
 *    a question is right when the chosen options are exactly the correct ones.
 *  - Feedback after submitting: right / wrong per question + explanation. The correct options are
 *    revealed once the student passed or has no attempts left (so retries stay meaningful).
 * Staff CRUD stays in services/quizzes.ts.
 */
import { prisma, newId, now } from "@/lib/db";
import { ApiError, Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { findBestEnrollment, hasCourseAccess } from "@/server/enrollment-status";
import { assertUuid } from "@/lib/uuid";
import { recordLearningActivity } from "./learning";
import staleAnswers from "@/server/data/legacy-stale-quiz-answers.json";
import { plain } from "@/lib/plain-text";
import {
  assertItemOpen,
  byPlace,
  courseContext,
  isLocked,
  locksFor,
  outline,
  placeIndex,
  placeOf,
  type CourseCtx,
  type Locks,
  type Outline,
} from "./curriculum";

/** Old Tutor answers that belonged to another question type: Tutor never showed them, so neither do we. */
const STALE = new Set<number>((staleAnswers as { ids: number[] }).ids);

import { notify } from "@/server/notify";

type Opt = { key: string; text: string; correct: boolean };

/** Options in display order with stable keys ("0", "1", …). Accepts both stored shapes. */
export function normalizeOptions(q: { type: string; optionsJson: unknown; correctAnswer: string | null }): Opt[] {
  const raw = q.optionsJson as unknown;
  let list: { text?: unknown; label?: unknown; value?: unknown; correct?: unknown; sort_order?: unknown; legacy_answer_id?: unknown }[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === "object" && Array.isArray((raw as { options?: unknown }).options)) {
    list = (raw as { options: typeof list }).options;
  }
  const correctText = (q.correctAnswer ?? "").trim().toLowerCase();
  const current = list.filter((o) => !STALE.has(Number(o.legacy_answer_id)));
  if (current.length) list = current;
  let opts = list
    .map((o, i) => ({ o, i }))
    .sort((a, b) => Number(a.o.sort_order ?? 0) - Number(b.o.sort_order ?? 0) || a.i - b.i)
    .map(({ o }, idx) => {
      const text = plain(String(o.text ?? o.label ?? o.value ?? ""));
      const flagged = o.correct === true || o.correct === "true" || o.correct === 1;
      return { key: String(idx), text, correct: flagged };
    })
    .filter((o) => o.text !== "");
  if (q.type === "true_false" && opts.length === 0) {
    opts = [
      { key: "0", text: "True", correct: correctText === "true" },
      { key: "1", text: "False", correct: correctText === "false" },
    ];
  }
  // older questions saved only the correct answer's text
  if (!opts.some((o) => o.correct) && correctText) {
    opts = opts.map((o) => ({ ...o, correct: o.text.toLowerCase() === correctText }));
  }
  return opts;
}

function isMulti(type: string) {
  return type === "multiple_choice";
}

/** Phase 2: a typed answer, compared with the accepted answers. */
function isShort(type: string) {
  return type === "short_answer";
}
/** "  Muqdisho. " = "muqdisho": case, accents, spaces and end punctuation do not count */
function normAnswer(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:!?'"()\-]+|[\s.,;:!?'"()\-]+$/g, "")
    .trim();
}

/** Course access for a quiz (student with access, the course instructor or an admin). */
async function access(user: AuthUser, course: { id: string; instructorId: string }) {
  if (user.role === "admin" || course.instructorId === user.user_id) return { staff: true };
  const e = await findBestEnrollment(user.user_id, course.id);
  if (!e || !hasCourseAccess(e)) throw Err.forbidden();
  return { staff: false };
}

async function loadQuiz(quizId: string) {
  assertUuid(quizId, "quiz not found");
  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, deletedAt: null },
    include: {
      course: { select: { id: true, slug: true, title: true, instructorId: true, sequentialLessons: true } },
      questions: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!quiz) throw Err.notFound("quiz not found");
  return quiz;
}

async function attemptSummary(userId: string, quizId: string, maxAttempts: number) {
  const rows = await prisma.quizAttempt.findMany({
    where: { quizId, userId, deletedAt: null },
    orderBy: { startedAt: "desc" },
    select: { id: true, finishedAt: true, percent: true, passed: true, startedAt: true, attemptNum: true, score: true, maxScore: true },
  });
  const finished = rows.filter((r) => r.finishedAt);
  const best = finished.reduce((m, r) => Math.max(m, Number(r.percent)), 0);
  const passed = finished.some((r) => r.passed);
  const used = rows.length;
  return {
    attempts_used: used,
    attempts_left: maxAttempts > 0 ? Math.max(0, maxAttempts - used) : null,
    best_percent: finished.length ? Math.round(best * 100) / 100 : null,
    passed,
    open_attempt_id: rows.find((r) => !r.finishedAt)?.id ?? null,
    history: finished.slice(0, 20).map((r) => ({
      id: r.id,
      attempt_num: Number(r.attemptNum),
      percent: Number(r.percent),
      score: Number(r.score),
      max_score: Number(r.maxScore),
      passed: r.passed,
      finished_at: r.finishedAt!.toISOString(),
    })),
  };
}

/**
 * The quizzes of a course for a student (published only), in curriculum order, with their attempt
 * status and where they sit (A6: under a lesson, or at the top of a topic). Quizzes of a deleted
 * topic are not listed. `pre` lets the learn page reuse one access check for all its lists.
 */
export async function courseQuizzes(user: AuthUser, courseId: string, pre?: { ctx: CourseCtx; out: Outline; locks: Locks }) {
  const ctx = pre?.ctx ?? (await courseContext(user, courseId, "member"));
  const out = pre?.out ?? (await outline(ctx.id));
  const locks = pre?.locks ?? (await locksFor(user, ctx, out));
  const idx = placeIndex(out);
  const quizzes = await prisma.quiz.findMany({
    where: { courseId: ctx.id, deletedAt: null, published: true },
    include: { _count: { select: { questions: { where: { deletedAt: null } } } } },
    orderBy: [{ createdAt: "asc" }, { title: "asc" }],
  });
  const visible = quizzes
    .map((q) => ({ q, place: placeOf(idx, q), sortOrder: q.sortOrder, createdAt: q.createdAt }))
    .filter(({ q, place }) => place.placed || !q.sectionId) // a quiz without any topic is listed at the end
    .sort(byPlace);
  const attempts = await prisma.quizAttempt.findMany({
    where: { userId: user.user_id, quizId: { in: visible.map((v) => v.q.id) }, deletedAt: null },
    select: { quizId: true, finishedAt: true, percent: true, passed: true },
  });
  return visible.map(({ q, place }) => {
    const mine = attempts.filter((a) => a.quizId === q.id);
    const done = mine.filter((a) => a.finishedAt);
    const maxAttempts = Number(q.maxAttempts);
    return {
      id: q.id,
      course_id: q.courseId,
      section_id: place.section_id,
      section_title: place.section_title,
      lesson_id: place.lesson_id,
      lesson_title: place.lesson_title,
      sort_order: q.sortOrder,
      title: q.title,
      question_count: q._count.questions,
      time_limit_secs: Number(q.timeLimitSecs),
      pass_percent: Number(q.passPercent),
      max_attempts: maxAttempts,
      attempts_used: mine.length,
      best_percent: done.length ? Math.max(...done.map((a) => Number(a.percent))) : null,
      passed: done.some((a) => a.passed),
      locked: isLocked(locks, place),
    };
  });
}

/** One quiz ready to take: questions and options WITHOUT the answers. */
export async function quizForTaking(user: AuthUser, quizId: string) {
  const quiz = await loadQuiz(quizId);
  const { staff } = await access(user, quiz.course);
  if (!quiz.published && !staff) throw Err.notFound("quiz not found");
  const maxAttempts = Number(quiz.maxAttempts);
  return {
    id: quiz.id,
    title: quiz.title,
    // migrated descriptions can be WordPress HTML: plain text only (never rendered as HTML)
    description: plain(quiz.description) || null,
    section_id: quiz.sectionId,
    lesson_id: quiz.lessonId,
    course: { id: quiz.course.id, slug: quiz.course.slug, title: quiz.course.title },
    time_limit_secs: Number(quiz.timeLimitSecs),
    pass_percent: Number(quiz.passPercent),
    max_attempts: maxAttempts,
    question_count: quiz.questions.length,
    total_points: quiz.questions.reduce((s, q) => s + Number(q.points), 0),
    ...(await attemptSummary(user.user_id, quiz.id, maxAttempts)),
  };
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Start (or resume) an attempt and return the questions to answer. */
export async function startAttempt(user: AuthUser, quizId: string, meta?: { ip?: string }) {
  const quiz = await loadQuiz(quizId);
  const { staff } = await access(user, quiz.course);
  if (!quiz.published && !staff) throw Err.notFound("quiz not found");
  if (!quiz.questions.length) throw Err.conflict("quiz_empty", "this quiz has no questions yet");
  // A6: in a sequential course the quiz opens together with its lesson
  if (!staff && quiz.course.sequentialLessons) {
    await assertItemOpen(user, { ...quiz.course, staff }, { sectionId: quiz.sectionId, lessonId: quiz.lessonId });
  }
  const maxAttempts = Number(quiz.maxAttempts);
  const limit = Number(quiz.timeLimitSecs);
  const t = now();

  const rows = await prisma.quizAttempt.findMany({
    where: { quizId, userId: user.user_id, deletedAt: null },
    orderBy: { startedAt: "desc" },
    select: { id: true, finishedAt: true, startedAt: true },
  });
  // resume an unfinished attempt that is still within its time (or less than a day old without a limit)
  const open = rows.find((r) => !r.finishedAt);
  const openStillValid =
    open && t.getTime() - open.startedAt.getTime() < (limit > 0 ? limit * 1000 : 24 * 3_600_000);
  let attemptId: string;
  let startedAt: Date;
  if (open && openStillValid) {
    attemptId = open.id;
    startedAt = open.startedAt;
  } else {
    if (open) {
      // the old open attempt timed out: close it as 0 so it does not stay open forever
      await prisma.quizAttempt.update({
        where: { id: open.id },
        data: { finishedAt: t, attemptStatus: "timeout", result: "fail", updatedAt: t },
      });
    }
    if (maxAttempts > 0 && rows.length >= maxAttempts && !staff) {
      throw Err.conflict("no_attempts_left", "You have used all attempts for this quiz.");
    }
    const maxScore = quiz.questions.reduce((s, q) => s + Number(q.points), 0);
    const row = await prisma.quizAttempt.create({
      data: {
        id: newId(),
        quizId,
        userId: user.user_id,
        startedAt: t,
        maxScore,
        attemptNum: BigInt(rows.length + 1),
        attemptStatus: "attempt_started",
        totalQuestions: quiz.questions.length,
        attemptIp: meta?.ip?.slice(0, 64) || null,
        createdAt: t,
        updatedAt: t,
      },
    });
    attemptId = row.id;
    startedAt = t;
  }

  const questions = (quiz.shuffleQuestions ? shuffle(quiz.questions) : quiz.questions).map((q) => ({
    id: q.id,
    type: q.type,
    text: plain(q.text),
    points: Number(q.points),
    multiple: isMulti(q.type),
    short: isShort(q.type),
    // no "correct" here — and no accepted answers for a short-answer question
    options: isShort(q.type) ? [] : normalizeOptions(q).map(({ key, text }) => ({ key, text })),
  }));
  return {
    attempt_id: attemptId,
    started_at: startedAt.toISOString(),
    time_limit_secs: limit,
    deadline: limit > 0 ? new Date(startedAt.getTime() + limit * 1000).toISOString() : null,
    questions,
  };
}

function feedbackFor(
  quiz: Awaited<ReturnType<typeof loadQuiz>>,
  answers: Map<string, string[]>,
  reveal: boolean
) {
  return quiz.questions.map((q) => {
    const opts = normalizeOptions(q);
    const chosen = answers.get(q.id) ?? [];
    if (isShort(q.type)) {
      const typed = chosen[0] ?? "";
      const right = !!normAnswer(typed) && opts.some((o) => normAnswer(o.text) === normAnswer(typed));
      return {
        question_id: q.id,
        text: plain(q.text),
        multiple: false,
        short: true,
        points: Number(q.points),
        correct: right,
        chosen: typed ? [typed] : [],
        // the accepted answers are shown only when the answers are revealed
        options: reveal ? opts.map((o) => ({ key: o.key, text: o.text, chosen: false, correct: true })) : [],
        explanation: plain(q.explanation) || null,
      };
    }
    const correctKeys = opts.filter((o) => o.correct).map((o) => o.key);
    const right =
      correctKeys.length > 0 && chosen.length === correctKeys.length && chosen.every((k) => correctKeys.includes(k));
    return {
      question_id: q.id,
      text: plain(q.text),
      multiple: isMulti(q.type),
      points: Number(q.points),
      correct: right,
      chosen: chosen.map((k) => opts.find((o) => o.key === k)?.text ?? "").filter(Boolean),
      options: opts.map((o) => ({
        key: o.key,
        text: o.text,
        chosen: chosen.includes(o.key),
        ...(reveal ? { correct: o.correct } : {}),
      })),
      explanation: plain(q.explanation) || null,
    };
  });
}

/** Submit answers: { question_id, keys: ["0","2"] }. Scores automatically and returns feedback. */
export async function submitAttempt(
  user: AuthUser,
  attemptId: string,
  input: { question_id?: string; keys?: unknown; answer?: unknown }[]
) {
  assertUuid(attemptId, "attempt not found");
  const a = await prisma.quizAttempt.findFirst({ where: { id: attemptId, deletedAt: null } });
  if (!a) throw Err.notFound("attempt not found");
  if (a.userId !== user.user_id) throw Err.forbidden();
  if (a.finishedAt) throw Err.conflict("already_submitted", "this attempt was already submitted");
  const quiz = await loadQuiz(a.quizId);
  await access(user, quiz.course);

  // chosen option keys per question (only known questions / keys; one key for single-answer questions)
  const chosen = new Map<string, string[]>();
  for (const item of Array.isArray(input) ? input.slice(0, 500) : []) {
    const q = quiz.questions.find((x) => x.id === item?.question_id);
    if (!q) continue;
    if (isShort(q.type)) {
      const typed = String(item.answer ?? (Array.isArray(item.keys) ? item.keys[0] ?? "" : "")).trim().slice(0, 500);
      chosen.set(q.id, typed ? [typed] : []);
      continue;
    }
    const valid = new Set(normalizeOptions(q).map((o) => o.key));
    let keys = (Array.isArray(item.keys) ? item.keys : item.answer !== undefined ? [item.answer] : []).map(String);
    keys = [...new Set(keys.filter((k) => valid.has(k)))];
    if (!isMulti(q.type)) keys = keys.slice(0, 1);
    chosen.set(q.id, keys);
  }

  const t = now();
  const limit = Number(quiz.timeLimitSecs);
  const late = limit > 0 && t.getTime() > a.startedAt.getTime() + (limit + 60) * 1000;
  const feedback = feedbackFor(quiz, chosen, false);
  const score = feedback.reduce((s, f) => s + (f.correct ? f.points : 0), 0);
  const maxScore = quiz.questions.reduce((s, q) => s + Number(q.points), 0) || 1;
  const percent = Math.round((score / maxScore) * 10000) / 100;
  const passed = percent >= Number(quiz.passPercent);

  const done = await prisma.quizAttempt.updateMany({
    where: { id: a.id, finishedAt: null },
    data: {
      score,
      maxScore,
      percent,
      passed,
      finishedAt: t,
      attemptStatus: late ? "attempt_timeout" : "attempt_ended",
      result: passed ? "pass" : "fail",
      totalQuestions: quiz.questions.length,
      totalAnswered: [...chosen.values()].filter((k) => k.length).length,
      updatedAt: t,
    },
  });
  if (done.count !== 1) throw Err.conflict("already_submitted", "this attempt was already submitted");
  await prisma.quizAttemptAnswer.createMany({
    data: feedback.map((f) => ({
      id: newId(),
      attemptId: a.id,
      questionId: f.question_id,
      answer: JSON.stringify(chosen.get(f.question_id) ?? []),
      isCorrect: f.correct,
      pointsAwarded: f.correct ? f.points : 0,
      createdAt: t,
      updatedAt: t,
    })),
  });
  await recordLearningActivity(user.user_id, t);
  if (passed) {
    notify({
      userId: user.user_id,
      kind: "quiz_passed",
      ref: a.id,
      title: `Quiz passed: ${quiz.title}`,
      body: `You scored ${Math.round(percent)}%. Well done!`,
      link: `/learn/${encodeURIComponent(quiz.course.slug)}`,
    });
  }
  // Phase 2: passing the last quiz can complete the course and give the certificate
  let certificate_id: string | null = null;
  if (passed) {
    try {
      const { completeCourseAndIssue } = await import("./misc");
      certificate_id = (await completeCourseAndIssue(user.user_id, quiz.courseId))?.id ?? null;
    } catch {
      /* other requirements are not met yet */
    }
  }
  return { ...(await attemptResult(user, a.id)), certificate_id };
}

/** Result + feedback of a finished attempt (the student's own, or any for staff). */
export async function attemptResult(user: AuthUser, attemptId: string) {
  assertUuid(attemptId, "attempt not found");
  const a = await prisma.quizAttempt.findFirst({ where: { id: attemptId, deletedAt: null }, include: { answers: true } });
  if (!a) throw Err.notFound("attempt not found");
  const quiz = await loadQuiz(a.quizId);
  const { staff } = await access(user, quiz.course);
  if (a.userId !== user.user_id && !staff) throw Err.forbidden();
  if (!a.finishedAt) throw new ApiError(409, "not_submitted", "this attempt is not submitted yet");

  const maxAttempts = Number(quiz.maxAttempts);
  const summary = await attemptSummary(a.userId, quiz.id, maxAttempts);
  const reveal = staff || summary.passed || summary.attempts_left === 0;

  // answers saved by this app are JSON lists of option keys; migrated Tutor answers are kept as they are
  const chosen = new Map<string, string[]>();
  let detailed = true;
  for (const ans of a.answers) {
    try {
      const v = JSON.parse(ans.answer);
      if (Array.isArray(v)) chosen.set(ans.questionId, v.map(String));
      else detailed = false;
    } catch {
      detailed = false;
    }
  }
  return {
    attempt_id: a.id,
    quiz_id: quiz.id,
    quiz_title: quiz.title,
    course: { id: quiz.course.id, slug: quiz.course.slug },
    score: Number(a.score),
    max_score: Number(a.maxScore),
    percent: Number(a.percent),
    pass_percent: Number(quiz.passPercent),
    passed: a.passed,
    finished_at: a.finishedAt.toISOString(),
    answers_revealed: reveal,
    attempts_left: summary.attempts_left,
    // migrated attempts (from the old site) only have the score
    feedback: detailed && a.answers.length ? feedbackFor(quiz, chosen, reveal) : null,
  };
}

/** Admin, or the instructor of the quiz's course: may see the answer key. */
export async function canManageQuiz(user: AuthUser, quizId: string) {
  if (user.role === "admin") return true;
  if (user.role !== "instructor") return false;
  assertUuid(quizId, "quiz not found");
  const q = await prisma.quiz.findFirst({ where: { id: quizId, deletedAt: null }, select: { course: { select: { instructorId: true } } } });
  return q?.course.instructorId === user.user_id;
}
export async function canManageCourse(user: AuthUser, courseId: string) {
  if (user.role === "admin") return true;
  if (user.role !== "instructor") return false;
  assertUuid(courseId, "course not found");
  const c = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null }, select: { instructorId: true } });
  return c?.instructorId === user.user_id;
}
