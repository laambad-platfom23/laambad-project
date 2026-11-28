/**
 * Phase 2 test — what a student must do to get a course's certificate:
 *   1. every lesson completed;
 *   2. every quiz of the course passed (a quiz with questions, shown in the curriculum);
 *   3. every assignment of the course passed — graded at or above its pass points. While an answer is
 *      still waiting for the instructor's grade, there is no certificate yet.
 * The same rules decide when the course counts as completed.
 */
import { prisma } from "@/lib/db";
import { courseContext, outline, placeIndex, placeOf } from "./curriculum";
import type { AuthUser } from "@/lib/auth/request";
import { courseIssuesCertificate } from "@/server/legacy-course-certificates";
import { hasCourseAccess } from "@/server/enrollment-status";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { courseCoverUrl } from "./courses";

export type Requirements = {
  lessons: { done: number; total: number };
  quizzes: { passed: number; total: number; left: { id: string; title: string }[] };
  assignments: {
    passed: number;
    total: number;
    /** submitted, waiting for a grade */
    pending: { id: string; title: string }[];
    /** not submitted yet, or graded below the pass points */
    left: { id: string; title: string; status: "not_submitted" | "not_passed" }[];
  };
  ready: boolean;
};

const n = (v: unknown) => (v == null ? null : Number(v));

export async function requirements(userId: string, courseId: string): Promise<Requirements> {
  const out = await outline(courseId);
  const idx = placeIndex(out);
  const lessonIds = out.flatMap((s) => s.lessons.map((l) => l.id));
  const [done, quizzes, assignments] = await Promise.all([
    lessonIds.length
      ? prisma.lessonProgress.count({ where: { userId, lessonId: { in: lessonIds }, completed: true, deletedAt: null } })
      : Promise.resolve(0),
    prisma.quiz.findMany({
      where: { courseId, deletedAt: null, published: true },
      select: { id: true, title: true, sectionId: true, lessonId: true, _count: { select: { questions: { where: { deletedAt: null } } } } },
    }),
    prisma.assignment.findMany({
      where: { courseId, deletedAt: null, published: true, sectionId: { not: null } },
      select: { id: true, title: true, sectionId: true, lessonId: true, passPoints: true },
    }),
  ]);
  // only what the student can see in the curriculum (same rules as the Quizzes / Assignments tabs)
  const qs = quizzes.filter((q) => q._count.questions > 0 && (placeOf(idx, q).placed || !q.sectionId));
  const as = assignments.filter((a) => placeOf(idx, a).placed);

  const [passedRows, subs] = await Promise.all([
    qs.length
      ? prisma.quizAttempt.findMany({ where: { userId, quizId: { in: qs.map((q) => q.id) }, passed: true, deletedAt: null }, select: { quizId: true } })
      : Promise.resolve([]),
    as.length
      ? prisma.submission.findMany({
          where: { studentId: userId, assignmentId: { in: as.map((a) => a.id) }, deletedAt: null },
          orderBy: { submittedAt: "desc" },
          select: { assignmentId: true, grade: true, gradedAt: true },
        })
      : Promise.resolve([]),
  ]);
  const passedQuiz = new Set(passedRows.map((r) => r.quizId));
  const quizLeft = qs.filter((q) => !passedQuiz.has(q.id)).map((q) => ({ id: q.id, title: q.title }));

  const pending: Requirements["assignments"]["pending"] = [];
  const left: Requirements["assignments"]["left"] = [];
  let aPassed = 0;
  for (const a of as) {
    const mine = subs.filter((s) => s.assignmentId === a.id);
    const pass = n(a.passPoints) ?? 0;
    if (mine.some((s) => s.gradedAt && s.grade != null && Number(s.grade) >= pass)) {
      aPassed++;
      continue;
    }
    const latest = mine[0];
    if (latest && !latest.gradedAt) pending.push({ id: a.id, title: a.title });
    else left.push({ id: a.id, title: a.title, status: latest ? "not_passed" : "not_submitted" });
  }

  const lessons = { done: Math.min(done, lessonIds.length), total: lessonIds.length };
  return {
    lessons,
    quizzes: { passed: qs.length - quizLeft.length, total: qs.length, left: quizLeft },
    assignments: { passed: aPassed, total: as.length, pending, left },
    ready: lessons.total > 0 && lessons.done >= lessons.total && !quizLeft.length && !pending.length && !left.length,
  };
}

/** One sentence for the student: what still stands between them and the certificate. */
export function missingMessage(r: Requirements) {
  if (r.lessons.total === 0) return "this course has no lessons yet";
  if (r.lessons.done < r.lessons.total) return `complete all lessons first (${r.lessons.done}/${r.lessons.total} done)`;
  if (r.quizzes.left.length) return `pass every quiz first — still to pass: ${r.quizzes.left.map((q) => q.title).join(", ")}`;
  if (r.assignments.left.length) return `pass every assignment first — still to do: ${r.assignments.left.map((a) => a.title).join(", ")}`;
  if (r.assignments.pending.length)
    return `your assignment is waiting for the instructor's grade: ${r.assignments.pending.map((a) => a.title).join(", ")} — the certificate comes once it is passed`;
  return "";
}

// ── for the student's pages ──

/** Learn page → Gradebook: the certificate checklist of one course. */
export async function forCourse(user: AuthUser, courseId: string) {
  const ctx = await courseContext(user, courseId, "member");
  const [req, cert] = await Promise.all([
    requirements(user.user_id, ctx.id),
    prisma.certificate.findFirst({ where: { userId: user.user_id, courseId: ctx.id, deletedAt: null }, select: { id: true } }),
  ]);
  return { ...req, gives_certificate: courseIssuesCertificate(ctx.id), certificate_id: cert?.id ?? null, message: req.ready ? "" : missingMessage(req) };
}

/** My certificates → "Almost there": courses I have started, with what is left (most recent first, 12 at most). */
export async function inProgress(user: AuthUser) {
  const rows = await prisma.enrollment.findMany({
    where: { userId: user.user_id, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { courseId: true, status: true, paymentStatus: true, completedAt: true },
    take: 200,
  });
  const have = new Set(
    (await prisma.certificate.findMany({ where: { userId: user.user_id, deletedAt: null }, select: { courseId: true } })).map((c) => c.courseId)
  );
  const ids = [...new Set(rows.filter((r) => hasCourseAccess(r) && !have.has(r.courseId) && courseIssuesCertificate(r.courseId)).map((r) => r.courseId))];
  // only courses the student has really started (some lesson progress)
  const started = new Set(
    (
      await prisma.lessonProgress.findMany({
        where: { userId: user.user_id, deletedAt: null, lesson: { section: { courseId: { in: ids } } } },
        select: { lesson: { select: { section: { select: { courseId: true } } } } },
        distinct: ["lessonId"],
        take: 2000,
      })
    ).map((p) => p.lesson.section.courseId)
  );
  const pick = ids.filter((id) => started.has(id)).slice(0, 12);
  const courses = await prisma.course.findMany({
    where: { id: { in: pick }, deletedAt: null },
    select: { id: true, title: true, slug: true, coverUrl: true, legacyThumbnailId: true },
  });
  const out = [];
  for (const id of pick) {
    const c = courses.find((x) => x.id === id);
    if (!c) continue;
    const req = await requirements(user.user_id, id);
    out.push({ course: { id: c.id, title: decodeHtmlEntities(c.title), slug: c.slug, cover_image_url: courseCoverUrl(c) }, ...req, message: req.ready ? "" : missingMessage(req) });
  }
  return { data: out };
}
