/**
 * Course resources for students: downloadable PDFs, documents, presentations and other materials.
 *
 *  - Files from the old WordPress / Tutor site (_tutor_attachments on courses, products and lessons)
 *    are listed in src/server/data/legacy-resources.json (built by scripts/import-legacy-resources.mjs).
 *    The files stay in the old site's S3 bucket (WP Offload Media, lmresource); the list never contains
 *    their address: GET /api/v1/resources/<id>/link answers it only to members of the course.
 *  - Files the instructor adds to a lesson in the curriculum editor (lessons.attachments_json) are
 *    shown as links, as before.
 */
import legacy from "@/server/data/legacy-resources.json";
import { prisma } from "@/lib/db";
import { Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { findBestEnrollment, hasCourseAccess } from "@/server/enrollment-status";
import { assertUuid } from "@/lib/uuid";
import { downloadLink } from "@/server/s3";

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

async function requireAccess(user: AuthUser, courseId: string) {
  const course = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null }, select: { id: true, instructorId: true } });
  if (!course) throw Err.notFound("course not found");
  if (user.role === "admin" || course.instructorId === user.user_id) return;
  const e = await findBestEnrollment(user.user_id, courseId);
  if (!e || !hasCourseAccess(e)) throw Err.forbidden();
}

function fileView(f: LegacyFile) {
  return { id: f.id, name: f.name, mime: f.mime, size: f.size, download: `/api/v1/resources/${encodeURIComponent(f.id)}/link` };
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

/** All resources of a course: course-level files + per-lesson files and links. */
export async function courseResources(user: AuthUser, courseId: string) {
  assertUuid(courseId, "course not found");
  await requireAccess(user, courseId);
  const lessons = await prisma.lesson.findMany({
    where: { deletedAt: null, section: { courseId, deletedAt: null } },
    select: { id: true, title: true, attachmentsJson: true },
    orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });
  const perLesson = lessons
    .map((l) => ({
      lesson_id: l.id,
      lesson_title: l.title,
      files: (DATA.lessons[l.id] ?? []).map(fileView),
      links: linkList(l.attachmentsJson),
    }))
    .filter((l) => l.files.length || l.links.length);
  const course = (DATA.courses[courseId] ?? []).map(fileView);
  return { course, lessons: perLesson, total: course.length + perLesson.reduce((s, l) => s + l.files.length + l.links.length, 0) };
}

/**
 * The download address of one migrated file, for a member of its course only. The file stays in the
 * old site's S3 bucket (WP Offload Media); the browser downloads it from there directly.
 */
export async function resourceLink(user: AuthUser, id: string) {
  const f = index().get(id);
  if (!f) throw Err.notFound("file not found");
  await requireAccess(user, f.course_id);
  // A5: signed S3 link (expires in 5 minutes) once the S3 keys are configured
  const link = await downloadLink(f.url, f.name);
  return { name: f.name, ...link };
}
