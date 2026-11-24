/**
 * A5 — Course approval: instructors submit a course for review; an admin approves (published) or sends it
 * back with a note (draft). Both sides are told (in-app; the instructor also by e-mail).
 * Statuses: the app has used both "pending" and "pending_review" for "waiting for review".
 */
import { prisma, newId, now } from "@/lib/db";
import { Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { assertUuid } from "@/lib/uuid";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { notify } from "@/server/notify";

export const REVIEW_STATUSES = ["pending", "pending_review"];

/** The instructor submitted: remember when, and tell the admins. */
export async function onSubmitted(courseId: string) {
  const t = now();
  const c = await prisma.course.update({
    where: { id: courseId },
    data: { submittedAt: t, reviewNote: null, updatedAt: t },
    select: { title: true, instructor: { select: { name: true } } },
  });
  const admins = await prisma.user.findMany({
    where: { deletedAt: null, isActive: true, role: { slug: "admin" } },
    select: { id: true },
    take: 50,
  });
  if (admins.length) {
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        id: newId(),
        userId: a.id,
        type: "course_review",
        title: `Course submitted for review: ${decodeHtmlEntities(c.title)}`,
        body: `${c.instructor.name} submitted this course. Review it and approve or send it back.`,
        meta: { link: "/dashboard/course-reviews" },
        createdAt: t,
        updatedAt: t,
      })),
    });
  }
}

/** Admin queue: courses waiting for review, oldest first. */
export async function queue(user: AuthUser) {
  if (user.role !== "admin") throw Err.forbidden();
  const rows = await prisma.course.findMany({
    where: { deletedAt: null, status: { in: REVIEW_STATUSES } },
    orderBy: [{ submittedAt: "asc" }, { updatedAt: "asc" }],
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      submittedAt: true,
      updatedAt: true,
      instructor: { select: { id: true, name: true, email: true } },
      sections: {
        where: { deletedAt: null },
        select: { _count: { select: { lessons: { where: { deletedAt: null } } } } },
      },
      pricing: { where: { isActive: true, deletedAt: null }, select: { isFree: true, price: true, discountPrice: true }, take: 1 },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    title: decodeHtmlEntities(c.title),
    slug: c.slug,
    status: c.status,
    submitted_at: (c.submittedAt ?? c.updatedAt)?.toISOString() ?? null,
    instructor: c.instructor,
    sections: c.sections.length,
    lessons: c.sections.reduce((s, x) => s + x._count.lessons, 0),
    price: c.pricing[0] ? (c.pricing[0].isFree ? 0 : Number(c.pricing[0].discountPrice ?? c.pricing[0].price)) : null,
  }));
}

export async function pendingCount() {
  return { total: await prisma.course.count({ where: { deletedAt: null, status: { in: REVIEW_STATUSES } } }) };
}

async function decide(user: AuthUser, courseId: string, approve: boolean, note?: string) {
  if (user.role !== "admin") throw Err.forbidden();
  assertUuid(courseId, "course not found");
  const course = await prisma.course.findFirst({
    where: { id: courseId, deletedAt: null },
    select: { id: true, title: true, slug: true, status: true, instructorId: true },
  });
  if (!course) throw Err.notFound("course not found");
  const text = (note ?? "").trim().slice(0, 2000);
  if (!approve && !text) throw Err.invalidInput("write a note for the instructor: what should be changed?");
  const t = now();
  await prisma.course.update({
    where: { id: courseId },
    data: {
      status: approve ? "published" : "draft",
      reviewedAt: t,
      reviewedBy: user.user_id,
      reviewNote: approve ? (text || null) : text,
      updatedAt: t,
    },
  });
  const title = decodeHtmlEntities(course.title);
  notify({
    userId: course.instructorId,
    kind: approve ? "course_approved" : "course_changes",
    ref: `${courseId}:${t.getTime()}`,
    title: approve ? `Course approved: ${title}` : `Changes requested: ${title}`,
    body: approve ? "Your course is now published and visible to students." : text,
    link: approve ? `/courses/${encodeURIComponent(course.slug)}` : `/dashboard/courses/${courseId}/builder`,
    email: {
      subject: approve ? `Your course "${title}" is published` : `Your course "${title}" needs changes`,
      lines: approve
        ? [`Good news — "${title}" was approved and is now published on Laambad.`, ...(text ? [`Note from the reviewer: ${text}`] : [])]
        : [`"${title}" was reviewed and needs a few changes before it can be published.`, `Reviewer note: ${text}`, "Update the course and submit it for review again."],
      cta: approve ? "View the course" : "Edit the course",
    },
  });
  return { ok: true, status: approve ? "published" : "draft" };
}

export const approveCourse = (user: AuthUser, id: string, note?: string) => decide(user, id, true, note);
export const rejectCourse = (user: AuthUser, id: string, note?: string) => decide(user, id, false, note);
