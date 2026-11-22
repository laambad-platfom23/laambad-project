import { prisma, newId, now } from "@/lib/db";
import { Err } from "@/lib/api/errors";
import { ser } from "@/server/serialize";
import type { AuthUser } from "@/lib/auth/request";

function mapAssignment(a: {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  dueAt: Date | null;
  maxPoints: unknown;
  published: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}) {
  return ser({
    id: a.id,
    course_id: a.courseId,
    title: a.title,
    description: a.description,
    due_at: a.dueAt?.toISOString() ?? null,
    max_points: a.maxPoints,
    published: a.published,
    created_at: a.createdAt?.toISOString(),
    updated_at: a.updatedAt?.toISOString(),
  });
}

export async function listForCourse(courseId: string) {
  const rows = await prisma.assignment.findMany({
    where: { courseId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapAssignment);
}

export async function getAssignment(id: string) {
  const a = await prisma.assignment.findFirst({ where: { id, deletedAt: null } });
  if (!a) throw Err.notFound("assignment not found");
  return mapAssignment(a);
}

export async function createForCourse(
  user: AuthUser,
  courseId: string,
  input: {
    title: string;
    description?: string;
    due_at?: string | null;
    max_points?: number;
    published?: boolean;
  }
) {
  const course = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null } });
  if (!course) throw Err.notFound("course not found");
  if (user.role !== "admin" && course.instructorId !== user.user_id) throw Err.forbidden();
  const t = now();
  const row = await prisma.assignment.create({
    data: {
      id: newId(),
      courseId,
      title: input.title.trim(),
      description: input.description || null,
      dueAt: input.due_at ? new Date(input.due_at) : null,
      maxPoints: input.max_points ?? 100,
      published: !!input.published,
      createdAt: t,
      updatedAt: t,
    },
  });
  return mapAssignment(row);
}

export async function updateAssignment(
  user: AuthUser,
  id: string,
  input: Partial<{
    title: string;
    description: string;
    due_at: string | null;
    max_points: number;
    published: boolean;
  }>
) {
  const a = await prisma.assignment.findFirst({
    where: { id, deletedAt: null },
    include: { course: true },
  });
  if (!a) throw Err.notFound("assignment not found");
  if (user.role !== "admin" && a.course.instructorId !== user.user_id) throw Err.forbidden();
  const row = await prisma.assignment.update({
    where: { id },
    data: {
      title: input.title?.trim(),
      description: input.description,
      dueAt: input.due_at === undefined ? undefined : input.due_at ? new Date(input.due_at) : null,
      maxPoints: input.max_points,
      published: input.published,
      updatedAt: now(),
    },
  });
  return mapAssignment(row);
}

export async function deleteAssignment(user: AuthUser, id: string) {
  const a = await prisma.assignment.findFirst({
    where: { id, deletedAt: null },
    include: { course: true },
  });
  if (!a) throw Err.notFound("assignment not found");
  if (user.role !== "admin" && a.course.instructorId !== user.user_id) throw Err.forbidden();
  await prisma.assignment.update({
    where: { id },
    data: { deletedAt: now(), updatedAt: now() },
  });
}

export async function submit(
  user: AuthUser,
  assignmentId: string,
  fileUrl: string
) {
  const a = await prisma.assignment.findFirst({ where: { id: assignmentId, deletedAt: null } });
  if (!a) throw Err.notFound("assignment not found");
  const t = now();
  const existing = await prisma.submission.findFirst({
    where: { assignmentId, studentId: user.user_id, deletedAt: null },
  });
  if (existing) {
    const row = await prisma.submission.update({
      where: { id: existing.id },
      data: { fileUrl, submittedAt: t, updatedAt: t },
    });
    return ser({
      id: row.id,
      assignment_id: row.assignmentId,
      file_url: row.fileUrl,
      submitted_at: row.submittedAt.toISOString(),
    });
  }
  const row = await prisma.submission.create({
    data: {
      id: newId(),
      assignmentId,
      studentId: user.user_id,
      fileUrl,
      submittedAt: t,
      createdAt: t,
      updatedAt: t,
    },
  });
  return ser({
    id: row.id,
    assignment_id: row.assignmentId,
    file_url: row.fileUrl,
    submitted_at: row.submittedAt.toISOString(),
  });
}

export async function mySubmission(user: AuthUser, assignmentId: string) {
  const row = await prisma.submission.findFirst({
    where: { assignmentId, studentId: user.user_id, deletedAt: null },
  });
  if (!row) throw Err.notFound("submission not found");
  return ser({
    id: row.id,
    assignment_id: row.assignmentId,
    file_url: row.fileUrl,
    // G10: 2,230 migrated submissions have no file, 4,251 have a text answer
    body: row.body,
    attachments_json: row.attachmentsJson,
    grade: row.grade,
    feedback: row.feedback,
    submitted_at: row.submittedAt.toISOString(),
    graded_at: row.gradedAt?.toISOString() ?? null,
  });
}

export async function listSubmissions(user: AuthUser, assignmentId: string) {
  const a = await prisma.assignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
    include: { course: true },
  });
  if (!a) throw Err.notFound("assignment not found");
  if (user.role !== "admin" && a.course.instructorId !== user.user_id) throw Err.forbidden();
  const rows = await prisma.submission.findMany({
    where: { assignmentId, deletedAt: null },
    include: { student: { select: { id: true, name: true, email: true } } },
    orderBy: { submittedAt: "desc" },
  });
  return ser(
    rows.map((s) => ({
      id: s.id,
      student_id: s.studentId,
      student: s.student,
      file_url: s.fileUrl,
      body: s.body,
      attachments_json: s.attachmentsJson,
      grade: s.grade,
      feedback: s.feedback,
      submitted_at: s.submittedAt.toISOString(),
    }))
  );
}

export async function gradeSubmission(
  user: AuthUser,
  submissionId: string,
  input: { grade: number; feedback?: string }
) {
  const s = await prisma.submission.findFirst({
    where: { id: submissionId, deletedAt: null },
    include: { assignment: { include: { course: true } } },
  });
  if (!s) throw Err.notFound("submission not found");
  if (user.role !== "admin" && s.assignment.course.instructorId !== user.user_id) {
    throw Err.forbidden();
  }
  const t = now();
  await prisma.submission.update({
    where: { id: submissionId },
    data: {
      grade: input.grade,
      feedback: input.feedback || null,
      gradedAt: t,
      gradedById: user.user_id,
      updatedAt: t,
    },
  });
  return { ok: true };
}
