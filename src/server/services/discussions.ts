/**
 * Group discussion (A2, chat layout A3): one "class room" per course. Members = students with access to
 * the course, the course instructor and admins. Messages are plain text (rendered as text, never as
 * HTML) and may carry one image uploaded through the room (A3: course_discussion_messages.image_url).
 */
import { prisma, newId, now } from "@/lib/db";
import { ApiError, Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { findBestEnrollment, hasCourseAccess } from "@/server/enrollment-status";
import { userPhotoUrl } from "@/server/legacy-uploads";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { assertUuid, isUuid } from "@/lib/uuid";
import { savePublicUpload } from "@/lib/local-storage";

const MAX_BODY = 2000;
const PAGE = 60;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // Vercel functions accept ~4.5 MB request bodies; the browser shrinks photos first
const IMAGE_PATH = /^\/uploads\/discussion\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/;

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

const AUTHOR = { select: { id: true, name: true, avatarUrl: true, role: { select: { slug: true } } } } as const;
const SELECT = {
  id: true,
  parentId: true,
  body: true,
  imageUrl: true,
  isPinned: true,
  createdAt: true,
  userId: true,
  deletedAt: true,
  user: AUTHOR,
  parent: { select: { id: true, body: true, imageUrl: true, deletedAt: true, user: { select: { id: true, name: true } } } },
} as const;

type Row = {
  id: string;
  parentId: string | null;
  body: string;
  imageUrl: string | null;
  isPinned: boolean;
  createdAt: Date;
  userId: string;
  deletedAt: Date | null;
  user: { id: string; name: string; avatarUrl: string | null; role: { slug: string } };
  parent: { id: string; body: string; imageUrl: string | null; deletedAt: Date | null; user: { id: string; name: string } } | null;
};

function view(m: Row, me: AuthUser, moderator: boolean, instructorId: string) {
  const deleted = !!m.deletedAt;
  const role = m.user.role.slug;
  return {
    id: m.id,
    body: deleted ? "" : m.body,
    image_url: deleted ? null : m.imageUrl,
    deleted,
    is_pinned: !deleted && m.isPinned,
    created_at: m.createdAt.toISOString(),
    mine: m.userId === me.user_id,
    author: {
      id: m.user.id,
      name: m.user.name,
      avatar_url: userPhotoUrl(m.user.id, m.user.avatarUrl),
      badge: m.user.id === instructorId ? "Instructor" : role === "admin" ? "Admin" : null,
    },
    reply_to: m.parent
      ? {
          id: m.parent.id,
          author_name: m.parent.user.name,
          mine: m.parent.user.id === me.user_id,
          body: m.parent.deletedAt ? "" : m.parent.body.slice(0, 160),
          has_image: !m.parent.deletedAt && !!m.parent.imageUrl,
          deleted: !!m.parent.deletedAt,
        }
      : null,
    can_delete: !deleted && (moderator || m.userId === me.user_id),
  };
}

/**
 * The room as a chat: oldest → newest.
 *  - default: the newest 60 messages;
 *  - before=<ISO time>: the 60 messages before that time (scrolling up);
 *  - around=<message id>: the messages around one message (jump to a search result / quoted message).
 */
export async function listMessages(
  user: AuthUser,
  courseIdOrSlug: string,
  opts: { before?: string | null; around?: string | null } = {}
) {
  const course = await courseForRoom(courseIdOrSlug);
  const { moderator } = await requireMember(user, course);

  let rows: Row[];
  let hasMoreBefore: boolean;
  if (opts.around) {
    const target = await prisma.courseDiscussionMessage.findFirst({
      where: { id: assertUuid(opts.around, "message not found"), courseId: course.id },
      select: { createdAt: true },
    });
    if (!target) throw Err.notFound("message not found");
    const [older, newer] = await Promise.all([
      prisma.courseDiscussionMessage.findMany({
        where: { courseId: course.id, createdAt: { lte: target.createdAt } },
        orderBy: { createdAt: "desc" },
        take: PAGE / 2 + 1,
        select: SELECT,
      }),
      prisma.courseDiscussionMessage.findMany({
        where: { courseId: course.id, createdAt: { gt: target.createdAt } },
        orderBy: { createdAt: "asc" },
        take: PAGE / 2,
        select: SELECT,
      }),
    ]);
    hasMoreBefore = older.length > PAGE / 2;
    rows = [...older.slice(0, PAGE / 2).reverse(), ...newer];
  } else {
    const before = opts.before ? new Date(opts.before) : null;
    const desc = await prisma.courseDiscussionMessage.findMany({
      where: { courseId: course.id, ...(before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}) },
      orderBy: { createdAt: "desc" },
      take: PAGE + 1,
      select: SELECT,
    });
    hasMoreBefore = desc.length > PAGE;
    rows = desc.slice(0, PAGE).reverse();
  }

  const [members, pinned] = await Promise.all([
    prisma.enrollment.findMany({
      where: { courseId: course.id, deletedAt: null, status: { in: ["active", "completed"] } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.courseDiscussionMessage.findMany({
      where: { courseId: course.id, isPinned: true, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: SELECT,
    }),
  ]);

  return {
    course: { id: course.id, slug: course.slug, title: decodeHtmlEntities(course.title) },
    member_count: members.length,
    is_moderator: moderator,
    pinned: pinned.map((m) => view(m, user, moderator, course.instructorId)),
    data: rows.map((m) => view(m, user, moderator, course.instructorId)),
    has_more_before: hasMoreBefore,
  };
}

/** Search the room's messages (newest first). */
export async function searchMessages(user: AuthUser, courseIdOrSlug: string, q: string) {
  const course = await courseForRoom(courseIdOrSlug);
  const { moderator } = await requireMember(user, course);
  const term = q.trim().slice(0, 100);
  if (term.length < 2) return { q: term, data: [] };
  const rows = await prisma.courseDiscussionMessage.findMany({
    where: {
      courseId: course.id,
      deletedAt: null,
      OR: [{ body: { contains: term, mode: "insensitive" } }, { user: { name: { contains: term, mode: "insensitive" } } }],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: SELECT,
  });
  return { q: term, data: rows.map((m) => view(m, user, moderator, course.instructorId)) };
}

function imageKind(b: Uint8Array): { ext: "jpg" | "png" | "gif" | "webp"; type: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", type: "image/png" };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return { ext: "gif", type: "image/gif" };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { ext: "webp", type: "image/webp" };
  }
  return null;
}

/** Upload one image for the room (members only). The type is taken from the file's bytes, not its name. */
export async function uploadImage(user: AuthUser, courseIdOrSlug: string, file: File) {
  const course = await courseForRoom(courseIdOrSlug);
  await requireMember(user, course);
  if (file.size > MAX_IMAGE_BYTES) throw Err.invalidInput("image too large (max 4 MB)");
  const buf = new Uint8Array(await file.arrayBuffer());
  const kind = imageKind(buf);
  if (!kind) throw Err.invalidInput("only JPG, PNG, WebP or GIF images");
  const saved = await savePublicUpload("discussion", `image.${kind.ext}`, Buffer.from(buf), kind.type);
  return { url: saved.url };
}

/** Accept only images that were uploaded through uploadImage (our storage, our folder, our naming). */
function cleanImageUrl(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw Err.invalidInput("invalid image");
  }
  const app = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const okHost =
    (u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com")) ||
    (() => {
      try {
        return new URL(app).host === u.host;
      } catch {
        return false;
      }
    })();
  if (!okHost || !IMAGE_PATH.test(u.pathname)) throw Err.invalidInput("invalid image");
  return `${u.origin}${u.pathname}`;
}

export async function postMessage(
  user: AuthUser,
  courseIdOrSlug: string,
  input: { body?: string; parent_id?: string | null; image_url?: string | null }
) {
  const course = await courseForRoom(courseIdOrSlug);
  const { moderator } = await requireMember(user, course);
  const body = String(input.body ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  const imageUrl = cleanImageUrl(input.image_url);
  if (!body && !imageUrl) throw Err.invalidInput("message is empty");
  if (body.length > MAX_BODY) throw Err.invalidInput(`message is too long (max ${MAX_BODY} characters)`);

  let parentId: string | null = null;
  if (input.parent_id) {
    assertUuid(String(input.parent_id), "message not found");
    const parent = await prisma.courseDiscussionMessage.findFirst({
      where: { id: String(input.parent_id), courseId: course.id, deletedAt: null },
      select: { id: true },
    });
    if (!parent) throw Err.notFound("message not found");
    parentId = parent.id; // chat style: the reply quotes exactly this message
  }

  // simple flood guard: 10 messages per minute per user per course
  const t = now();
  const recent = await prisma.courseDiscussionMessage.count({
    where: { courseId: course.id, userId: user.user_id, createdAt: { gte: new Date(t.getTime() - 60_000) } },
  });
  if (recent >= 10) throw new ApiError(429, "too_many_requests", "You are sending messages too fast. Wait a moment.");

  const row = await prisma.courseDiscussionMessage.create({
    data: { id: newId(), courseId: course.id, userId: user.user_id, parentId, body, imageUrl, createdAt: t, updatedAt: t },
    select: SELECT,
  });
  return view(row, user, moderator, course.instructorId);
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

/** Pin / unpin a message: moderators only. */
export async function pinMessage(user: AuthUser, messageId: string, pinned: boolean) {
  assertUuid(messageId, "message not found");
  const m = await prisma.courseDiscussionMessage.findFirst({
    where: { id: messageId, deletedAt: null },
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
