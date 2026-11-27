/**
 * A7 — course announcements: the course staff post news to the course's students. Students with
 * access read them on the learn page (and get an in-app notification); 26 come from the old site.
 */
import type { Prisma } from "@prisma/client";
import { prisma, newId, now } from "@/lib/db";
import { Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { assertUuid } from "@/lib/uuid";
import { hasCourseAccess, isCancelledStatus } from "@/server/enrollment-status";
import { userPhotoUrl } from "@/server/legacy-uploads";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { courseContext } from "./curriculum";

type Row = Awaited<ReturnType<typeof load>>[number];

function load(args: { where: Prisma.CourseAnnouncementWhereInput; take?: number }) {
  return prisma.courseAnnouncement.findMany({
    where: args.where,
    take: args.take,
    include: {
      course: { select: { id: true, title: true, slug: true } },
      author: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Old-site texts have runs of empty lines and HTML entities: show them tidy (stored text is unchanged). */
function tidy(s: string) {
  return decodeHtmlEntities(s)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function view(a: Row) {
  return {
    id: a.id,
    course: { ...a.course, title: decodeHtmlEntities(a.course.title) },
    title: decodeHtmlEntities(a.title),
    body: tidy(a.body),
    author: a.author ? { id: a.author.id, name: a.author.name, avatar_url: userPhotoUrl(a.author.id, a.author.avatarUrl) } : null,
    created_at: a.createdAt.toISOString(),
    updated_at: a.updatedAt.toISOString(),
    edited: a.updatedAt.getTime() - a.createdAt.getTime() > 60_000,
  };
}

function clean(input: { title?: unknown; body?: unknown }, partial = false) {
  const out: { title?: string; body?: string } = {};
  if (!partial || input.title !== undefined) {
    const title = String(input.title ?? "").trim();
    if (!title) throw Err.invalidInput("give the announcement a title");
    if (title.length > 255) throw Err.invalidInput("the title is too long");
    out.title = title;
  }
  if (!partial || input.body !== undefined) {
    const body = String(input.body ?? "").trim();
    if (!body) throw Err.invalidInput("write the announcement");
    if (body.length > 20_000) throw Err.invalidInput("the announcement is too long");
    out.body = body;
  }
  return out;
}

/** The announcements of a course, newest first (students with access and the course staff). */
export async function listForCourse(user: AuthUser, courseId: string) {
  const ctx = await courseContext(user, courseId, "member");
  const rows = await load({ where: { courseId: ctx.id, deletedAt: null }, take: 200 });
  return { data: rows.map(view), can_post: ctx.staff };
}

/** Staff: post an announcement; every student with access gets an in-app notification. */
export async function create(user: AuthUser, courseId: string, input: { title?: unknown; body?: unknown }) {
  const ctx = await courseContext(user, courseId, "staff");
  const data = clean(input) as { title: string; body: string };
  const t = now();
  const id = newId();
  await prisma.courseAnnouncement.create({
    data: { id, courseId: ctx.id, authorId: user.user_id, title: data.title, body: data.body, createdAt: t, updatedAt: t },
  });
  const enrollments = await prisma.enrollment.findMany({
    where: { courseId: ctx.id, deletedAt: null },
    select: { userId: true, status: true, paymentStatus: true, completedAt: true },
  });
  const students = [
    ...new Set(enrollments.filter((e) => !isCancelledStatus(e.status) && hasCourseAccess(e)).map((e) => e.userId)),
  ].filter((uid) => uid !== user.user_id);
  if (students.length) {
    await prisma.notification.createMany({
      data: students.map((uid) => ({
        id: newId(),
        userId: uid,
        type: "announcement",
        title: `📢 ${ctx.title}: ${data.title}`.slice(0, 512),
        body: data.body.length > 300 ? `${data.body.slice(0, 297)}…` : data.body,
        meta: { link: `/learn/${encodeURIComponent(ctx.slug)}?tab=announcements` },
        createdAt: t,
        updatedAt: t,
      })),
    });
  }
  const [row] = await load({ where: { id } });
  return { ...view(row), notified: students.length };
}

async function staffAnnouncement(user: AuthUser, id: string) {
  assertUuid(id, "announcement not found");
  const a = await prisma.courseAnnouncement.findFirst({ where: { id, deletedAt: null } });
  if (!a) throw Err.notFound("announcement not found");
  await courseContext(user, a.courseId, "staff");
  return a;
}

export async function update(user: AuthUser, id: string, input: { title?: unknown; body?: unknown }) {
  const a = await staffAnnouncement(user, id);
  await prisma.courseAnnouncement.update({ where: { id: a.id }, data: { ...clean(input, true), updatedAt: now() } });
  const [row] = await load({ where: { id: a.id } });
  return view(row);
}

export async function remove(user: AuthUser, id: string) {
  const a = await staffAnnouncement(user, id);
  await prisma.courseAnnouncement.update({ where: { id: a.id }, data: { deletedAt: now(), updatedAt: now() } });
}

/** Dashboard: staff see the announcements of the courses they teach (admins: all); students the ones of their courses. */
export async function forDashboard(user: AuthUser) {
  if (user.role === "admin" || user.role === "instructor") {
    const rows = await load({
      where: { deletedAt: null, course: { deletedAt: null, ...(user.role === "admin" ? {} : { instructorId: user.user_id }) } },
      take: 300,
    });
    return { data: rows.map(view), staff: true };
  }
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: user.user_id, deletedAt: null },
    select: { courseId: true, status: true, paymentStatus: true, completedAt: true },
  });
  const courseIds = [...new Set(enrollments.filter((e) => !isCancelledStatus(e.status) && hasCourseAccess(e)).map((e) => e.courseId))];
  if (!courseIds.length) return { data: [], staff: false };
  const rows = await load({ where: { deletedAt: null, courseId: { in: courseIds }, course: { deletedAt: null } }, take: 300 });
  return { data: rows.map(view), staff: false };
}

/** How many announcements a course has (badge on the learn page). */
export function countForCourse(courseId: string) {
  return prisma.courseAnnouncement.count({ where: { courseId, deletedAt: null } });
}
