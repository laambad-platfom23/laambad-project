/**
 * A2 — learning features: daily streak, course retake.
 * Tables: learning_days, enrollments.retake_count / last_retake_at (prisma/app-sql/A2-student-features.sql).
 */
import { prisma, newId, now } from "@/lib/db";
import { Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { findBestEnrollment, hasCourseAccess } from "@/server/enrollment-status";
import { assertUuid } from "@/lib/uuid";

/** The learner's calendar: Somalia (UTC+3, no daylight saving). */
const TZ_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" of the Mogadishu day that contains `t`. */
export function learningDayKey(t: Date): string {
  return new Date(t.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}
function dayKeyToDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}
function addDays(key: string, n: number): string {
  return new Date(dayKeyToDate(key).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Record learning activity for today (idempotent per day; counts activities).
 * Never throws: a streak write must not break saving lesson progress.
 */
export async function recordLearningActivity(userId: string, t: Date = now()) {
  try {
    const day = dayKeyToDate(learningDayKey(t));
    await prisma.learningDay.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, activityCount: 1, createdAt: t, updatedAt: t },
      update: { activityCount: { increment: 1 }, updatedAt: t },
    });
  } catch (e) {
    console.error("[learning] streak write failed:", (e as { code?: string })?.code ?? (e as Error)?.message);
  }
}

/**
 * Current streak = consecutive learning days ending today (or yesterday: the streak is still alive
 * until the end of today). Also the longest streak and the last 28 days for a small calendar.
 */
export async function streak(userId: string) {
  const rows = await prisma.learningDay.findMany({
    where: { userId },
    select: { day: true, activityCount: true },
    orderBy: { day: "desc" },
    take: 400,
  });
  const days = new Set(rows.map((r) => r.day.toISOString().slice(0, 10)));
  const today = learningDayKey(now());

  let current = 0;
  let cursor = days.has(today) ? today : addDays(today, -1);
  while (days.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of [...days].sort()) {
    run = prev && addDays(prev, 1) === key ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = key;
  }

  const last28 = Array.from({ length: 28 }, (_, i) => {
    const key = addDays(today, i - 27);
    return { day: key, active: days.has(key) };
  });

  return {
    current_streak: current,
    longest_streak: longest,
    active_today: days.has(today),
    total_active_days: days.size,
    today,
    last_28_days: last28,
  };
}

/**
 * Course retake: a student who finished a course starts it again. Lesson progress is reset with
 * UPDATE (rows are kept), the previous completion is written to audit_logs first, and the
 * certificate is kept.
 */
export async function retakeCourse(user: AuthUser, courseId: string, meta?: { ip?: string; userAgent?: string }) {
  assertUuid(courseId, "course not found");
  const enrollment = await findBestEnrollment(user.user_id, courseId);
  if (!enrollment || !hasCourseAccess(enrollment)) throw Err.forbidden();

  const lessonIds = (
    await prisma.lesson.findMany({
      where: { deletedAt: null, section: { courseId, deletedAt: null } },
      select: { id: true },
    })
  ).map((l) => l.id);
  const progress = await prisma.lessonProgress.findMany({
    where: { userId: user.user_id, lessonId: { in: lessonIds }, deletedAt: null },
    select: { id: true, lessonId: true, completed: true, completedPercent: true, completedAt: true },
  });
  const doneCount = progress.filter((p) => p.completed).length;
  const finished = !!enrollment.completedAt || (lessonIds.length > 0 && doneCount >= lessonIds.length);
  if (!finished) throw Err.conflict("not_completed", "finish the course before starting it again");

  const t = now();
  await prisma.$transaction([
    prisma.auditLog.create({
      data: {
        id: newId(),
        createdAt: t,
        userId: user.user_id,
        roleSlug: user.role,
        method: "POST",
        path: `/api/v1/courses/${courseId}/retake`,
        statusCode: BigInt(200),
        clientIp: meta?.ip?.slice(0, 128) || null,
        userAgent: meta?.userAgent?.slice(0, 512) || null,
        metadata: {
          event: "course_retake",
          enrollment_id: enrollment.id,
          previous_completed_at: enrollment.completedAt?.toISOString() ?? null,
          previous_retake_count: enrollment.retakeCount,
          previous_progress: progress.map((p) => ({
            lesson_id: p.lessonId,
            completed: p.completed,
            percent: Number(p.completedPercent),
            completed_at: p.completedAt?.toISOString() ?? null,
          })),
        },
      },
    }),
    prisma.lessonProgress.updateMany({
      where: { id: { in: progress.map((p) => p.id) } },
      data: { completed: false, completedPercent: BigInt(0), completedAt: null, updatedAt: t },
    }),
    prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { completedAt: null, retakeCount: { increment: 1 }, lastRetakeAt: t, updatedAt: t },
    }),
  ]);
  return { ok: true, retake_count: enrollment.retakeCount + 1, lessons_reset: progress.length };
}
