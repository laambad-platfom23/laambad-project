/**
 * Course resources for students: downloadable PDFs, documents, presentations and other materials.
 *
 *  - Files from the old WordPress / Tutor site (_tutor_attachments on courses, products and lessons)
 *    are listed in src/server/data/legacy-resources.json (built by scripts/import-legacy-resources.mjs).
 *    The files stay in the old site's S3 bucket (WP Offload Media, lmresource); the list never contains
 *    their address: GET /api/v1/resources/<id>/link answers it only to members of the course.
 *  - A6: files and links the instructor adds in the Course Builder (table course_resources), under a
 *    lesson or for the whole course. Files are on Vercel Blob; the address goes to members only.
 *  - Links saved on a lesson by the older curriculum editor (lessons.attachments_json) still show.
 */
import legacy from "@/server/data/legacy-resources.json";
import { prisma, newId, now } from "@/lib/db";
import { Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { assertUuid, isUuid } from "@/lib/uuid";
import { downloadLink } from "@/server/s3";
import { courseContext, outline, type CourseCtx, type Outline } from "./curriculum";
import { checkUploadedUrl, mimeFor } from "./uploads";

type LegacyFile = { id: string; name: string; mime: string; size: number | null; url: string; course_id: string };
type LegacyData = { courses: Record<string, LegacyFile[]>; lessons: Record<string, LegacyFile[]> };
const DATA = legacy as unknown as LegacyData;

let byId: Map<string, LegacyFile> | null = null;
function index() {
  if (!byId) {
    byId = new Map();
    for (const list of [...Object.values(DATA.courses), ...Object.values(DATA.lessons)]) for (const f of list) byId.set(f.id, f);
  }
  return byId;
}

export type FileItem = {
  id: string;
  name: string;
  mime: string;
  size: number | null;
  download: string;
  /** old_site = migrated Tutor attachment (read-only); builder = added in the Course Builder */
  source: "old_site" | "builder";
};
type LinkItem = { id?: string; name: string; url: string };

function legacyView(f: LegacyFile): FileItem {
  return { id: f.id, name: f.name, mime: f.mime, size: f.size, download: `/api/v1/resources/${encodeURIComponent(f.id)}/link`, source: "old_site" };
}

type ResourceRow = Awaited<ReturnType<typeof prisma.courseResource.findMany>>[number];

function builderFile(r: ResourceRow): FileItem {
  return {
    id: r.id,
    name: r.title,
    mime: r.mime || mimeFor(r.fileName || r.url),
    size: r.size == null ? null : Number(r.size),
    download: `/api/v1/resources/${r.id}/link`,
    source: "builder",
  };
}

function linkList(json: string | null) {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => ({ name: String(x?.name ?? "").trim(), url: String(x?.url ?? "").trim() }))
      .filter((x) => x.url && /^https?:\/\//i.test(x.url))
      .map((x) => ({ name: x.name || x.url.split("/").pop() || "Attachment", url: x.url }));
  } catch {
    return [];
  }
}

/**
 * All resources of a course: course-level files/links + per-lesson files and links, lessons in
 * course order. `pre` lets the learn page reuse one access check for all its lists.
 */
export async function courseResources(user: AuthUser, courseId: string, pre?: { ctx: CourseCtx; out: Outline }) {
  const ctx = pre?.ctx ?? (await courseContext(user, courseId, "member"));
  const out = pre?.out ?? (await outline(ctx.id));
  const lessonIds = out.flatMap((s) => s.lessons.map((l) => l.id));
  const [rows, attachments] = await Promise.all([
    prisma.courseResource.findMany({
      where: { courseId: ctx.id, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    lessonIds.length
      ? prisma.lesson.findMany({ where: { id: { in: lessonIds }, attachmentsJson: { not: null } }, select: { id: true, attachmentsJson: true } })
      : Promise.resolve([] as { id: string; attachmentsJson: string | null }[]),
  ]);
  const oldLinks = new Map(attachments.map((l) => [l.id, linkList(l.attachmentsJson)]));
  const live = new Set(lessonIds);

  const perLesson = out
    .flatMap((s) => s.lessons.map((l) => ({ l, s })))
    .map(({ l, s }) => {
      const mine = rows.filter((r) => r.lessonId === l.id);
      return {
        lesson_id: l.id,
        lesson_title: l.title,
        section_id: s.id,
        section_title: s.title,
        files: [...(DATA.lessons[l.id] ?? []).map(legacyView), ...mine.filter((r) => r.kind === "file").map(builderFile)],
        links: [
          ...mine.filter((r) => r.kind === "link").map((r): LinkItem => ({ id: r.id, name: r.title, url: r.url })),
          ...(oldLinks.get(l.id) ?? []),
        ],
      };
    })
    .filter((l) => l.files.length || l.links.length);

  // course-level: old-site course files + builder items without a lesson (or whose lesson is gone)
  const general = rows.filter((r) => !r.lessonId || !live.has(r.lessonId));
  const course = [...(DATA.courses[ctx.id] ?? []).map(legacyView), ...general.filter((r) => r.kind === "file").map(builderFile)];
  const course_links = general.filter((r) => r.kind === "link").map((r): LinkItem => ({ id: r.id, name: r.title, url: r.url }));
  const total = course.length + course_links.length + perLesson.reduce((n, l) => n + l.files.length + l.links.length, 0);
  return { course, course_links, lessons: perLesson, total };
}

/**
 * The address of one file, for a member of its course only: a builder file (Vercel Blob) or a
 * migrated file in the old site's S3 bucket (signed link when the S3 keys are configured).
 */
export async function resourceLink(user: AuthUser, id: string) {
  if (isUuid(id)) {
    const r = await prisma.courseResource.findFirst({ where: { id, deletedAt: null } });
    if (!r) throw Err.notFound("file not found");
    await courseContext(user, r.courseId, "member");
    return { name: r.title, url: r.url };
  }
  const f = index().get(id);
  if (!f) throw Err.notFound("file not found");
  await courseContext(user, f.course_id, "member");
  // A5: signed S3 link (expires in 5 minutes) once the S3 keys are configured
  const link = await downloadLink(f.url, f.name);
  return { name: f.name, ...link };
}

// ───────────────────────────── Course Builder (staff) ─────────────────────────────

function staffView(r: ResourceRow) {
  return {
    id: r.id,
    course_id: r.courseId,
    lesson_id: r.lessonId,
    title: r.title,
    kind: r.kind,
    url: r.url,
    file_name: r.fileName,
    mime: r.mime,
    size: r.size == null ? null : Number(r.size),
    sort_order: r.sortOrder,
    created_at: r.createdAt.toISOString(),
  };
}

/** Builder list: this course's builder resources + the old site's files (read-only). */
export async function builderResources(courseId: string) {
  const rows = await prisma.courseResource.findMany({
    where: { courseId, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const lessons = await prisma.lesson.findMany({
    where: { deletedAt: null, section: { courseId, deletedAt: null } },
    select: { id: true },
  });
  return {
    resources: rows.map(staffView),
    legacy: {
      course: (DATA.courses[courseId] ?? []).map(legacyView),
      lessons: lessons
        .filter((l) => DATA.lessons[l.id]?.length)
        .map((l) => ({ lesson_id: l.id, files: DATA.lessons[l.id].map(legacyView) })),
    },
  };
}

type ResourceInput = {
  lesson_id?: string | null;
  title?: string;
  kind?: string;
  url?: string;
  file_name?: string;
  size?: number;
};

async function lessonOf(courseId: string, lessonId: string | null | undefined) {
  if (!lessonId) return null;
  if (!isUuid(lessonId)) throw Err.invalidInput("invalid lesson");
  const l = await prisma.lesson.findFirst({
    where: { id: lessonId, deletedAt: null, section: { courseId, deletedAt: null } },
    select: { id: true },
  });
  if (!l) throw Err.invalidInput("the lesson is not part of this course");
  return l.id;
}

export async function createResource(user: AuthUser, courseId: string, input: ResourceInput) {
  const ctx = await courseContext(user, courseId, "staff");
  const kind = input.kind === "link" ? "link" : "file";
  let url: string;
  let fileName: string | null = null;
  if (kind === "link") {
    url = String(input.url ?? "").trim();
    if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 2000) throw Err.invalidInput("enter a valid link (https://…)");
  } else {
    url = checkUploadedUrl(input.url, `course-files/${ctx.id}/`);
    fileName = String(input.file_name ?? "").trim().slice(0, 255) || decodeURIComponent(url.split("/").pop() || "") || null;
  }
  const title =
    String(input.title ?? "").trim().slice(0, 255) ||
    fileName ||
    (kind === "link" ? url.replace(/^https?:\/\//i, "").slice(0, 120) : "File");
  const lessonId = await lessonOf(ctx.id, input.lesson_id);
  const size = Number(input.size);
  const last = await prisma.courseResource.findFirst({
    where: { courseId: ctx.id, lessonId, deletedAt: null },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const t = now();
  const row = await prisma.courseResource.create({
    data: {
      id: newId(),
      courseId: ctx.id,
      lessonId,
      title,
      kind,
      url,
      fileName,
      mime: kind === "file" ? mimeFor(fileName || url) : null,
      size: kind === "file" && Number.isFinite(size) && size > 0 ? BigInt(Math.round(size)) : null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      createdBy: user.user_id,
      createdAt: t,
      updatedAt: t,
    },
  });
  return staffView(row);
}

async function staffResource(user: AuthUser, id: string) {
  assertUuid(id, "resource not found");
  const r = await prisma.courseResource.findFirst({ where: { id, deletedAt: null } });
  if (!r) throw Err.notFound("resource not found");
  await courseContext(user, r.courseId, "staff");
  return r;
}

export async function updateResource(user: AuthUser, id: string, input: { title?: string; lesson_id?: string | null }) {
  const r = await staffResource(user, id);
  const title = input.title === undefined ? undefined : String(input.title ?? "").trim().slice(0, 255);
  if (title === "") throw Err.invalidInput("the title is empty");
  const lessonId = input.lesson_id === undefined ? undefined : await lessonOf(r.courseId, input.lesson_id);
  const row = await prisma.courseResource.update({
    where: { id: r.id },
    data: { title, lessonId, updatedAt: now() },
  });
  return staffView(row);
}

export async function deleteResource(user: AuthUser, id: string) {
  const r = await staffResource(user, id);
  await prisma.courseResource.update({ where: { id: r.id }, data: { deletedAt: now(), updatedAt: now() } });
}
