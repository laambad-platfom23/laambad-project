/**
 * A7 — the student's notebook: notes written under a lesson video. A note belongs to its author only
 * (nobody else, staff included, can read it) and remembers the video position it was written at.
 */
import type { Prisma } from "@prisma/client";
import { prisma, newId, now } from "@/lib/db";
import { Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { assertUuid, isUuid } from "@/lib/uuid";
import { courseContext } from "./curriculum";

const MAX_BODY = 10_000;

type NoteRow = Awaited<ReturnType<typeof loadNotes>>[number];

function loadNotes(where: Prisma.LessonNoteWhereInput, take = 500) {
  return prisma.lessonNote.findMany({
    where,
    include: {
      course: { select: { id: true, title: true, slug: true } },
      lesson: { select: { id: true, title: true, deletedAt: true, section: { select: { title: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

function view(n: NoteRow) {
  return {
    id: n.id,
    course: { id: n.course.id, title: n.course.title, slug: n.course.slug },
    lesson: { id: n.lesson.id, title: n.lesson.title, section_title: n.lesson.section.title, deleted: !!n.lesson.deletedAt },
    body: n.body,
    position_secs: n.positionSecs,
    created_at: n.createdAt.toISOString(),
    updated_at: n.updatedAt.toISOString(),
  };
}

function cleanBody(raw: unknown) {
  const body = String(raw ?? "").trim();
  if (!body) throw Err.invalidInput("write something first");
  if (body.length > MAX_BODY) throw Err.invalidInput("the note is too long (max 10,000 characters)");
  return body;
}

/** My notes, newest first; optionally one course / one lesson / a search word. */
export async function listNotes(user: AuthUser, filter: { course_id?: string | null; lesson_id?: string | null; q?: string | null }) {
  const q = filter.q?.trim().slice(0, 100);
  const rows = await loadNotes({
    userId: user.user_id,
    deletedAt: null,
    ...(isUuid(filter.course_id) ? { courseId: filter.course_id } : {}),
    ...(isUuid(filter.lesson_id) ? { lessonId: filter.lesson_id } : {}),
    ...(q ? { body: { contains: q, mode: "insensitive" as const } } : {}),
    course: { deletedAt: null },
  });
  return { data: rows.map(view) };
}

/** A new note under a lesson of a course I can open. */
export async function createNote(user: AuthUser, input: { lesson_id?: unknown; body?: unknown; position_secs?: unknown }) {
  const lessonId = assertUuid(input.lesson_id, "lesson not found");
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, deletedAt: null, section: { deletedAt: null } },
    select: { id: true, section: { select: { courseId: true } } },
  });
  if (!lesson) throw Err.notFound("lesson not found");
  await courseContext(user, lesson.section.courseId, "member");
  const body = cleanBody(input.body);
  const pos = Number(input.position_secs);
  const positionSecs = input.position_secs == null || !Number.isFinite(pos) || pos < 0 || pos > 86_400 ? null : Math.floor(pos);
  const t = now();
  const row = await prisma.lessonNote.create({
    data: { id: newId(), userId: user.user_id, courseId: lesson.section.courseId, lessonId: lesson.id, body, positionSecs, createdAt: t, updatedAt: t },
  });
  const [full] = await loadNotes({ id: row.id }, 1);
  return view(full);
}

async function ownNote(user: AuthUser, id: string) {
  assertUuid(id, "note not found");
  const n = await prisma.lessonNote.findFirst({ where: { id, deletedAt: null } });
  // someone else's note: answer as if it did not exist
  if (!n || n.userId !== user.user_id) throw Err.notFound("note not found");
  return n;
}

export async function updateNote(user: AuthUser, id: string, input: { body?: unknown }) {
  const n = await ownNote(user, id);
  await prisma.lessonNote.update({ where: { id: n.id }, data: { body: cleanBody(input.body), updatedAt: now() } });
  const [full] = await loadNotes({ id: n.id }, 1);
  return view(full);
}

export async function deleteNote(user: AuthUser, id: string) {
  const n = await ownNote(user, id);
  await prisma.lessonNote.update({ where: { id: n.id }, data: { deletedAt: now(), updatedAt: now() } });
}
