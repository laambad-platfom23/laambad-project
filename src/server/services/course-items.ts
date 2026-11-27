/**
 * A6 — one request per page for everything that sits in a course's curriculum besides the lessons.
 *
 *  GET courses/:id/learning-items  (learn page: a student with access, or the course staff)
 *      → quizzes + assignments (published, in curriculum order, with the student's status and locks)
 *        + resources (old-site files, builder files/links, older lesson links).
 *  GET courses/:id/builder-items   (Course Builder: the course staff only)
 *      → every quiz / assignment / resource, drafts and not-placed ones included.
 */
import { prisma } from "@/lib/db";
import type { AuthUser } from "@/lib/auth/request";
import { byPlace, courseContext, locksFor, outline, placeIndex, placeOf } from "./curriculum";
import { courseQuizzes } from "./quiz-taking";
import { courseAssignments, parseFiles } from "./assignments";
import { builderResources, courseResources } from "./resources";
import { countForCourse as countAnnouncements } from "./announcements";

export async function learningItems(user: AuthUser, courseId: string) {
  const ctx = await courseContext(user, courseId, "member");
  const out = await outline(ctx.id);
  const locks = await locksFor(user, ctx, out);
  const pre = { ctx, out, locks };
  const [quizzes, assignments, resources, announcementCount] = await Promise.all([
    courseQuizzes(user, ctx.id, pre),
    courseAssignments(user, ctx.id, pre),
    courseResources(user, ctx.id, pre),
    countAnnouncements(ctx.id),
  ]);
  return {
    course_id: ctx.id,
    sequential: ctx.sequentialLessons,
    is_staff: ctx.staff,
    quizzes,
    assignments,
    resources,
    announcement_count: announcementCount,
  };
}

export async function builderItems(user: AuthUser, courseId: string) {
  const ctx = await courseContext(user, courseId, "staff");
  const out = await outline(ctx.id);
  const idx = placeIndex(out);
  const [quizzes, assignments, ungraded, res] = await Promise.all([
    prisma.quiz.findMany({
      where: { courseId: ctx.id, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { title: "asc" }],
      include: {
        _count: { select: { questions: { where: { deletedAt: null } }, attempts: { where: { deletedAt: null } } } },
      },
    }),
    prisma.assignment.findMany({
      where: { courseId: ctx.id, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { title: "asc" }],
      include: { _count: { select: { submissions: { where: { deletedAt: null } } } } },
    }),
    prisma.submission.groupBy({
      by: ["assignmentId"],
      where: { deletedAt: null, gradedAt: null, assignment: { courseId: ctx.id, deletedAt: null } },
      _count: { _all: true },
    }),
    builderResources(ctx.id),
  ]);
  const toGrade = new Map(ungraded.map((g) => [g.assignmentId, g._count._all]));
  return {
    course_id: ctx.id,
    quizzes: quizzes
      .map((q) => ({ q, place: placeOf(idx, q), sortOrder: q.sortOrder, createdAt: q.createdAt }))
      .sort(byPlace)
      .map(({ q, place }) => ({
        id: q.id,
        title: q.title,
        section_id: place.section_id,
        lesson_id: place.lesson_id,
        sort_order: q.sortOrder,
        placed: place.placed,
        published: q.published,
        question_count: q._count.questions,
        attempt_count: q._count.attempts,
        time_limit_secs: Number(q.timeLimitSecs),
        pass_percent: Number(q.passPercent),
        max_attempts: Number(q.maxAttempts),
        is_legacy: q.legacyWpId != null,
      })),
    assignments: assignments
      .map((a) => ({ a, place: placeOf(idx, a), sortOrder: a.sortOrder, createdAt: a.createdAt }))
      .sort(byPlace)
      .map(({ a, place }) => ({
        id: a.id,
        title: a.title,
        section_id: place.section_id,
        lesson_id: place.lesson_id,
        sort_order: a.sortOrder,
        placed: place.placed,
        published: a.published,
        due_at: a.dueAt?.toISOString() ?? null,
        max_points: Number(a.maxPoints),
        pass_points: a.passPoints == null ? null : Number(a.passPoints),
        file_count: parseFiles(a.attachmentsJson).length,
        submission_count: a._count.submissions,
        ungraded_count: toGrade.get(a.id) ?? 0,
        is_legacy: a.legacyWpId != null,
      })),
    resources: res.resources,
    legacy_resources: res.legacy,
  };
}
