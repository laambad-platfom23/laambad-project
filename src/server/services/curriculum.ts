/**
 * A6 — where quizzes, assignments and resources sit in a course, and who may open them.
 *
 *  - An item sits under a lesson (lesson_id + its section_id) or, for 21 old-site quizzes that were
 *    first in their topic (mostly "final exam" topics without lessons), at the top of a topic.
 *  - An assignment without a topic is not in the curriculum: students never see it (38 old-site
 *    assignments sat in topics of deleted courses), the course staff see it as "not placed".
 *  - Sequential courses (A5): an item under a locked lesson is locked too; a topic-level item is locked
 *    until every lesson of the earlier topics is completed.
 */
import { prisma } from "@/lib/db";
import { ApiError, Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { findBestEnrollment, hasCourseAccess } from "@/server/enrollment-status";
import { assertUuid, isUuid } from "@/lib/uuid";

export type CourseCtx = {
  id: string;
  slug: string;
  title: string;
  instructorId: string;
  sequentialLessons: boolean;
  /** admin or the course instructor */
  staff: boolean;
};

/** The course + the caller's role in it. `member`: staff or a student with access; `staff`: staff only. */
export async function courseContext(user: AuthUser, courseId: string, need: "member" | "staff"): Promise<CourseCtx> {
  assertUuid(courseId, "course not found");
  const c = await prisma.course.findFirst({
    where: { id: courseId, deletedAt: null },
    select: { id: true, slug: true, title: true, instructorId: true, sequentialLessons: true },
  });
  if (!c) throw Err.notFound("course not found");
  const staff = user.role === "admin" || c.instructorId === user.user_id;
  if (!staff) {
    if (need === "staff") throw Err.forbidden();
    const e = await findBestEnrollment(user.user_id, c.id);
    if (!e || !hasCourseAccess(e)) throw Err.forbidden();
  }
  return { ...c, staff };
}

export type Outline = {
  id: string;
  title: string;
  sortOrder: bigint;
  lessons: { id: string; title: string; sortOrder: bigint; isPreview: boolean }[];
}[];

/** Live topics and lessons in course order (the same order as the course payload). */
export async function outline(courseId: string): Promise<Outline> {
  return prisma.section.findMany({
    where: { courseId, deletedAt: null },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      title: true,
      sortOrder: true,
      lessons: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        select: { id: true, title: true, sortOrder: true, isPreview: true },
      },
    },
  });
}

export type Place = {
  section_id: string | null;
  section_title: string | null;
  lesson_id: string | null;
  lesson_title: string | null;
  /** position in the course: topic-level items before the topic's first lesson, lesson items right after their lesson */
  pos: number;
  /** false when its topic is gone (deleted) or it never had one */
  placed: boolean;
};

export type PlaceIndex = {
  sections: Map<string, { title: string; index: number }>;
  lessons: Map<string, { title: string; sectionId: string; pos: number }>;
};

export function placeIndex(out: Outline): PlaceIndex {
  const sections = new Map<string, { title: string; index: number }>();
  const lessons = new Map<string, { title: string; sectionId: string; pos: number }>();
  out.forEach((s, si) => {
    sections.set(s.id, { title: s.title, index: si });
    s.lessons.forEach((l, li) => lessons.set(l.id, { title: l.title, sectionId: s.id, pos: si * 10_000 + li + 1 }));
  });
  return { sections, lessons };
}

/** Where an item shows: under its lesson when that lesson is live, else at the top of its topic. */
export function placeOf(idx: PlaceIndex, item: { sectionId: string | null; lessonId: string | null }): Place {
  const lesson = item.lessonId ? idx.lessons.get(item.lessonId) : undefined;
  if (lesson && (!item.sectionId || item.sectionId === lesson.sectionId)) {
    return {
      section_id: lesson.sectionId,
      section_title: idx.sections.get(lesson.sectionId)?.title ?? null,
      lesson_id: item.lessonId,
      lesson_title: lesson.title,
      pos: lesson.pos + 0.5,
      placed: true,
    };
  }
  const section = item.sectionId ? idx.sections.get(item.sectionId) : undefined;
  if (section) {
    return { section_id: item.sectionId, section_title: section.title, lesson_id: null, lesson_title: null, pos: section.index * 10_000, placed: true };
  }
  return { section_id: null, section_title: null, lesson_id: null, lesson_title: null, pos: Number.MAX_SAFE_INTEGER, placed: false };
}

export type Locks = { lessons: Set<string>; sections: Set<string> };
const NO_LOCKS: Locks = { lessons: new Set(), sections: new Set() };

/** Sequential courses: which lessons (and topic-level items of which topics) this student cannot open yet. */
export async function locksFor(user: AuthUser, ctx: CourseCtx, out: Outline): Promise<Locks> {
  if (ctx.staff || !ctx.sequentialLessons) return NO_LOCKS;
  const ids = out.flatMap((s) => s.lessons.map((l) => l.id));
  const done = new Set(
    ids.length
      ? (
          await prisma.lessonProgress.findMany({
            where: { userId: user.user_id, completed: true, deletedAt: null, lessonId: { in: ids } },
            select: { lessonId: true },
          })
        ).map((p) => p.lessonId)
      : []
  );
  const locks: Locks = { lessons: new Set(), sections: new Set() };
  let allBeforeDone = true;
  for (const s of out) {
    if (!allBeforeDone) locks.sections.add(s.id);
    for (const l of s.lessons) {
      if (!allBeforeDone && !l.isPreview && !done.has(l.id)) locks.lessons.add(l.id);
      if (!done.has(l.id)) allBeforeDone = false;
    }
  }
  return locks;
}

export function isLocked(locks: Locks, place: Place) {
  if (place.lesson_id) return locks.lessons.has(place.lesson_id);
  return place.section_id ? locks.sections.has(place.section_id) : false;
}

/** Throws 403 item_locked when a sequential course has earlier lessons to complete first. */
export async function assertItemOpen(user: AuthUser, ctx: CourseCtx, item: { sectionId: string | null; lessonId: string | null }) {
  if (ctx.staff || !ctx.sequentialLessons) return;
  const out = await outline(ctx.id);
  const place = placeOf(placeIndex(out), item);
  if (isLocked(await locksFor(user, ctx, out), place)) {
    throw new ApiError(403, "item_locked", "Complete the earlier lessons first — this course opens lessons in order.");
  }
}

/**
 * Quizzes and assignments under the same lesson (or at the top of the same topic) share one order,
 * like Tutor's menu_order: a new or moved item goes to the end.
 */
export async function nextItemOrder(place: { sectionId: string | null; lessonId: string | null }) {
  if (!place.sectionId && !place.lessonId) return 0;
  const where = place.lessonId
    ? { lessonId: place.lessonId, deletedAt: null }
    : { sectionId: place.sectionId, lessonId: null, deletedAt: null };
  const [q, a] = await Promise.all([
    prisma.quiz.aggregate({ where, _max: { sortOrder: true } }),
    prisma.assignment.aggregate({ where, _max: { sortOrder: true } }),
  ]);
  const max = Math.max(q._max.sortOrder ?? -1, a._max.sortOrder ?? -1);
  return max + 1;
}

/** Sort items by place, then their shared order, then age. */
export function byPlace<T extends { place: Place; sortOrder: number; createdAt: Date | null }>(a: T, b: T) {
  return a.place.pos - b.place.pos || a.sortOrder - b.sortOrder || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
}

/**
 * Builder input → stored placement. A lesson decides its topic; a topic alone is allowed for quizzes
 * (topic-level). Both must belong to the course and be live.
 */
export async function resolvePlacement(
  courseId: string,
  input: { lesson_id?: string | null; section_id?: string | null },
  opts: { requireLesson?: boolean } = {}
): Promise<{ sectionId: string | null; lessonId: string | null }> {
  if (input.lesson_id) {
    if (!isUuid(input.lesson_id)) throw Err.invalidInput("invalid lesson");
    const l = await prisma.lesson.findFirst({
      where: { id: input.lesson_id, deletedAt: null, section: { courseId, deletedAt: null } },
      select: { id: true, sectionId: true },
    });
    if (!l) throw Err.invalidInput("the lesson is not part of this course");
    return { sectionId: l.sectionId, lessonId: l.id };
  }
  if (opts.requireLesson) throw Err.invalidInput("choose the lesson this item belongs to");
  if (input.section_id) {
    if (!isUuid(input.section_id)) throw Err.invalidInput("invalid topic");
    const s = await prisma.section.findFirst({ where: { id: input.section_id, courseId, deletedAt: null }, select: { id: true } });
    if (!s) throw Err.invalidInput("the topic is not part of this course");
    return { sectionId: s.id, lessonId: null };
  }
  return { sectionId: null, lessonId: null };
}
