/**
 * A5 — Live sessions (Google Meet): the course instructor (or an admin) schedules a session; with a
 * connected Google account the Meet link is created automatically in their Google Calendar.
 * Only members of the course (students with access, the instructor, admins) see the Meet link.
 */
import { prisma, newId, now } from "@/lib/db";
import { ApiError, Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { findBestEnrollment, hasCourseAccess } from "@/server/enrollment-status";
import { assertUuid, isUuid } from "@/lib/uuid";
import { decodeHtmlEntities } from "@/lib/html-entities";
import * as google from "@/server/google";

async function courseOf(courseId: string) {
  assertUuid(courseId, "course not found");
  const c = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null }, select: { id: true, title: true, slug: true, instructorId: true } });
  if (!c) throw Err.notFound("course not found");
  return c;
}
const isStaff = (user: AuthUser, c: { instructorId: string }) => user.role === "admin" || c.instructorId === user.user_id;

async function requireMember(user: AuthUser, c: { id: string; instructorId: string }) {
  if (isStaff(user, c)) return true;
  const e = await findBestEnrollment(user.user_id, c.id);
  if (!e || !hasCourseAccess(e)) throw Err.forbidden();
  return false;
}

type Row = NonNullable<Awaited<ReturnType<typeof prisma.liveSession.findFirst>>>;
function view(s: Row, staff: boolean, course?: { title: string; slug: string }) {
  const end = new Date(s.startsAt.getTime() + s.durationMin * 60_000);
  const t = Date.now();
  const joinable = s.status === "scheduled" && t >= s.startsAt.getTime() - 15 * 60_000 && t <= end.getTime();
  return {
    id: s.id,
    course_id: s.courseId,
    ...(course ? { course_title: decodeHtmlEntities(course.title), course_slug: course.slug } : {}),
    title: s.title,
    description: s.description,
    starts_at: s.startsAt.toISOString(),
    ends_at: end.toISOString(),
    duration_min: s.durationMin,
    status: s.status,
    is_live: joinable,
    is_past: t > end.getTime(),
    // students get the link from 15 minutes before the start until the end; staff always
    meet_url: staff || joinable ? s.meetUrl : null,
    has_link: !!s.meetUrl,
    google_event: !!s.googleEventId,
  };
}

export async function listForCourse(user: AuthUser, courseId: string) {
  const c = await courseOf(courseId);
  const staff = await requireMember(user, c);
  const rows = await prisma.liveSession.findMany({
    where: { courseId: c.id, status: { not: "cancelled" }, startsAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
    orderBy: { startsAt: "asc" },
    take: 100,
  });
  return { is_staff: staff, data: rows.map((r) => view(r, staff)) };
}

/** Upcoming sessions of every course the user belongs to (student dashboard / instructor). */
export async function myUpcoming(user: AuthUser) {
  const since = new Date(Date.now() - 3 * 3_600_000);
  let courseIds: string[];
  if (user.role === "admin") courseIds = [];
  else if (user.role === "instructor")
    courseIds = (await prisma.course.findMany({ where: { instructorId: user.user_id, deletedAt: null }, select: { id: true } })).map((c) => c.id);
  else {
    const rows = await prisma.enrollment.findMany({
      where: { userId: user.user_id, deletedAt: null },
      select: { courseId: true, status: true, paymentStatus: true, completedAt: true },
    });
    courseIds = [...new Set(rows.filter((r) => hasCourseAccess(r)).map((r) => r.courseId))];
  }
  const rows = await prisma.liveSession.findMany({
    where: { status: "scheduled", startsAt: { gte: since }, ...(user.role === "admin" ? {} : { courseId: { in: courseIds } }) },
    orderBy: { startsAt: "asc" },
    take: 50,
    include: { course: { select: { title: true, slug: true, instructorId: true } } },
  });
  return rows
    .map((r) => view(r, isStaff(user, r.course), r.course))
    .filter((s) => !s.is_past);
}

type Input = { title?: string; description?: string | null; starts_at?: string; duration_min?: number; meet_url?: string | null };

function clean(input: Input, partial: boolean) {
  const out: { title?: string; description?: string | null; startsAt?: Date; durationMin?: number; meetUrl?: string | null } = {};
  if (input.title !== undefined || !partial) {
    const t = String(input.title ?? "").trim().slice(0, 255);
    if (!t) throw Err.invalidInput("title is required");
    out.title = t;
  }
  if (input.description !== undefined) out.description = input.description ? String(input.description).slice(0, 5000) : null;
  if (input.starts_at !== undefined || !partial) {
    const d = new Date(String(input.starts_at ?? ""));
    if (Number.isNaN(d.getTime())) throw Err.invalidInput("invalid start time");
    if (!partial && d.getTime() < Date.now() - 5 * 60_000) throw Err.invalidInput("the start time is in the past");
    out.startsAt = d;
  }
  if (input.duration_min !== undefined || !partial) {
    const m = Math.round(Number(input.duration_min ?? 60));
    if (!Number.isFinite(m) || m < 10 || m > 480) throw Err.invalidInput("duration must be 10–480 minutes");
    out.durationMin = m;
  }
  if (input.meet_url !== undefined) {
    const u = String(input.meet_url ?? "").trim();
    if (u && !/^https:\/\/meet\.google\.com\/[a-z0-9-]+$/i.test(u)) throw Err.invalidInput("paste a Google Meet link (https://meet.google.com/…)");
    out.meetUrl = u || null;
  }
  return out;
}

async function googleToken(userId: string) {
  const g = await prisma.googleConnection.findUnique({ where: { userId } });
  if (!g || !google.isGoogleConfigured()) return null;
  return google.accessToken(g.refreshTokenEnc);
}

export async function create(user: AuthUser, courseId: string, input: Input) {
  const c = await courseOf(courseId);
  if (!isStaff(user, c)) throw Err.forbidden();
  const data = clean(input, false);
  let meetUrl = data.meetUrl ?? null;
  let eventId: string | null = null;
  // the Meet link is created in the course instructor's Google Calendar (an admin scheduling uses their own)
  const token = await googleToken(user.user_id);
  if (token) {
    const ev = await google.createMeetEvent(token, { title: `${data.title} — ${decodeHtmlEntities(c.title)}`, description: data.description, startsAt: data.startsAt!, durationMin: data.durationMin! });
    meetUrl = ev.meetUrl ?? meetUrl;
    eventId = ev.eventId;
  }
  if (!meetUrl) {
    throw new ApiError(409, "google_not_connected", "Connect your Google account (or paste a Meet link) to create the session.");
  }
  const t = now();
  const row = await prisma.liveSession.create({
    data: {
      id: newId(),
      courseId: c.id,
      instructorId: user.user_id,
      title: data.title!,
      description: data.description ?? null,
      startsAt: data.startsAt!,
      durationMin: data.durationMin!,
      meetUrl,
      googleEventId: eventId,
      createdAt: t,
      updatedAt: t,
    },
  });
  await announce(c, row, "scheduled");
  return view(row, true);
}

export async function update(user: AuthUser, id: string, input: Input) {
  assertUuid(id, "session not found");
  const s = await prisma.liveSession.findFirst({ where: { id }, include: { course: { select: { id: true, title: true, slug: true, instructorId: true } } } });
  if (!s || s.status === "cancelled") throw Err.notFound("session not found");
  if (!isStaff(user, s.course)) throw Err.forbidden();
  const data = clean(input, true);
  const next = { title: data.title ?? s.title, description: data.description !== undefined ? data.description : s.description, startsAt: data.startsAt ?? s.startsAt, durationMin: data.durationMin ?? s.durationMin };
  if (s.googleEventId) {
    const token = await googleToken(s.instructorId);
    if (token) await google.updateMeetEvent(token, s.googleEventId, { ...next, title: `${next.title} — ${decodeHtmlEntities(s.course.title)}` });
  }
  const row = await prisma.liveSession.update({
    where: { id },
    data: { ...next, ...(data.meetUrl !== undefined ? { meetUrl: data.meetUrl } : {}), updatedAt: now() },
  });
  if (data.startsAt && data.startsAt.getTime() !== s.startsAt.getTime()) await announce(s.course, row, "moved");
  return view(row, true);
}

export async function cancel(user: AuthUser, id: string) {
  assertUuid(id, "session not found");
  const s = await prisma.liveSession.findFirst({ where: { id }, include: { course: { select: { id: true, title: true, slug: true, instructorId: true } } } });
  if (!s || s.status === "cancelled") throw Err.notFound("session not found");
  if (!isStaff(user, s.course)) throw Err.forbidden();
  if (s.googleEventId) {
    const token = await googleToken(s.instructorId).catch(() => null);
    if (token) await google.deleteMeetEvent(token, s.googleEventId);
  }
  const row = await prisma.liveSession.update({ where: { id }, data: { status: "cancelled", updatedAt: now() } });
  await announce(s.course, row, "cancelled");
  return { ok: true };
}

/** In-app notice to every student of the course (no mass e-mail: quota). */
async function announce(c: { id: string; title: string; slug: string }, s: Row, what: "scheduled" | "moved" | "cancelled") {
  const students = await prisma.enrollment.findMany({
    where: { courseId: c.id, deletedAt: null, status: { in: ["active", "completed"] } },
    select: { userId: true, status: true, paymentStatus: true, completedAt: true },
    distinct: ["userId"],
  });
  const ids = students.filter((e) => hasCourseAccess(e)).map((e) => e.userId);
  if (!ids.length) return;
  const when = s.startsAt.toLocaleString("en-GB", { timeZone: "Africa/Mogadishu", dateStyle: "medium", timeStyle: "short" });
  const title =
    what === "cancelled" ? `Live session cancelled: ${s.title}` : what === "moved" ? `Live session moved: ${s.title}` : `Live session: ${s.title}`;
  const t = now();
  for (let i = 0; i < ids.length; i += 500) {
    await prisma.notification.createMany({
      data: ids.slice(i, i + 500).map((userId) => ({
        id: newId(),
        userId,
        type: "live_session",
        title: title.slice(0, 512),
        body: `${decodeHtmlEntities(c.title)} — ${when} (Mogadishu time)`,
        meta: { link: `/dashboard/live-sessions`, session_id: s.id },
        createdAt: t,
        updatedAt: t,
      })),
    });
  }
}

// ── Google connection ──
export async function googleStatus(user: AuthUser) {
  const g = await prisma.googleConnection.findUnique({ where: { userId: user.user_id }, select: { googleEmail: true, connectedAt: true } });
  return { configured: google.isGoogleConfigured(), connected: !!g, email: g?.googleEmail ?? null, connected_at: g?.connectedAt.toISOString() ?? null };
}
export function googleConnectUrl(user: AuthUser) {
  if (user.role !== "admin" && user.role !== "instructor") throw Err.forbidden();
  return { url: google.authUrl(user.user_id) };
}
export async function googleCallback(code: string, state: string) {
  const userId = google.readState(state);
  if (!userId || !isUuid(userId)) throw new ApiError(400, "google_state", "This Google sign-in link expired. Please try again.");
  const r = await google.exchangeCode(code);
  const t = now();
  await prisma.googleConnection.upsert({
    where: { userId },
    create: { userId, googleEmail: r.email, refreshTokenEnc: google.encrypt(r.refreshToken), scope: r.scope, connectedAt: t, updatedAt: t },
    update: { googleEmail: r.email, refreshTokenEnc: google.encrypt(r.refreshToken), scope: r.scope, connectedAt: t, updatedAt: t },
  });
}
export async function googleDisconnect(user: AuthUser) {
  const g = await prisma.googleConnection.findUnique({ where: { userId: user.user_id } });
  if (g) {
    await google.revoke(g.refreshTokenEnc);
    await prisma.googleConnection.delete({ where: { userId: user.user_id } });
  }
  return { ok: true };
}
