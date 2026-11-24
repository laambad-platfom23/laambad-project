/**
 * A2 — Group discussion: one "class room" per course. Members = students with access to the course,
 * the course instructor and admins. Messages are plain text (rendered as text, never as HTML).
 */
import { prisma, newId, now } from "@/lib/db";
import { ApiError, Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { findBestEnrollment, hasCourseAccess } from "@/server/enrollment-status";
import { userPhotoUrl } from "@/server/legacy-uploads";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { assertUuid, isUuid } from "@/lib/uuid";

const MAX_BODY = 2000;

async function courseForRoom(courseIdOrSlug: string) {
  const course = await prisma.course.findFirst({
    where: { deletedAt: null, ...(isUuid(courseIdOrSlug) ? { id: courseIdOrSlug } : { slug: courseIdOrSlug }) },
    select: { id: true, slug: true, title: true, instructorId: true },
  });
  if (!course) throw Err.notFound("course not found");
  return course;
}

/** Throws 403 unless the user belongs to the course's class. Returns whether they moderate it. */
async function requireMember(user: AuthUser, course: { id: string; instructorId: string }) {
  if (user.role === "admin") return { moderator: true };
  if (course.instructorId === user.user_id) return { moderator: true };
  const e = await findBestEnrollment(user.user_id, course.id);
  if (!e || !hasCourseAccess(e)) throw Err.forbidden();
  return { moderator: false };
}

type Row = {
  id: string;
  parentId: string | null;
  body: string;
  isPinned: boolean;
  createdAt: Date;
  userId: string;
  deletedAt: Date | null;
  user: { id: string; name: string; avatarUrl: string | null; role: { slug: string } };
};

function view(m: Row, me: AuthUser, moderator: boolean, instructorId: string) {
  const deleted = !!m.deletedAt;
  return {
    id: m.id,
    parent_id: m.parentId,
    body: deleted ? "" : m.body,
    deleted,
    is_pinned: m.isPinned,
    created_at: m.createdAt.toISOString(),
    author: {
      id: m.user.id,
      name: m.user.name,
      avatar_url: userPhotoUrl(m.user.id, m.user.avatarUrl),
      is_staff: m.user.role.slug === "admin" || m.user.id === instructorId,
    },
    can_delete: !deleted && (moderator || m.userId === me.user_id),
  };
}

const SELECT = {
  id: true,
  parentId: true,
  body: true,
  isPinned: true,
  createdAt: true,
  userId: true,
  deletedAt: true,
  user: { select: { id: true, name: true, avatarUrl: true, role: { select: { slug: true } } } },
} as const;

/** Newest 50 top-level threads (pinned first) with their replies; `before` pages further back. */
export async function listMessages(user: AuthUser, courseIdOrSlug: string, before?: string | null) {
  const course = await courseForRoom(courseIdOrSlug);
  const { moderator } = await requireMember(user, course);
  const beforeDate = before ? new Date(before) : null;
  const threads = await prisma.courseDiscussionMessage.findMany({
    where: {
      courseId: course.id,
      parentId: null,
      ...(beforeDate && !Number.isNaN(beforeDate.getTime()) ? { createdAt: { lt: beforeDate } } : {}),
    },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: 50,
    select: SELECT,
  });
  const replies = threads.length
    ? await prisma.courseDiscussionMessage.findMany({
        where: { parentId: { in: threads.map((t) => t.id) }, deletedAt: null },
        orderBy: { createdAt: "asc" },
        take: 1000,
        select: SELECT,
      })
    : [];
  const byParent = new Map<string, Row[]>();
  for (const r of replies) {
    const list = byParent.get(r.parentId!) ?? [];
    list.push(r);
    byParent.set(r.parentId!, list);
  }
  const members = await prisma.enrollment.findMany({
    where: { courseId: course.id, deletedAt: null, status: { in: ["active", "completed"] } },
    select: { userId: true },
    distinct: ["userId"],
  });
  return {
    course: { id: course.id, slug: course.slug, title: decodeHtmlEntities(course.title) },
    member_count: members.length,
    is_moderator: moderator,
    data: threads
      // a deleted thread stays only as a placeholder when it still has replies
      .filter((t) => !t.deletedAt || (byParent.get(t.id)?.length ?? 0) > 0)
      .map((t) => ({
        ...view(t, user, moderator, course.instructorId),
        replies: (byParent.get(t.id) ?? []).map((r) => view(r, user, moderator, course.instructorId)),
      })),
    has_more: threads.length === 50,
  };
}

export async function postMessage(
  user: AuthUser,
  courseIdOrSlug: string,
  input: { body?: string; parent_id?: string | null }
) {
  const course = await courseForRoom(courseIdOrSlug);
  const { moderator } = await requireMember(user, course);
  const body = String(input.body ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  if (!body) throw Err.invalidInput("message is empty");
  if (body.length > MAX_BODY) throw Err.invalidInput(`message is too long (max ${MAX_BODY} characters)`);

  let parentId: string | null = null;
  if (input.parent_id) {
    assertUuid(String(input.parent_id), "message not found");
    const parent = await prisma.courseDiscussionMessage.findFirst({
      where: { id: String(input.parent_id), courseId: course.id, deletedAt: null },
      select: { id: true, parentId: true },
    });
    if (!parent) throw Err.notFound("message not found");
    parentId = parent.parentId ?? parent.id; // one level of replies
  }

  // simple flood guard: 10 messages per minute per user per course
  const t = now();
  const recent = await prisma.courseDiscussionMessage.count({
    where: { courseId: course.id, userId: user.user_id, createdAt: { gte: new Date(t.getTime() - 60_000) } },
  });
  if (recent >= 10) throw new ApiError(429, "too_many_requests", "You are sending messages too fast. Wait a moment.");

  const row = await prisma.courseDiscussionMessage.create({
    data: { id: newId(), courseId: course.id, userId: user.user_id, parentId, body, createdAt: t, updatedAt: t },
    select: SELECT,
  });
  return { ...view(row, user, moderator, course.instructorId), replies: [] };
}

/** Soft delete: the author or a moderator. */
export async function deleteMessage(user: AuthUser, messageId: string) {
  assertUuid(messageId, "message not found");
  const m = await prisma.courseDiscussionMessage.findFirst({
    where: { id: messageId, deletedAt: null },
    select: { id: true, userId: true, course: { select: { id: true, instructorId: true } } },
  });
  if (!m) throw Err.notFound("message not found");
  const { moderator } = await requireMember(user, m.course);
  if (!moderator && m.userId !== user.user_id) throw Err.forbidden();
  await prisma.courseDiscussionMessage.update({ where: { id: m.id }, data: { deletedAt: now(), updatedAt: now() } });
  return { ok: true };
}

/** Pin / unpin a thread: moderators only. */
export async function pinMessage(user: AuthUser, messageId: string, pinned: boolean) {
  assertUuid(messageId, "message not found");
  const m = await prisma.courseDiscussionMessage.findFirst({
    where: { id: messageId, deletedAt: null, parentId: null },
    select: { id: true, course: { select: { id: true, instructorId: true } } },
  });
  if (!m) throw Err.notFound("message not found");
  const { moderator } = await requireMember(user, m.course);
  if (!moderator) throw Err.forbidden();
  await prisma.courseDiscussionMessage.update({ where: { id: m.id }, data: { isPinned: !!pinned, updatedAt: now() } });
  return { ok: true };
}

/** The classes (courses) the user can open: for the "Group discussion" list page. */
export async function myRooms(user: AuthUser) {
  let courses: { id: string; slug: string; title: string }[];
  if (user.role === "admin" || user.role === "instructor") {
    courses = await prisma.course.findMany({
      where: { deletedAt: null, ...(user.role === "instructor" ? { instructorId: user.user_id } : {}) },
      select: { id: true, slug: true, title: true },
      orderBy: { title: "asc" },
      take: 300,
    });
  } else {
    const rows = await prisma.enrollment.findMany({
      where: { userId: user.user_id, deletedAt: null },
      select: {
        status: true,
        paymentStatus: true,
        completedAt: true,
        course: { select: { id: true, slug: true, title: true, deletedAt: true } },
      },
    });
    const seen = new Map<string, { id: string; slug: string; title: string }>();
    for (const r of rows) {
      if (!r.course || r.course.deletedAt || !hasCourseAccess(r)) continue;
      seen.set(r.course.id, { id: r.course.id, slug: r.course.slug, title: r.course.title });
    }
    courses = [...seen.values()];
  }
  const ids = courses.map((c) => c.id);
  const latest = ids.length
    ? await prisma.courseDiscussionMessage.groupBy({
        by: ["courseId"],
        where: { courseId: { in: ids }, deletedAt: null },
        _max: { createdAt: true },
        _count: { _all: true },
      })
    : [];
  const stat = new Map(latest.map((l) => [l.courseId, l]));
  return courses
    .map((c) => ({
      course_id: c.id,
      course_slug: c.slug,
      course_title: decodeHtmlEntities(c.title),
      message_count: stat.get(c.id)?._count._all ?? 0,
      last_message_at: stat.get(c.id)?._max.createdAt?.toISOString() ?? null,
    }))
    .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? "") || a.course_title.localeCompare(b.course_title));
}
