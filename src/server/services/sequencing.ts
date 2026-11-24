/**
 * A5 — Lesson sequencing + lesson access.
 *  - courses.sequential_lessons = true: a student opens a lesson only after every earlier lesson
 *    (course order: section, then lesson) is completed. Preview lessons are always open.
 *  - Students without access to the course get no lesson content (preview lessons excepted).
 * Staff (admin, the course instructor) always see everything.
 */
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { findBestEnrollment, hasCourseAccess } from "@/server/enrollment-status";

export type LessonAccess = { staff: boolean; access: boolean; sequential: boolean; locked: Set<string> };

/** Which lessons this user may open in a course. */
export async function lessonAccess(user: AuthUser, course: { id: string; instructorId: string; sequentialLessons: boolean }): Promise<LessonAccess> {
  const staff = user.role === "admin" || course.instructorId === user.user_id;
  if (staff) return { staff, access: true, sequential: course.sequentialLessons, locked: new Set() };
  const e = await findBestEnrollment(user.user_id, course.id);
  const access = !!e && hasCourseAccess(e);
  if (!access || !course.sequentialLessons) return { staff, access, sequential: course.sequentialLessons, locked: new Set() };

  const lessons = await prisma.lesson.findMany({
    where: { deletedAt: null, section: { courseId: course.id, deletedAt: null } },
    orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    select: { id: true, isPreview: true },
  });
  const done = new Set(
    (
      await prisma.lessonProgress.findMany({
        where: { userId: user.user_id, completed: true, deletedAt: null, lessonId: { in: lessons.map((l) => l.id) } },
        select: { lessonId: true },
      })
    ).map((p) => p.lessonId)
  );
  const locked = new Set<string>();
  let allBeforeDone = true;
  for (const l of lessons) {
    if (!allBeforeDone && !l.isPreview && !done.has(l.id)) locked.add(l.id);
    if (!done.has(l.id)) allBeforeDone = false;
  }
  return { staff, access, sequential: true, locked };
}

/** Throws 403 lesson_locked when a sequential course has an earlier lesson still to complete. */
export async function assertLessonOpen(user: AuthUser, lessonId: string) {
  const l = await prisma.lesson.findFirst({
    where: { id: lessonId, deletedAt: null },
    select: { id: true, section: { select: { course: { select: { id: true, instructorId: true, sequentialLessons: true } } } } },
  });
  if (!l) return; // the caller answers 404
  const course = l.section.course;
  if (!course.sequentialLessons) return;
  const acc = await lessonAccess(user, course);
  if (acc.locked.has(l.id)) {
    throw new ApiError(403, "lesson_locked", "Complete the previous lesson first — this course opens lessons in order.");
  }
}

type MappedLesson = Record<string, unknown> & { id: string; is_preview?: boolean };
type MappedCourse = { sections?: { lessons?: MappedLesson[] }[] } & Record<string, unknown>;

/** Remove the content of lessons the user may not open, and mark them. */
export function applyLessonAccess<T extends MappedCourse>(course: T, acc: LessonAccess): T {
  if (acc.staff) return course;
  for (const s of course.sections ?? []) {
    s.lessons = (s.lessons ?? []).map((l) => {
      const noAccess = !acc.access && !l.is_preview;
      const locked = acc.locked.has(l.id);
      if (!noAccess && !locked) return l;
      return {
        ...l,
        content: undefined,
        video_url: undefined,
        video_provider: undefined,
        attachments_json: undefined,
        vdocipher_video_id: undefined,
        has_vdocipher: false,
        locked: locked || undefined,
        requires_enrollment: noAccess || undefined,
      };
    });
  }
  return { ...course, sequential_lessons: acc.sequential };
}
