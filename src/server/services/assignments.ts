/**
 * Assignments.
 *
 *  Staff (Course Builder): an assignment is created under a lesson, with a description, optional
 *  files (the brief), a due date, max / pass points and a published switch. Grading: list the
 *  submissions, give a grade + feedback (the student is notified).
 *
 *  Students: only published assignments that are in the curriculum (A6: they have a topic) of a
 *  course they have access to. One submission per student (text answer and/or up to 5 files),
 *  editable until it is graded. A late submission is accepted and marked late.
 *
 *  Old Tutor data: descriptions and answers are WordPress HTML (shown as safe blocks / plain text),
 *  answer files are links to the old site.
 */
import { prisma, newId, now } from "@/lib/db";
import { ApiError, Err } from "@/lib/api/errors";
import { ser } from "@/server/serialize";
import type { AuthUser } from "@/lib/auth/request";
import { assertUuid } from "@/lib/uuid";
import { plain } from "@/lib/plain-text";
import { htmlToBlocks, looksLikeHtml } from "@/lib/wp-content";
import { localLegacyUpload } from "@/server/legacy-uploads";
import { findBestEnrollment, hasCourseAccess, isCancelledStatus } from "@/server/enrollment-status";
import { notify } from "@/server/notify";
import { recordLearningActivity } from "./learning";
import {
  assertItemOpen,
  byPlace,
  courseContext,
  isLocked,
  locksFor,
  nextItemOrder,
  outline,
  placeIndex,
  placeOf,
  resolvePlacement,
  type CourseCtx,
  type Locks,
  type Outline,
} from "./curriculum";
import { checkUploadedUrl, mimeFor } from "./uploads";

export type FileRef = { name: string; url: string; size: number | null; mime: string | null };

/** Files stored as JSON: [{ name, url, size, mime }] (old Tutor shapes are understood too). */
export function parseFiles(json: string | null | undefined): FileRef[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return []; // e.g. { legacy_attachment_ids: [...] } from the old site
    return v
      .map((x) => {
        const url = String(x?.url ?? "").trim();
        const name = String(x?.name ?? "").trim() || decodeURIComponent(url.split("/").pop() || "") || "File";
        const size = Number(x?.size);
        return { name, url, size: Number.isFinite(size) && size > 0 ? size : null, mime: x?.mime ? String(x.mime) : x?.type ? String(x.type) : null };
      })
      .filter((f) => /^https?:\/\//i.test(f.url));
  } catch {
    return [];
  }
}

function submissionFiles(s: { fileUrl: string | null; attachmentsJson: string | null }): FileRef[] {
  const files = parseFiles(s.attachmentsJson);
  if (s.fileUrl && /^https?:\/\//i.test(s.fileUrl) && !files.some((f) => f.url === s.fileUrl)) {
    files.unshift({ name: decodeURIComponent(s.fileUrl.split("/").pop() || "") || "File", url: s.fileUrl, size: null, mime: null });
  }
  return files;
}

/** Old-site images inside descriptions → the local copy (dropped when the file no longer exists). */
function rewriteSrc(src: string): string | null {
  const m = src.match(/^https?:\/\/(?:www\.)?laambad\.com\/wp-content\/uploads\/([^?#]+)/i);
  if (!m) return src;
  try {
    return localLegacyUpload(decodeURIComponent(m[1]));
  } catch {
    return src;
  }
}

function descriptionView(description: string | null) {
  if (looksLikeHtml(description)) return { description_blocks: htmlToBlocks(description!, rewriteSrc), description_text: null };
  return { description_blocks: null, description_text: plain(description) || null };
}

const num = (v: unknown) => (v == null ? null : Number(v));

function passedOf(grade: number | null, passPoints: number | null) {
  if (grade == null) return null;
  return passPoints == null ? null : grade >= passPoints;
}

type SubmissionRow = {
  id: string;
  body: string | null;
  fileUrl: string | null;
  attachmentsJson: string | null;
  submittedAt: Date;
  grade: unknown;
  feedback: string | null;
  gradedAt: Date | null;
};

function submissionView(s: SubmissionRow, a: { dueAt: Date | null; passPoints: unknown }) {
  const grade = num(s.grade);
  return {
    id: s.id,
    body: plain(s.body) || null,
    files: submissionFiles(s),
    submitted_at: s.submittedAt.toISOString(),
    late: !!a.dueAt && s.submittedAt > a.dueAt,
    grade,
    feedback: s.feedback ? plain(s.feedback) : null,
    graded_at: s.gradedAt?.toISOString() ?? null,
    passed: passedOf(s.gradedAt ? grade : null, num(a.passPoints)),
  };
}

function statusOf(s: SubmissionRow | null | undefined) {
  if (!s) return "not_submitted" as const;
  return s.gradedAt ? ("graded" as const) : ("submitted" as const);
}

// ───────────────────────────── students ─────────────────────────────

/** The course's assignments for the learn page / dashboard: placed + published, with my status. */
export async function courseAssignments(user: AuthUser, courseId: string, pre?: { ctx: CourseCtx; out: Outline; locks: Locks }) {
  const ctx = pre?.ctx ?? (await courseContext(user, courseId, "member"));
  const out = pre?.out ?? (await outline(ctx.id));
  const locks = pre?.locks ?? (await locksFor(user, ctx, out));
  const idx = placeIndex(out);
  const rows = await prisma.assignment.findMany({
    where: { courseId: ctx.id, deletedAt: null, published: true, sectionId: { not: null } },
    orderBy: [{ createdAt: "asc" }, { title: "asc" }],
  });
  const visible = rows
    .map((a) => ({ a, place: placeOf(idx, a), sortOrder: a.sortOrder, createdAt: a.createdAt }))
    .filter((x) => x.place.placed)
    .sort(byPlace);
  const subs = await prisma.submission.findMany({
    where: { studentId: user.user_id, deletedAt: null, assignmentId: { in: visible.map((v) => v.a.id) } },
    orderBy: { submittedAt: "desc" },
  });
  return visible.map(({ a, place }) => {
    const s = subs.find((x) => x.assignmentId === a.id) ?? null;
    const grade = s?.gradedAt ? num(s.grade) : null;
    return {
      id: a.id,
      course_id: a.courseId,
      section_id: place.section_id,
      section_title: place.section_title,
      lesson_id: place.lesson_id,
      lesson_title: place.lesson_title,
      sort_order: a.sortOrder,
      title: a.title,
      due_at: a.dueAt?.toISOString() ?? null,
      max_points: Number(a.maxPoints),
      pass_points: num(a.passPoints),
      status: statusOf(s),
      submitted_at: s?.submittedAt.toISOString() ?? null,
      grade,
      passed: passedOf(grade, num(a.passPoints)),
      locked: isLocked(locks, place),
    };
  });
}

/** Every assignment of every course the student can open (dashboard → Assignments). */
export async function myAssignments(user: AuthUser) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: user.user_id, deletedAt: null },
    select: { courseId: true, status: true, paymentStatus: true, completedAt: true },
  });
  const courseIds = [...new Set(enrollments.filter((e) => !isCancelledStatus(e.status) && hasCourseAccess(e)).map((e) => e.courseId))];
  if (!courseIds.length) return { data: [] };
  const rows = await prisma.assignment.findMany({
    where: {
      courseId: { in: courseIds },
      deletedAt: null,
      published: true,
      section: { deletedAt: null },
      course: { deletedAt: null },
    },
    include: {
      course: { select: { id: true, title: true, slug: true } },
      section: { select: { title: true, sortOrder: true } },
      lesson: { select: { title: true, sortOrder: true, deletedAt: true } },
    },
  });
  const subs = await prisma.submission.findMany({
    where: { studentId: user.user_id, deletedAt: null, assignmentId: { in: rows.map((r) => r.id) } },
    orderBy: { submittedAt: "desc" },
  });
  const data = rows
    .sort(
      (a, b) =>
        a.course.title.localeCompare(b.course.title) ||
        Number(a.section?.sortOrder ?? 0) - Number(b.section?.sortOrder ?? 0) ||
        Number(a.lesson?.sortOrder ?? -1) - Number(b.lesson?.sortOrder ?? -1) ||
        a.sortOrder - b.sortOrder ||
        (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
    )
    .map((a) => {
      const s = subs.find((x) => x.assignmentId === a.id) ?? null;
      const grade = s?.gradedAt ? num(s.grade) : null;
      return {
        id: a.id,
        course: a.course,
        section_title: a.section?.title ?? null,
        lesson_title: a.lesson && !a.lesson.deletedAt ? a.lesson.title : null,
        title: a.title,
        due_at: a.dueAt?.toISOString() ?? null,
        max_points: Number(a.maxPoints),
        pass_points: num(a.passPoints),
        status: statusOf(s),
        submitted_at: s?.submittedAt.toISOString() ?? null,
        grade,
        passed: passedOf(grade, num(a.passPoints)),
      };
    });
  return { data };
}

async function loadAssignment(id: string) {
  assertUuid(id, "assignment not found");
  const a = await prisma.assignment.findFirst({
    where: { id, deletedAt: null },
    include: {
      course: { select: { id: true, slug: true, title: true, instructorId: true, sequentialLessons: true, deletedAt: true } },
      section: { select: { id: true, title: true, deletedAt: true } },
      lesson: { select: { id: true, title: true, deletedAt: true } },
    },
  });
  if (!a || a.course.deletedAt) throw Err.notFound("assignment not found");
  return a;
}

/** Visible to students: published and in the curriculum (a live topic). */
function isVisible(a: Awaited<ReturnType<typeof loadAssignment>>) {
  return a.published && !!a.section && !a.section.deletedAt;
}

/** One assignment: staff get the full record, a student the student view + their submission. */
export async function getAssignment(user: AuthUser, id: string) {
  const a = await loadAssignment(id);
  const staff = user.role === "admin" || a.course.instructorId === user.user_id;
  if (!staff) {
    const e = await findBestEnrollment(user.user_id, a.courseId);
    if (!e || !hasCourseAccess(e) || !isVisible(a)) throw Err.notFound("assignment not found");
  }
  const s = staff
    ? null
    : await prisma.submission.findFirst({ where: { assignmentId: a.id, studentId: user.user_id, deletedAt: null }, orderBy: { submittedAt: "desc" } });
  let locked = false;
  if (!staff && a.course.sequentialLessons) {
    locked = await assertItemOpen(user, { ...a.course, staff }, a).then(
      () => false,
      () => true
    );
  }
  return {
    id: a.id,
    course: { id: a.course.id, slug: a.course.slug, title: a.course.title },
    section_id: a.section && !a.section.deletedAt ? a.section.id : null,
    section_title: a.section && !a.section.deletedAt ? a.section.title : null,
    lesson_id: a.lesson && !a.lesson.deletedAt ? a.lesson.id : null,
    lesson_title: a.lesson && !a.lesson.deletedAt ? a.lesson.title : null,
    title: a.title,
    ...descriptionView(a.description),
    ...(staff ? { description: a.description ?? "", published: a.published } : {}),
    due_at: a.dueAt?.toISOString() ?? null,
    max_points: Number(a.maxPoints),
    pass_points: num(a.passPoints),
    files: parseFiles(a.attachmentsJson),
    locked,
    is_staff: staff,
    status: statusOf(s),
    submission: s ? submissionView(s, a) : null,
  };
}

/** Kept for older clients: the student's own submission (404 when there is none). */
export async function mySubmission(user: AuthUser, assignmentId: string) {
  const a = await loadAssignment(assignmentId);
  const row = await prisma.submission.findFirst({
    where: { assignmentId: a.id, studentId: user.user_id, deletedAt: null },
    orderBy: { submittedAt: "desc" },
  });
  if (!row) throw Err.notFound("submission not found");
  return { assignment_id: a.id, ...submissionView(row, a) };
}

const MAX_FILES = 5;

/** Submit (or replace, until graded) the student's answer: text and/or files uploaded with a ticket. */
export async function submit(
  user: AuthUser,
  assignmentId: string,
  input: { body?: unknown; files?: unknown; file_url?: unknown }
) {
  const a = await loadAssignment(assignmentId);
  const ctx = await courseContext(user, a.courseId, "member");
  if (ctx.staff) throw Err.invalidInput("course staff do not submit assignments");
  if (!isVisible(a)) throw Err.notFound("assignment not found");
  await assertItemOpen(user, ctx, a);

  const body = String(input.body ?? "").trim();
  if (body.length > 20_000) throw Err.invalidInput("the answer is too long (max 20,000 characters)");
  const prefix = `submissions/${a.id}/${user.user_id}/`;
  const rawFiles = Array.isArray(input.files) ? input.files : input.file_url ? [{ url: input.file_url }] : [];
  if (rawFiles.length > MAX_FILES) throw Err.invalidInput(`at most ${MAX_FILES} files`);
  const files: FileRef[] = rawFiles.map((f) => {
    const o = (f ?? {}) as Record<string, unknown>;
    const url = checkUploadedUrl(o.url, prefix);
    const name = String(o.name ?? "").trim().slice(0, 200) || decodeURIComponent(url.split("/").pop() || "") || "File";
    const size = Number(o.size);
    return { name, url, size: Number.isFinite(size) && size > 0 ? Math.round(size) : null, mime: mimeFor(url) };
  });
  if (!body && !files.length) throw Err.invalidInput("write an answer or attach a file");

  const t = now();
  const existing = await prisma.submission.findFirst({
    where: { assignmentId: a.id, studentId: user.user_id, deletedAt: null },
    orderBy: { submittedAt: "desc" },
  });
  if (existing?.gradedAt) throw new ApiError(409, "already_graded", "This assignment is already graded — it can no longer be changed.");
  const data = {
    body: body || null,
    fileUrl: files[0]?.url ?? null,
    attachmentsJson: files.length ? JSON.stringify(files) : null,
    submittedAt: t,
    updatedAt: t,
  };
  if (existing) await prisma.submission.update({ where: { id: existing.id }, data });
  else await prisma.submission.create({ data: { id: newId(), assignmentId: a.id, studentId: user.user_id, createdAt: t, ...data } });

  await recordLearningActivity(user.user_id, t);
  if (!existing) {
    const student = await prisma.user.findFirst({ where: { id: user.user_id }, select: { name: true } });
    notify({
      userId: a.course.instructorId,
      kind: "assignment_submitted",
      ref: `${a.id}:${user.user_id}`,
      title: `New submission: ${a.title}`,
      body: `${student?.name ?? "A student"} submitted “${a.title}” in ${a.course.title}.`,
      link: `/dashboard/assignments?assignment=${a.id}`,
    });
  }
  return getAssignment(user, a.id);
}

// ───────────────────────────── staff ─────────────────────────────

function staffView(
  a: {
    id: string;
    courseId: string;
    sectionId: string | null;
    lessonId: string | null;
    title: string;
    description: string | null;
    dueAt: Date | null;
    maxPoints: unknown;
    passPoints: unknown;
    attachmentsJson: string | null;
    published: boolean;
    legacyWpId?: bigint | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  },
  extra: Record<string, unknown> = {}
) {
  return ser({
    id: a.id,
    course_id: a.courseId,
    section_id: a.sectionId,
    lesson_id: a.lessonId,
    title: a.title,
    description: a.description ?? "",
    due_at: a.dueAt?.toISOString() ?? null,
    max_points: Number(a.maxPoints),
    pass_points: num(a.passPoints),
    files: parseFiles(a.attachmentsJson),
    published: a.published,
    is_legacy: a.legacyWpId != null,
    created_at: a.createdAt?.toISOString(),
    updated_at: a.updatedAt?.toISOString(),
    ...extra,
  });
}

/** GET courses/:id/assignments — staff: every assignment (drafts, not placed); students: their list. */
export async function listForCourse(user: AuthUser, courseId: string) {
  const ctx = await courseContext(user, courseId, "member");
  if (!ctx.staff) {
    const out = await outline(ctx.id);
    return { data: await courseAssignments(user, courseId, { ctx, out, locks: await locksFor(user, ctx, out) }) };
  }
  const rows = await prisma.assignment.findMany({
    where: { courseId: ctx.id, deletedAt: null },
    orderBy: [{ createdAt: "asc" }, { title: "asc" }],
    include: { _count: { select: { submissions: { where: { deletedAt: null } } } } },
  });
  return { data: rows.map((a) => staffView(a, { submission_count: a._count.submissions })) };
}

type AssignmentInput = {
  title?: string;
  description?: string | null;
  due_at?: string | null;
  max_points?: number;
  pass_points?: number | null;
  published?: boolean;
  lesson_id?: string | null;
  files?: unknown;
};

function cleanInput(input: AssignmentInput, courseId: string, current?: { maxPoints: unknown; passPoints: unknown }) {
  const out: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const title = String(input.title ?? "").trim();
    if (!title) throw Err.invalidInput("give the assignment a title");
    if (title.length > 255) throw Err.invalidInput("the title is too long");
    out.title = title;
  }
  if (input.description !== undefined) {
    const d = String(input.description ?? "");
    if (d.length > 100_000) throw Err.invalidInput("the description is too long");
    out.description = d.trim() ? d : null;
  }
  if (input.due_at !== undefined) {
    if (!input.due_at) out.dueAt = null;
    else {
      const d = new Date(input.due_at);
      if (Number.isNaN(d.getTime())) throw Err.invalidInput("invalid due date");
      out.dueAt = d;
    }
  }
  const max = input.max_points === undefined ? Number(current?.maxPoints ?? 100) : Number(input.max_points);
  if (!Number.isFinite(max) || max <= 0 || max > 1000) throw Err.invalidInput("max points must be between 1 and 1000");
  if (input.max_points !== undefined) out.maxPoints = max;
  if (input.pass_points !== undefined) {
    if (input.pass_points === null || (input.pass_points as unknown) === "") out.passPoints = null;
    else {
      const p = Number(input.pass_points);
      if (!Number.isFinite(p) || p < 0 || p > max) throw Err.invalidInput("pass points must be between 0 and the max points");
      out.passPoints = p;
    }
  } else if (current?.passPoints != null && Number(current.passPoints) > max) {
    throw Err.invalidInput("pass points must be between 0 and the max points");
  }
  if (input.published !== undefined) out.published = !!input.published;
  return out;
}

/**
 * The brief's files: files already on the assignment stay as they are (old ones may live elsewhere);
 * a new file must have been uploaded for this course (course-files/<course id>/…).
 */
function briefFiles(raw: unknown, courseId: string, current: FileRef[]): string | null {
  if (!Array.isArray(raw)) throw Err.invalidInput("files must be a list");
  if (raw.length > 10) throw Err.invalidInput("at most 10 files");
  const byUrl = new Map(current.map((f) => [f.url, f]));
  const files: FileRef[] = raw.map((f) => {
    const o = (f ?? {}) as Record<string, unknown>;
    const name = String(o.name ?? "").trim().slice(0, 200);
    const old = byUrl.get(String(o.url ?? ""));
    if (old) return { ...old, name: name || old.name };
    const url = checkUploadedUrl(o.url, `course-files/${courseId}/`);
    const size = Number(o.size);
    return {
      name: name || decodeURIComponent(url.split("/").pop() || "") || "File",
      url,
      size: Number.isFinite(size) && size > 0 ? Math.round(size) : null,
      mime: mimeFor(url),
    };
  });
  return files.length ? JSON.stringify(files) : null;
}

async function staffAssignment(user: AuthUser, id: string) {
  const a = await loadAssignment(id);
  if (user.role !== "admin" && a.course.instructorId !== user.user_id) throw Err.forbidden();
  return a;
}

/** Course Builder: a new assignment under a lesson. */
export async function createForCourse(user: AuthUser, courseId: string, input: AssignmentInput) {
  const ctx = await courseContext(user, courseId, "staff");
  if (!String(input.title ?? "").trim()) throw Err.invalidInput("give the assignment a title");
  const data = cleanInput(input, ctx.id);
  const place = await resolvePlacement(ctx.id, { lesson_id: input.lesson_id }, { requireLesson: true });
  const t = now();
  const row = await prisma.assignment.create({
    data: {
      id: newId(),
      courseId: ctx.id,
      title: String(data.title),
      description: (data.description as string | null | undefined) ?? null,
      dueAt: (data.dueAt as Date | null | undefined) ?? null,
      maxPoints: (data.maxPoints as number | undefined) ?? 100,
      passPoints: (data.passPoints as number | null | undefined) ?? null,
      attachmentsJson: input.files === undefined ? null : briefFiles(input.files, ctx.id, []),
      published: input.published === undefined ? true : !!input.published,
      sectionId: place.sectionId,
      lessonId: place.lessonId,
      sortOrder: await nextItemOrder(place),
      createdAt: t,
      updatedAt: t,
    },
  });
  return staffView(row, { submission_count: 0 });
}

export async function updateAssignment(user: AuthUser, id: string, input: AssignmentInput) {
  const a = await staffAssignment(user, id);
  const data = cleanInput(input, a.courseId, a);
  const place =
    input.lesson_id !== undefined ? await resolvePlacement(a.courseId, { lesson_id: input.lesson_id }, { requireLesson: true }) : undefined;
  const files = input.files === undefined ? undefined : briefFiles(input.files, a.courseId, parseFiles(a.attachmentsJson));
  // moved to another lesson: it goes after that lesson's other quizzes / assignments
  const moved = !!place && (place.lessonId !== a.lessonId || place.sectionId !== a.sectionId);
  const row = await prisma.assignment.update({
    where: { id: a.id },
    data: {
      ...data,
      ...(files !== undefined ? { attachmentsJson: files } : {}),
      ...(place ?? {}),
      ...(moved && place ? { sortOrder: await nextItemOrder(place) } : {}),
      updatedAt: now(),
    },
  });
  return staffView(row);
}

export async function deleteAssignment(user: AuthUser, id: string) {
  const a = await staffAssignment(user, id);
  await prisma.assignment.update({
    where: { id: a.id },
    data: { deletedAt: now(), updatedAt: now() },
  });
}

/** Staff → Assignments: every assignment of the courses I teach (admins: all), with counts to grade. */
export async function staffAssignments(user: AuthUser) {
  if (user.role !== "admin" && user.role !== "instructor") throw Err.forbidden();
  const rows = await prisma.assignment.findMany({
    where: {
      deletedAt: null,
      course: { deletedAt: null, ...(user.role === "admin" ? {} : { instructorId: user.user_id }) },
    },
    include: {
      course: { select: { id: true, title: true, slug: true } },
      section: { select: { title: true, sortOrder: true, deletedAt: true } },
      lesson: { select: { title: true, sortOrder: true, deletedAt: true } },
      _count: { select: { submissions: { where: { deletedAt: null } } } },
    },
  });
  const ungraded = await prisma.submission.groupBy({
    by: ["assignmentId"],
    where: { deletedAt: null, gradedAt: null, assignmentId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  });
  const toGrade = new Map(ungraded.map((g) => [g.assignmentId, g._count._all]));
  const data = rows
    .sort(
      (a, b) =>
        (toGrade.get(b.id) ?? 0) - (toGrade.get(a.id) ?? 0) ||
        a.course.title.localeCompare(b.course.title) ||
        Number(a.section?.sortOrder ?? 0) - Number(b.section?.sortOrder ?? 0) ||
        Number(a.lesson?.sortOrder ?? -1) - Number(b.lesson?.sortOrder ?? -1) ||
        a.sortOrder - b.sortOrder
    )
    .map((a) =>
      staffView(a, {
        course: a.course,
        section_title: a.section && !a.section.deletedAt ? a.section.title : null,
        lesson_title: a.lesson && !a.lesson.deletedAt ? a.lesson.title : null,
        placed: !!a.section && !a.section.deletedAt,
        submission_count: a._count.submissions,
        ungraded_count: toGrade.get(a.id) ?? 0,
      })
    );
  return { data };
}

/** Staff: the submissions of one assignment (newest first) with the student's answer and files. */
export async function listSubmissions(user: AuthUser, assignmentId: string) {
  const a = await staffAssignment(user, assignmentId);
  const rows = await prisma.submission.findMany({
    where: { assignmentId: a.id, deletedAt: null },
    include: { student: { select: { id: true, name: true, email: true } } },
    orderBy: [{ gradedAt: { sort: "asc", nulls: "first" } }, { submittedAt: "desc" }],
  });
  return {
    assignment: {
      id: a.id,
      title: a.title,
      course: { id: a.course.id, title: a.course.title, slug: a.course.slug },
      max_points: Number(a.maxPoints),
      pass_points: num(a.passPoints),
      due_at: a.dueAt?.toISOString() ?? null,
    },
    data: rows.map((s) => ({
      ...submissionView(s, a),
      student: s.student,
      student_id: s.studentId,
    })),
  };
}

/** Grade (or re-grade) a submission; the student gets a notification and an e-mail once. */
export async function gradeSubmission(user: AuthUser, submissionId: string, input: { grade?: unknown; feedback?: unknown }) {
  assertUuid(submissionId, "submission not found");
  const s = await prisma.submission.findFirst({
    where: { id: submissionId, deletedAt: null },
    include: { assignment: { include: { course: true } } },
  });
  if (!s || s.assignment.deletedAt) throw Err.notFound("submission not found");
  if (user.role !== "admin" && s.assignment.course.instructorId !== user.user_id) throw Err.forbidden();
  const max = Number(s.assignment.maxPoints);
  const grade = Number(input.grade);
  if (input.grade === undefined || input.grade === null || input.grade === "" || !Number.isFinite(grade) || grade < 0 || grade > max) {
    throw Err.invalidInput(`the grade must be between 0 and ${max}`);
  }
  const feedback = String(input.feedback ?? "").trim().slice(0, 10_000) || null;
  const t = now();
  await prisma.submission.update({
    where: { id: s.id },
    data: { grade, feedback, gradedAt: t, gradedById: user.user_id, updatedAt: t },
  });
  const pass = num(s.assignment.passPoints);
  const verdict = pass == null ? "" : grade >= pass ? " — passed" : " — not passed";
  notify({
    userId: s.studentId,
    kind: "assignment_graded",
    ref: s.id,
    title: `Assignment graded: ${s.assignment.title}`,
    body: `You got ${grade} / ${max}${verdict}.${feedback ? ` Feedback: ${feedback.slice(0, 300)}` : ""}`,
    link: `/learn/${encodeURIComponent(s.assignment.course.slug)}?assignment=${s.assignment.id}`,
    email: {
      subject: `Your assignment was graded: ${s.assignment.title}`,
      lines: [
        `Your answer to “${s.assignment.title}” in ${s.assignment.course.title} was graded: ${grade} / ${max}${verdict}.`,
        ...(feedback ? [`Feedback from your instructor: ${feedback.slice(0, 1000)}`] : []),
      ],
      cta: "See your result",
    },
  });
  // Phase 2: a passing grade can be the last requirement of the student's certificate
  let certificate_issued = false;
  if (grade >= (pass ?? 0)) {
    try {
      const { completeCourseAndIssue } = await import("./misc");
      certificate_issued = !!(await completeCourseAndIssue(s.studentId, s.assignment.courseId));
    } catch {
      /* other requirements are not met yet */
    }
  }
  return { ok: true, grade, feedback, graded_at: t.toISOString(), certificate_issued };
}
