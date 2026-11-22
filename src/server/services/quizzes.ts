import { prisma, newId, now } from "@/lib/db";
import { Err } from "@/lib/api/errors";
import { ser } from "@/server/serialize";
import type { AuthUser } from "@/lib/auth/request";

function mapQuiz(q: {
  id: string;
  courseId: string;
  sectionId: string | null;
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

export async function createQuiz(
  user: AuthUser,
  input: {
    course_id: string;
    section_id?: string;
    title: string;
    description?: string;
    time_limit_secs?: number;
    pass_percent?: number;
    max_attempts?: number;
    shuffle_questions?: boolean;
    published?: boolean;
    required_for_cert?: boolean;
  }
) {
  const course = await prisma.course.findFirst({
    where: { id: input.course_id, deletedAt: null },
  });
  if (!course) throw Err.notFound("course not found");
  if (user.role !== "admin" && course.instructorId !== user.user_id) throw Err.forbidden();
  const t = now();
  const row = await prisma.quiz.create({
    data: {
      id: newId(),
      courseId: input.course_id,
      sectionId: input.section_id || null,
      title: input.title.trim(),
      description: input.description || null,
      timeLimitSecs: BigInt(input.time_limit_secs ?? 0),
      passPercent: input.pass_percent ?? 60,
      maxAttempts: BigInt(input.max_attempts ?? 0),
      shuffleQuestions: !!input.shuffle_questions,
      published: !!input.published,
      requiredForCert: !!input.required_for_cert,
      createdAt: t,
      updatedAt: t,
    },
  });
  return getQuiz(row.id);
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
  }>
) {
  const q = await prisma.quiz.findFirst({
    where: { id, deletedAt: null },
    include: { course: true },
  });
  if (!q) throw Err.notFound("quiz not found");
  if (user.role !== "admin" && q.course.instructorId !== user.user_id) throw Err.forbidden();
  await prisma.quiz.update({
    where: { id },
    data: {
      title: input.title?.trim(),
      description: input.description,
      timeLimitSecs:
        input.time_limit_secs === undefined ? undefined : BigInt(input.time_limit_secs),
      passPercent: input.pass_percent,
      maxAttempts: input.max_attempts === undefined ? undefined : BigInt(input.max_attempts),
      shuffleQuestions: input.shuffle_questions,
      published: input.published,
      requiredForCert: input.required_for_cert,
      updatedAt: now(),
    },
  });
  return getQuiz(id);
}

export async function deleteQuiz(user: AuthUser, id: string) {
  const q = await prisma.quiz.findFirst({
    where: { id, deletedAt: null },
    include: { course: true },
  });
  if (!q) throw Err.notFound("quiz not found");
  if (user.role !== "admin" && q.course.instructorId !== user.user_id) throw Err.forbidden();
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
    correct_answer?: string;
  }
) {
  const q = await prisma.quiz.findFirst({
    where: { id: quizId, deletedAt: null },
    include: { course: true },
  });
  if (!q) throw Err.notFound("quiz not found");
  if (user.role !== "admin" && q.course.instructorId !== user.user_id) throw Err.forbidden();
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
      optionsJson: input.options_json as object | undefined,
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
  const qq = await prisma.quizQuestion.findFirst({
    where: { id: questionId, deletedAt: null },
    include: { quiz: { include: { course: true } } },
  });
  if (!qq) throw Err.notFound("question not found");
  if (user.role !== "admin" && qq.quiz.course.instructorId !== user.user_id) {
    throw Err.forbidden();
  }
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
  const qq = await prisma.quizQuestion.findFirst({
    where: { id: questionId, deletedAt: null },
    include: { quiz: { include: { course: true } } },
  });
  if (!qq) throw Err.notFound("question not found");
  if (user.role !== "admin" && qq.quiz.course.instructorId !== user.user_id) {
    throw Err.forbidden();
  }
  await prisma.quizQuestion.update({
    where: { id: questionId },
    data: { deletedAt: now(), updatedAt: now() },
  });
}

export async function startAttempt(user: AuthUser, quizId: string) {
  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, deletedAt: null },
    include: { questions: { where: { deletedAt: null } } },
  });
  if (!quiz) throw Err.notFound("quiz not found");
  const count = await prisma.quizAttempt.count({
    where: { quizId, userId: user.user_id, deletedAt: null },
  });
  if (Number(quiz.maxAttempts) > 0 && count >= Number(quiz.maxAttempts)) {
    throw Err.invalidInput("max attempts reached");
  }
  const t = now();
  const maxScore = quiz.questions.reduce((s, q) => s + Number(q.points), 0);
  const row = await prisma.quizAttempt.create({
    data: {
      id: newId(),
      quizId,
      userId: user.user_id,
      startedAt: t,
      maxScore,
      attemptNum: BigInt(count + 1),
      createdAt: t,
      updatedAt: t,
    },
  });
  return ser({
    id: row.id,
    quiz_id: row.quizId,
    attempt_num: Number(row.attemptNum),
    max_score: Number(row.maxScore),
    started_at: row.startedAt.toISOString(),
  });
}

export async function listAttempts(user: AuthUser, quizId: string) {
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

export async function getAttempt(user: AuthUser, attemptId: string) {
  const a = await prisma.quizAttempt.findFirst({
    where: { id: attemptId, deletedAt: null },
    include: { answers: true },
  });
  if (!a) throw Err.notFound("attempt not found");
  if (a.userId !== user.user_id && user.role !== "admin") throw Err.forbidden();
  return ser({
    id: a.id,
    quiz_id: a.quizId,
    score: Number(a.score),
    max_score: Number(a.maxScore),
    percent: Number(a.percent),
    passed: a.passed,
    answers: a.answers,
    started_at: a.startedAt.toISOString(),
    finished_at: a.finishedAt?.toISOString() ?? null,
  });
}

export async function submitAttempt(
  user: AuthUser,
  attemptId: string,
  answers: { question_id: string; answer: string }[]
) {
  const a = await prisma.quizAttempt.findFirst({
    where: { id: attemptId, deletedAt: null },
    include: {
      quiz: { include: { questions: { where: { deletedAt: null } } } },
    },
  });
  if (!a) throw Err.notFound("attempt not found");
  if (a.userId !== user.user_id) throw Err.forbidden();
  if (a.finishedAt) throw Err.invalidInput("attempt already submitted");

  let score = 0;
  const t = now();
  for (const ans of answers) {
    const q = a.quiz.questions.find((qq) => qq.id === ans.question_id);
    if (!q) continue;
    const correct =
      (q.correctAnswer || "").trim().toLowerCase() === ans.answer.trim().toLowerCase();
    const pts = correct ? Number(q.points) : 0;
    score += pts;
    await prisma.quizAttemptAnswer.create({
      data: {
        id: newId(),
        attemptId,
        questionId: q.id,
        answer: ans.answer,
        isCorrect: correct,
        pointsAwarded: pts,
        createdAt: t,
        updatedAt: t,
      },
    });
  }
  const maxScore = Number(a.maxScore) || 1;
  const percent = (score / maxScore) * 100;
  const passed = percent >= Number(a.quiz.passPercent);
  await prisma.quizAttempt.update({
    where: { id: attemptId },
    data: {
      score,
      percent,
      passed,
      finishedAt: t,
      updatedAt: t,
    },
  });
  return getAttempt(user, attemptId);
}
