/**
 * Quizzes — staff side (Course Builder). The student side (taking, scoring, feedback) is in quiz-taking.ts.
 *
 * A6: a quiz is created under a lesson in the Course Builder and saved in one go (settings + all
 * questions): PUT /quizzes/:id. Questions are single choice, multiple choice or true/false, with the
 * correct option(s) flagged; old Tutor questions keep their stored shape until someone edits them.
 */
import type { Prisma } from "@prisma/client";
import { prisma, newId, now } from "@/lib/db";
import { Err } from "@/lib/api/errors";
import { ser } from "@/server/serialize";
import type { AuthUser } from "@/lib/auth/request";
import { assertUuid } from "@/lib/uuid";
import { plain } from "@/lib/plain-text";
import { normalizeOptions } from "./quiz-taking";
import { nextItemOrder, resolvePlacement } from "./curriculum";

function mapQuiz(q: {
  id: string;
  courseId: string;
  sectionId: string | null;
  lessonId?: string | null;
  title: string;
  description: string | null;
  timeLimitSecs: bigint;
  passPercent: { toNumber?: () => number } | number | object;
  maxAttempts: bigint;
  shuffleQuestions: boolean;
  published: boolean;
  requiredForCert: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
  questions?: unknown[];
}) {
  return ser({
    id: q.id,
    course_id: q.courseId,
    section_id: q.sectionId,
    lesson_id: q.lessonId ?? null,
    title: q.title,
    description: q.description,
    time_limit_secs: Number(q.timeLimitSecs),
    pass_percent: q.passPercent,
    max_attempts: Number(q.maxAttempts),
    shuffle_questions: q.shuffleQuestions,
    published: q.published,
    required_for_cert: q.requiredForCert,
    questions: q.questions,
    created_at: q.createdAt?.toISOString(),
    updated_at: q.updatedAt?.toISOString(),
  });
}

function canManage(user: AuthUser, instructorId: string) {
  return user.role === "admin" || instructorId === user.user_id;
}

export async function listByCourse(courseId: string) {
  const rows = await prisma.quiz.findMany({
    where: { courseId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapQuiz);
}

export async function getQuiz(id: string) {
  const q = await prisma.quiz.findFirst({
    where: { id, deletedAt: null },
    include: {
      questions: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!q) throw Err.notFound("quiz not found");
  return mapQuiz({
    ...q,
    questions: q.questions.map((qq) =>
      ser({
        id: qq.id,
        quiz_id: qq.quizId,
        type: qq.type,
        text: qq.text,
        explanation: qq.explanation,
        points: qq.points,
        sort_order: Number(qq.sortOrder),
        options_json: qq.optionsJson,
        correct_answer: qq.correctAnswer,
      })
    ),
  });
}

// ── Course Builder: one quiz with its questions, in the editor's shape ──

/** Phase 2: "short_answer" = the student types the answer; the options are the accepted answers. */
const TYPES = ["single_choice", "multiple_choice", "true_false", "short_answer"] as const;
type QType = (typeof TYPES)[number];

type EditorQuestion = {
  id?: string;
  type: QType;
  text: string;
  explanation: string | null;
  points: number;
  options: { text: string; correct: boolean }[];
};

function editorQuestion(q: {
  id: string;
  type: string;
  text: string;
  explanation: string | null;
  points: unknown;
  optionsJson: unknown;
  correctAnswer: string | null;
}): EditorQuestion {
  const type: QType = (TYPES as readonly string[]).includes(q.type) ? (q.type as QType) : "single_choice";
  return {
    id: q.id,
    type,
    text: plain(q.text),
    explanation: plain(q.explanation) || null,
    points: Number(q.points),
    options: normalizeOptions(q).map((o) => ({ text: o.text, correct: o.correct })),
  };
}

/** Staff view of a quiz for the Course Builder (answer key included). */
export async function staffQuiz(user: AuthUser, id: string) {
  assertUuid(id, "quiz not found");
  const q = await prisma.quiz.findFirst({
    where: { id, deletedAt: null },
    include: {
      course: { select: { instructorId: true } },
      questions: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
      _count: { select: { attempts: { where: { deletedAt: null } } } },
    },
  });
  if (!q) throw Err.notFound("quiz not found");
  if (!canManage(user, q.course.instructorId)) throw Err.forbidden();
  return {
    id: q.id,
    course_id: q.courseId,
    section_id: q.sectionId,
    lesson_id: q.lessonId,
    title: q.title,
    description: plain(q.description) || "",
    time_limit_secs: Number(q.timeLimitSecs),
    pass_percent: Number(q.passPercent),
    max_attempts: Number(q.maxAttempts),
    shuffle_questions: q.shuffleQuestions,
    published: q.published,
    attempt_count: q._count.attempts,
    is_legacy: q.legacyWpId != null,
    questions: q.questions.map(editorQuestion),
  };
}

type SaveQuizInput = {
  course_id?: string;
  lesson_id?: string | null;
  section_id?: string | null;
  title?: string;
  description?: string | null;
  time_limit_secs?: number;
  pass_percent?: number;
  max_attempts?: number;
  shuffle_questions?: boolean;
  published?: boolean;
  questions?: unknown;
};

function num(v: unknown, label: string, min: number, max: number, fallback: number) {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw Err.invalidInput(`${label} must be between ${min} and ${max}`);
  return n;
}

function cleanQuestion(raw: unknown, i: number): EditorQuestion {
  const q = (raw ?? {}) as Record<string, unknown>;
  const where = `Question ${i + 1}`;
  const type = String(q.type ?? "") as QType;
  if (!TYPES.includes(type)) throw Err.invalidInput(`${where}: choose a question type`);
  const text = String(q.text ?? "").trim();
  if (!text) throw Err.invalidInput(`${where}: write the question`);
  if (text.length > 5000) throw Err.invalidInput(`${where}: the question is too long`);
  const explanation = String(q.explanation ?? "").trim().slice(0, 5000) || null;
  const points = num(q.points, `${where}: points`, 0, 100, 1);
  let options = (Array.isArray(q.options) ? q.options : []).map((o) => ({
    text: String((o as { text?: unknown })?.text ?? "").trim().slice(0, 1000),
    correct: (o as { correct?: unknown })?.correct === true,
  }));
  if (type === "short_answer") {
    // every listed answer is accepted (case, spaces and end punctuation do not matter when grading)
    // one entry per spelling: "Mogadishu" and "mogadishu" are the same answer when grading
    const seen = new Set<string>();
    const accepted = options
      .map((o) => o.text)
      .filter((t) => {
        const k = t.toLowerCase().replace(/\s+/g, " ").trim();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 12);
    if (!accepted.length) throw Err.invalidInput(`${where}: write the accepted answer`);
    const id = typeof q.id === "string" && q.id ? q.id : undefined;
    return { id, type, text, explanation, points, options: accepted.map((t) => ({ text: t, correct: true })) };
  }
  if (type === "true_false") {
    if (options.length !== 2) throw Err.invalidInput(`${where}: a true/false question has exactly 2 answers`);
    options = [
      { text: "True", correct: options[0].correct },
      { text: "False", correct: options[1].correct },
    ];
  }
  if (options.length < 2) throw Err.invalidInput(`${where}: add at least 2 answers`);
  if (options.length > 12) throw Err.invalidInput(`${where}: at most 12 answers`);
  if (options.some((o) => !o.text)) throw Err.invalidInput(`${where}: an answer is empty`);
  const correct = options.filter((o) => o.correct).length;
  if (correct === 0) throw Err.invalidInput(`${where}: mark the correct answer`);
  if (type !== "multiple_choice" && correct > 1) throw Err.invalidInput(`${where}: only one answer can be correct`);
  const id = typeof q.id === "string" && q.id ? q.id : undefined;
  return { id, type, text, explanation, points, options };
}

const same = (a: EditorQuestion, b: EditorQuestion) =>
  JSON.stringify([a.type, a.text, a.explanation ?? null, a.points, a.options]) ===
  JSON.stringify([b.type, b.text, b.explanation ?? null, b.points, b.options]);

function loadForSave(id: string) {
  return prisma.quiz.findFirst({
    where: { id, deletedAt: null },
    include: {
      course: { select: { instructorId: true } },
      questions: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
    },
  });
}

/**
 * Create (id = null) or update a quiz with ALL its questions in one transaction: questions not in
 * the list are removed (soft delete), unchanged old questions are left exactly as they were.
 */
export async function saveQuiz(user: AuthUser, id: string | null, input: SaveQuizInput) {
  let courseId: string;
  let existing: NonNullable<Awaited<ReturnType<typeof loadForSave>>> | null = null;
  if (id) {
    assertUuid(id, "quiz not found");
    existing = await loadForSave(id);
    if (!existing) throw Err.notFound("quiz not found");
    if (!canManage(user, existing.course.instructorId)) throw Err.forbidden();
    courseId = existing.courseId;
  } else {
    assertUuid(input.course_id, "course not found");
    const course = await prisma.course.findFirst({ where: { id: input.course_id, deletedAt: null }, select: { id: true, instructorId: true } });
    if (!course) throw Err.notFound("course not found");
    if (!canManage(user, course.instructorId)) throw Err.forbidden();
    courseId = course.id;
  }

  const title = String(input.title ?? existing?.title ?? "").trim();
  if (!title) throw Err.invalidInput("give the quiz a title");
  if (title.length > 255) throw Err.invalidInput("the title is too long");
  const description = input.description === undefined ? existing?.description ?? null : String(input.description ?? "").trim().slice(0, 20000) || null;
  const timeLimit = Math.round(num(input.time_limit_secs, "Time limit", 0, 86_400, Number(existing?.timeLimitSecs ?? 0)));
  const passPercent = num(input.pass_percent, "Pass mark", 0, 100, Number(existing?.passPercent ?? 60));
  const maxAttempts = Math.round(num(input.max_attempts, "Attempts", 0, 100, Number(existing?.maxAttempts ?? 0)));
  const shuffle = input.shuffle_questions === undefined ? existing?.shuffleQuestions ?? false : !!input.shuffle_questions;
  const published = input.published === undefined ? existing?.published ?? false : !!input.published;

  // placement: create needs a lesson (or a topic); an update keeps the place unless a new one is given
  let placement: { sectionId: string | null; lessonId: string | null; sortOrder?: number } | undefined;
  if (!id || input.lesson_id !== undefined || input.section_id !== undefined) {
    placement = await resolvePlacement(courseId, { lesson_id: input.lesson_id, section_id: input.section_id });
    if (!placement.sectionId) throw Err.invalidInput("choose the lesson this quiz belongs to");
    const moved = !existing || existing.lessonId !== placement.lessonId || existing.sectionId !== placement.sectionId;
    // a new quiz, or one moved to another lesson, goes after the lesson's other quizzes / assignments
    if (moved) placement.sortOrder = await nextItemOrder(placement);
  }

  const oldQuestions = existing?.questions ?? [];
  let questions: EditorQuestion[] | undefined;
  if (input.questions !== undefined) {
    if (!Array.isArray(input.questions)) throw Err.invalidInput("questions must be a list");
    if (input.questions.length > 300) throw Err.invalidInput("at most 300 questions per quiz");
    questions = input.questions.map(cleanQuestion);
    const known = new Set(oldQuestions.map((q) => q.id));
    for (const q of questions) if (q.id && !known.has(q.id)) throw Err.invalidInput("a question does not belong to this quiz");
  }
  const questionCount = questions ? questions.length : oldQuestions.length;
  if (published && questionCount === 0) throw Err.invalidInput("add at least one question before publishing the quiz");

  const t = now();
  const quizId = id ?? newId();
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  const quizData = {
    title,
    description,
    timeLimitSecs: BigInt(timeLimit),
    passPercent,
    maxAttempts: BigInt(maxAttempts),
    shuffleQuestions: shuffle,
    published,
    updatedAt: t,
    ...(placement ? { sectionId: placement.sectionId, lessonId: placement.lessonId } : {}),
    ...(placement?.sortOrder !== undefined ? { sortOrder: placement.sortOrder } : {}),
  };
  if (id) ops.push(prisma.quiz.update({ where: { id }, data: quizData }));
  else ops.push(prisma.quiz.create({ data: { id: quizId, courseId, createdAt: t, ...quizData } }));

  if (questions) {
    const byId = new Map(oldQuestions.map((q) => [q.id, q]));
    const keep = new Set<string>();
    questions.forEach((q, i) => {
      const data = {
        type: q.type,
        text: q.text,
        explanation: q.explanation,
        points: q.points,
        sortOrder: BigInt(i),
        optionsJson: q.options.map((o, k) => ({ text: o.text, correct: o.correct, sort_order: k })),
        correctAnswer: null,
        updatedAt: t,
      };
      const old = q.id ? byId.get(q.id) : undefined;
      if (old) {
        keep.add(old.id);
        if (same(editorQuestion(old), q)) {
          // unchanged (old Tutor questions stay byte-for-byte): only the order may move
          if (Number(old.sortOrder) !== i) ops.push(prisma.quizQuestion.update({ where: { id: old.id }, data: { sortOrder: BigInt(i), updatedAt: t } }));
        } else {
          ops.push(prisma.quizQuestion.update({ where: { id: old.id }, data }));
        }
      } else {
        ops.push(prisma.quizQuestion.create({ data: { id: newId(), quizId, createdAt: t, ...data } }));
      }
    });
    const removed = oldQuestions.filter((q) => !keep.has(q.id)).map((q) => q.id);
    if (removed.length) {
      ops.push(prisma.quizQuestion.updateMany({ where: { id: { in: removed } }, data: { deletedAt: t, updatedAt: t } }));
    }
  }
  await prisma.$transaction(ops);
  return staffQuiz(user, quizId);
}

/** Older create endpoint (POST /quizzes): same rules as the builder save. */
export async function createQuiz(user: AuthUser, input: SaveQuizInput) {
  return saveQuiz(user, null, input);
}

export async function updateQuiz(
  user: AuthUser,
  id: string,
  input: Partial<{
    title: string;
    description: string;
    time_limit_secs: number;
    pass_percent: number;
    max_attempts: number;
    shuffle_questions: boolean;
    published: boolean;
    required_for_cert: boolean;
    lesson_id: string | null;
    section_id: string | null;
  }>
) {
  assertUuid(id, "quiz not found");
  const q = await prisma.quiz.findFirst({
    where: { id, deletedAt: null },
    include: { course: true, _count: { select: { questions: { where: { deletedAt: null } } } } },
  });
  if (!q) throw Err.notFound("quiz not found");
  if (!canManage(user, q.course.instructorId)) throw Err.forbidden();
  if (input.published === true && q._count.questions === 0) {
    throw Err.invalidInput("add at least one question before publishing the quiz");
  }
  const placement =
    input.lesson_id !== undefined || input.section_id !== undefined
      ? await resolvePlacement(q.courseId, { lesson_id: input.lesson_id, section_id: input.section_id })
      : undefined;
  if (placement && !placement.sectionId) throw Err.invalidInput("choose the lesson this quiz belongs to");
  const sortOrder =
    placement && (placement.lessonId !== q.lessonId || placement.sectionId !== q.sectionId) ? await nextItemOrder(placement) : undefined;
  await prisma.quiz.update({
    where: { id },
    data: {
      title: input.title?.trim() || undefined,
      description: input.description,
      timeLimitSecs: input.time_limit_secs === undefined ? undefined : BigInt(Math.max(0, Math.round(input.time_limit_secs))),
      passPercent: input.pass_percent,
      maxAttempts: input.max_attempts === undefined ? undefined : BigInt(Math.max(0, Math.round(input.max_attempts))),
      shuffleQuestions: input.shuffle_questions,
      published: input.published,
      requiredForCert: input.required_for_cert,
      ...(placement ? { sectionId: placement.sectionId, lessonId: placement.lessonId } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
      updatedAt: now(),
    },
  });
  return getQuiz(id);
}

export async function deleteQuiz(user: AuthUser, id: string) {
  assertUuid(id, "quiz not found");
  const q = await prisma.quiz.findFirst({
    where: { id, deletedAt: null },
    include: { course: true },
  });
  if (!q) throw Err.notFound("quiz not found");
  if (!canManage(user, q.course.instructorId)) throw Err.forbidden();
  await prisma.quiz.update({
    where: { id },
    data: { deletedAt: now(), updatedAt: now() },
  });
}

export async function addQuestion(
  user: AuthUser,
  quizId: string,
  input: {
    type: string;
    text: string;
    explanation?: string;
    points?: number;
    sort_order?: number;
    options_json?: unknown;
    options?: unknown;
    correct_answer?: string;
  }
) {
  assertUuid(quizId, "quiz not found");
  const q = await prisma.quiz.findFirst({
    where: { id: quizId, deletedAt: null },
    include: { course: true },
  });
  if (!q) throw Err.notFound("quiz not found");
  if (!canManage(user, q.course.instructorId)) throw Err.forbidden();
  const t = now();
  const row = await prisma.quizQuestion.create({
    data: {
      id: newId(),
      quizId,
      type: input.type,
      text: input.text,
      explanation: input.explanation || null,
      points: input.points ?? 1,
      sortOrder: BigInt(input.sort_order ?? 0),
      // the older client sent `options`, the API documented `options_json`: accept both
      optionsJson: (input.options_json ?? input.options) as object | undefined,
      correctAnswer: input.correct_answer || null,
      createdAt: t,
      updatedAt: t,
    },
  });
  return ser({
    id: row.id,
    quiz_id: row.quizId,
    type: row.type,
    text: row.text,
    points: row.points,
  });
}

export async function updateQuestion(
  user: AuthUser,
  questionId: string,
  input: Partial<{
    type: string;
    text: string;
    explanation: string;
    points: number;
    sort_order: number;
    options_json: unknown;
    correct_answer: string;
  }>
) {
  assertUuid(questionId, "question not found");
  const qq = await prisma.quizQuestion.findFirst({
    where: { id: questionId, deletedAt: null },
    include: { quiz: { include: { course: true } } },
  });
  if (!qq) throw Err.notFound("question not found");
  if (!canManage(user, qq.quiz.course.instructorId)) throw Err.forbidden();
  await prisma.quizQuestion.update({
    where: { id: questionId },
    data: {
      type: input.type,
      text: input.text,
      explanation: input.explanation,
      points: input.points,
      sortOrder: input.sort_order === undefined ? undefined : BigInt(input.sort_order),
      optionsJson: input.options_json as object | undefined,
      correctAnswer: input.correct_answer,
      updatedAt: now(),
    },
  });
  return { ok: true };
}

export async function deleteQuestion(user: AuthUser, questionId: string) {
  assertUuid(questionId, "question not found");
  const qq = await prisma.quizQuestion.findFirst({
    where: { id: questionId, deletedAt: null },
    include: { quiz: { include: { course: true } } },
  });
  if (!qq) throw Err.notFound("question not found");
  if (!canManage(user, qq.quiz.course.instructorId)) throw Err.forbidden();
  await prisma.quizQuestion.update({
    where: { id: questionId },
    data: { deletedAt: now(), updatedAt: now() },
  });
}

export async function listAttempts(user: AuthUser, quizId: string) {
  assertUuid(quizId, "quiz not found");
  const rows = await prisma.quizAttempt.findMany({
    where: { quizId, userId: user.user_id, deletedAt: null },
    orderBy: { startedAt: "desc" },
  });
  return ser(
    rows.map((a) => ({
      id: a.id,
      quiz_id: a.quizId,
      score: Number(a.score),
      max_score: Number(a.maxScore),
      percent: Number(a.percent),
      passed: a.passed,
      attempt_num: Number(a.attemptNum),
      started_at: a.startedAt.toISOString(),
      finished_at: a.finishedAt?.toISOString() ?? null,
    }))
  );
}
