import { prisma } from "@/lib/db";
import { courseCoverUrl } from "@/server/services/courses";
import { userPhotoUrl } from "@/server/legacy-uploads";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { courseIssuesCertificate } from "@/server/legacy-course-certificates";
import {
  apiEnrollmentStatus,
  apiPaymentStatus,
  hasCourseAccess,
  isCancelledStatus,
} from "@/server/enrollment-status";

/** @param courseSlug optional: only that course (the learn page needs one enrollment, not all of them) */
export async function overview(userId: string, courseSlug?: string | null) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, deletedAt: null, ...(courseSlug ? { course: { slug: courseSlug } } : {}) },
    include: {
      course: {
        include: { instructor: { select: { id: true, name: true, avatarUrl: true } } },
      },
    },
    orderBy: { enrolledAt: "desc" },
  });

  const certCount = await prisma.certificate.count({
    where: { userId, deletedAt: null },
  });

  // G3: one card per course (WordPress created an enrollment per order), cancelled ones hidden.
  const best = new Map<string, (typeof enrollments)[number]>();
  for (const e of enrollments) {
    if (isCancelledStatus(e.status) || !e.course) continue;
    const cur = best.get(e.courseId);
    if (!cur || (!hasCourseAccess(cur) && hasCourseAccess(e))) best.set(e.courseId, e);
  }
  const visible = [...best.values()];
  const active = visible.filter((e) => apiEnrollmentStatus(e) === "active");
  const completed = visible.filter((e) => apiEnrollmentStatus(e) === "completed");

  // Batched counts (a migrated student can have dozens of courses).
  const courseIds = visible.map((e) => e.courseId);
  const [lessonRows, doneRows] = await Promise.all([
    prisma.lesson.findMany({
      where: { deletedAt: null, section: { courseId: { in: courseIds }, deletedAt: null } },
      select: { id: true, section: { select: { courseId: true } } },
    }),
    // G7: progress is per user + lesson
    prisma.lessonProgress.findMany({
      where: { userId, completed: true, deletedAt: null },
      select: { lessonId: true },
    }),
  ]);
  const done = new Set(doneRows.map((r) => r.lessonId));
  const certByCourse = new Map(
    (
      await prisma.certificate.findMany({
        where: { userId, deletedAt: null },
        select: { id: true, courseId: true },
      })
    ).map((c) => [c.courseId, c.id])
  );
  const totals = new Map<string, { total: number; done: number }>();
  for (const l of lessonRows) {
    const t = totals.get(l.section.courseId) ?? { total: 0, done: 0 };
    t.total += 1;
    if (done.has(l.id)) t.done += 1;
    totals.set(l.section.courseId, t);
  }

  const courses = [];
  for (const e of visible) {
    if (!e.course) continue;
    const totalLessons = totals.get(e.courseId)?.total ?? 0;
    const completedLessons = totals.get(e.courseId)?.done ?? 0;
    courses.push({
      course_id: e.courseId,
      course_title: decodeHtmlEntities(e.course.title),
      course_slug: e.course.slug,
      description: e.course.description || undefined,
      cover_image_url: courseCoverUrl(e.course) ?? undefined,
      instructor_name: e.course.instructor?.name || "",
      instructor_avatar_url: e.course.instructor
        ? userPhotoUrl(e.course.instructor.id, e.course.instructor.avatarUrl) ?? undefined
        : undefined,
      enrolled_at: e.enrolledAt.toISOString(),
      status: apiEnrollmentStatus(e),
      payment_status: apiPaymentStatus(e),
      completed_at: e.completedAt?.toISOString() ?? null,
      total_lessons: totalLessons,
      completed_lessons: completedLessons,
      completion_percent: totalLessons ? (completedLessons / totalLessons) * 100 : 0,
      certificate_id: certByCourse.get(e.courseId) ?? null,
      // every lesson done but no certificate yet (Tutor needed a "Complete course" click): offer it
      certificate_available:
        !certByCourse.has(e.courseId) &&
        hasCourseAccess(e) &&
        totalLessons > 0 &&
        completedLessons >= totalLessons &&
        courseIssuesCertificate(e.courseId),
    });
  }

  return {
    total_enrolled: visible.length,
    active_courses: active.length,
    completed_courses: completed.length,
    total_certificates: certCount,
    courses,
  };
}

export async function instituteStats(user: AuthUser) {
  const allowed =
    user.role === "admin" ||
    user.role === "instructor" ||
    user.perms.includes("users.write");
  if (!allowed) throw Err.forbidden();

  const [learners, programmes, researchPapers, assignmentTasks] = await Promise.all([
    prisma.enrollment.findMany({
      where: { deletedAt: null },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.course.count({ where: { status: "published", deletedAt: null } }),
    prisma.researchPaper.count({ where: { deletedAt: null } }),
    prisma.assignment.count({ where: { deletedAt: null } }),
  ]);

  const months: { month: string; count: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const count = await prisma.enrollment.count({
      where: { deletedAt: null, enrolledAt: { gte: d, lt: next } },
    });
    months.push({
      month: d.toLocaleString("en", { month: "short" }),
      count,
    });
  }

  const weekly: { day: string; submissions: number; reviews: number }[] = [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const [submissions, reviews] = await Promise.all([
      prisma.submission.count({
        where: { deletedAt: null, submittedAt: { gte: day, lt: next } },
      }),
      prisma.researchReview.count({
        where: { deletedAt: null, createdAt: { gte: day, lt: next } },
      }),
    ]);
    weekly.push({ day: dayNames[day.getDay()], submissions, reviews });
  }

  let learnersMomPct: number | undefined;
  if (months.length >= 2) {
    const a = months[months.length - 2].count;
    const b = months[months.length - 1].count;
    learnersMomPct = a === 0 ? (b > 0 ? 100 : 0) : ((b - a) / a) * 100;
  }

  return {
    counts: {
      learners: learners.length,
      programmes,
      research_papers: researchPapers,
      assignment_tasks: assignmentTasks,
    },
    enrollment_trend: months,
    weekly_activity: weekly,
    learners_mom_pct: learnersMomPct,
  };
}
