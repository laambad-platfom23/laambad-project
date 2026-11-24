/**
 * A5 — Course prerequisites: courses a student must finish before enrolling in a more advanced one.
 * "Finished" = the enrolment is completed, or the student has the course certificate.
 * Checked on every self-service way in (free enrolment, WaafiPay, manual payment request).
 * Admin approvals and bundles are not blocked (the admin decides; a bundle sells the whole path).
 */
import { prisma, now } from "@/lib/db";
import { ApiError, Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { assertUuid, isUuid } from "@/lib/uuid";
import { decodeHtmlEntities } from "@/lib/html-entities";

export async function listFor(courseId: string) {
  const rows = await prisma.coursePrerequisite.findMany({
    where: { courseId, required: { deletedAt: null } },
    select: { required: { select: { id: true, title: true, slug: true, status: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ id: r.required.id, title: decodeHtmlEntities(r.required.title), slug: r.required.slug, status: r.required.status }));
}

/** Which required courses this user has not finished yet. */
export async function missingFor(userId: string, courseId: string) {
  const req = await listFor(courseId);
  if (!req.length) return [];
  const ids = req.map((r) => r.id);
  const [finished, certs] = await Promise.all([
    prisma.enrollment.findMany({ where: { userId, courseId: { in: ids }, deletedAt: null, completedAt: { not: null } }, select: { courseId: true } }),
    prisma.certificate.findMany({ where: { userId, courseId: { in: ids }, deletedAt: null }, select: { courseId: true } }),
  ]);
  const done = new Set([...finished.map((f) => f.courseId), ...certs.map((c) => c.courseId)]);
  return req.filter((r) => !done.has(r.id));
}

/** Throws 409 prerequisites_missing (with the course names) unless the student finished them. */
export async function assertMet(user: AuthUser, courseId: string) {
  if (user.role === "admin") return;
  const missing = await missingFor(user.user_id, courseId);
  if (missing.length) {
    const err = new ApiError(
      409,
      "prerequisites_missing",
      `Complete ${missing.map((m) => `"${m.title}"`).join(", ")} before enrolling in this course.`
    );
    (err as ApiError & { details?: unknown }).details = { missing };
    throw err;
  }
}

/** Instructor / admin: replace the list of required courses (no self, no loops). */
export async function setFor(user: AuthUser, courseId: string, ids: unknown) {
  assertUuid(courseId, "course not found");
  const course = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null }, select: { id: true, instructorId: true } });
  if (!course) throw Err.notFound("course not found");
  if (user.role !== "admin" && course.instructorId !== user.user_id) throw Err.forbidden();
  if (!Array.isArray(ids)) throw Err.invalidInput("course_ids must be a list");
  const list = [...new Set(ids.map(String))].slice(0, 20);
  if (list.some((id) => !isUuid(id))) throw Err.invalidInput("unknown course");
  if (list.includes(courseId)) throw Err.invalidInput("a course cannot require itself");
  const found = await prisma.course.findMany({ where: { id: { in: list }, deletedAt: null }, select: { id: true } });
  if (found.length !== list.length) throw Err.invalidInput("unknown course");

  // loop check: none of the required courses may (directly or not) require this course
  const edges = await prisma.coursePrerequisite.findMany({ select: { courseId: true, requiredCourseId: true } });
  const next = new Map<string, string[]>();
  for (const e of edges) if (e.courseId !== courseId) next.set(e.courseId, [...(next.get(e.courseId) ?? []), e.requiredCourseId]);
  const seen = new Set<string>();
  const stack = [...list];
  while (stack.length) {
    const c = stack.pop()!;
    if (c === courseId) throw Err.invalidInput("this would create a loop: a required course already requires this course");
    if (seen.has(c)) continue;
    seen.add(c);
    stack.push(...(next.get(c) ?? []));
  }

  const t = now();
  await prisma.$transaction([
    prisma.coursePrerequisite.deleteMany({ where: { courseId } }),
    prisma.coursePrerequisite.createMany({ data: list.map((r) => ({ courseId, requiredCourseId: r, createdAt: t })) }),
  ]);
  return listFor(courseId);
}
