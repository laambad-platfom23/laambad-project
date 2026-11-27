/**
 * A2 — Learning paths: an admin-made, ordered list of courses ("program"). Students see the published
 * paths and their own progress through each one.
 */
import { prisma, newId, now } from "@/lib/db";
import { Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { courseCoverUrl } from "./courses";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { hasCourseAccess } from "@/server/enrollment-status";
import { assertUuid, isUuid } from "@/lib/uuid";

const LEVELS = new Set(["beginner", "intermediate", "advanced", "all"]);

export function slugify(raw: string) {
  return (
    raw
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 200) || "item"
  );
}

async function uniquePathSlug(base: string, exceptId?: string) {
  let slug = slugify(base);
  for (let i = 2; i < 50; i++) {
    const taken = await prisma.learningPath.findFirst({ where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) } });
    if (!taken) return slug;
    slug = `${slugify(base)}-${i}`;
  }
  return `${slugify(base)}-${newId().slice(0, 6)}`;
}

function cleanUrl(u: unknown): string | null {
  const s = String(u ?? "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s) && !s.startsWith("/")) throw Err.invalidInput("cover must be a URL");
  return s.slice(0, 1024);
}

const COURSE_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  level: true,
  status: true,
  legacyThumbnailId: true,
  deletedAt: true,
  instructor: { select: { name: true } },
} as const;

type PathRow = Awaited<ReturnType<typeof loadPath>>;
async function loadPath(where: { id?: string; slug?: string }) {
  return prisma.learningPath.findFirst({
    where: { ...where, deletedAt: null },
    include: { courses: { orderBy: { sortOrder: "asc" }, include: { course: { select: COURSE_SELECT } } } },
  });
}

async function coverMap(courseIds: string[]) {
  // course covers: uploaded thumbnail (site setting style) is not modelled; use the legacy cover
  const rows = await prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, legacyThumbnailId: true, coverUrl: true } });
  return new Map(rows.map((r) => [r.id, courseCoverUrl(r)]));
}

/** Student progress per course of a path (lessons done / total, finished, has access). */
async function progressFor(userId: string, courseIds: string[]) {
  if (!courseIds.length) return new Map<string, { done: number; total: number; enrolled: boolean; finished: boolean }>();
  const [lessons, done, enrollments] = await Promise.all([
    prisma.lesson.findMany({
      where: { deletedAt: null, section: { courseId: { in: courseIds }, deletedAt: null } },
      select: { id: true, section: { select: { courseId: true } } },
    }),
    prisma.lessonProgress.findMany({
      where: { userId, completed: true, deletedAt: null, lesson: { section: { courseId: { in: courseIds } } } },
      select: { lessonId: true },
    }),
    prisma.enrollment.findMany({
      where: { userId, courseId: { in: courseIds }, deletedAt: null },
      select: { courseId: true, status: true, paymentStatus: true, completedAt: true },
    }),
  ]);
  const doneSet = new Set(done.map((d) => d.lessonId));
  const out = new Map<string, { done: number; total: number; enrolled: boolean; finished: boolean }>();
  for (const id of courseIds) out.set(id, { done: 0, total: 0, enrolled: false, finished: false });
  for (const l of lessons) {
    const o = out.get(l.section.courseId)!;
    o.total++;
    if (doneSet.has(l.id)) o.done++;
  }
  for (const e of enrollments) {
    if (!hasCourseAccess(e)) continue;
    const o = out.get(e.courseId)!;
    o.enrolled = true;
    if (e.completedAt) o.finished = true;
  }
  for (const o of out.values()) if (o.total > 0 && o.done >= o.total) o.finished = true;
  return out;
}

function pathView(p: NonNullable<PathRow>, opts: { admin: boolean; covers: Map<string, string | null> }) {
  const courses = p.courses
    .filter((pc) => pc.course && !pc.course.deletedAt && (opts.admin || pc.course.status === "published"))
    .map((pc) => ({
      id: pc.course.id,
      slug: pc.course.slug,
      title: decodeHtmlEntities(pc.course.title),
      excerpt: pc.course.excerpt ? decodeHtmlEntities(pc.course.excerpt).slice(0, 240) : null,
      level: pc.course.level,
      status: pc.course.status,
      instructor_name: pc.course.instructor?.name ?? null,
      cover_url: opts.covers.get(pc.course.id) ?? null,
      sort_order: pc.sortOrder,
    }));
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    description: p.description,
    cover_url: p.coverUrl ?? courses.find((c) => c.cover_url)?.cover_url ?? null,
    level: p.level,
    status: p.status,
    sort_order: p.sortOrder,
    course_count: courses.length,
    courses,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  };
}

/** Published paths (students); every path (admin). */
export async function listPaths(user: AuthUser | null) {
  const admin = user?.role === "admin";
  const rows = await prisma.learningPath.findMany({
    where: { deletedAt: null, ...(admin ? {} : { status: "published" }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: { courses: { orderBy: { sortOrder: "asc" }, include: { course: { select: COURSE_SELECT } } } },
  });
  const allIds = [...new Set(rows.flatMap((r) => r.courses.map((c) => c.courseId)))];
  const covers = await coverMap(allIds);
  const views = rows.map((r) => pathView(r, { admin, covers }));
  if (!user) return views;
  const prog = await progressFor(user.user_id, allIds);
  return views.map((v) => withProgress(v, prog));
}

function withProgress(
  v: ReturnType<typeof pathView>,
  prog: Map<string, { done: number; total: number; enrolled: boolean; finished: boolean }>
) {
  const courses = v.courses.map((c) => {
    const p = prog.get(c.id);
    return {
      ...c,
      enrolled: !!p?.enrolled,
      finished: !!p?.finished,
      lessons_done: p?.done ?? 0,
      lessons_total: p?.total ?? 0,
    };
  });
  const finished = courses.filter((c) => c.finished).length;
  const next = courses.find((c) => !c.finished) ?? null;
  return {
    ...v,
    courses,
    finished_courses: finished,
    progress_percent: courses.length ? Math.round((finished / courses.length) * 100) : 0,
    next_course_slug: next?.slug ?? null,
  };
}

export async function getPath(user: AuthUser | null, slugOrId: string) {
  const p = await loadPath(isUuid(slugOrId) ? { id: slugOrId } : { slug: slugOrId });
  const admin = user?.role === "admin";
  if (!p || (!admin && p.status !== "published")) throw Err.notFound("learning path not found");
  const covers = await coverMap(p.courses.map((c) => c.courseId));
  const v = pathView(p, { admin, covers });
  if (!user) return v;
  return withProgress(v, await progressFor(user.user_id, p.courses.map((c) => c.courseId)));
}

type PathInput = {
  title?: string;
  slug?: string;
  description?: string | null;
  cover_url?: string | null;
  level?: string | null;
  status?: string;
  sort_order?: number;
  course_ids?: string[];
};

async function validCourseIds(ids: unknown): Promise<string[]> {
  if (!Array.isArray(ids)) throw Err.invalidInput("course_ids must be a list");
  const list = [...new Set(ids.map(String))].slice(0, 50);
  if (list.some((id) => !isUuid(id))) throw Err.invalidInput("some courses were not found");
  if (!list.length) return [];
  const found = await prisma.course.findMany({ where: { id: { in: list }, deletedAt: null }, select: { id: true } });
  const ok = new Set(found.map((f) => f.id));
  const missing = list.filter((id) => !ok.has(id));
  if (missing.length) throw Err.invalidInput("some courses were not found");
  return list;
}

function cleanFields(input: PathInput) {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const title = String(input.title).trim();
    if (!title) throw Err.invalidInput("title is required");
    data.title = title.slice(0, 255);
  }
  if (input.description !== undefined) data.description = input.description ? String(input.description).slice(0, 10_000) : null;
  if (input.cover_url !== undefined) data.coverUrl = cleanUrl(input.cover_url);
  if (input.level !== undefined) {
    const lv = input.level ? String(input.level).toLowerCase() : null;
    if (lv && !LEVELS.has(lv)) throw Err.invalidInput("invalid level");
    data.level = lv;
  }
  if (input.status !== undefined) {
    if (!["draft", "published"].includes(String(input.status))) throw Err.invalidInput("invalid status");
    data.status = String(input.status);
  }
  if (input.sort_order !== undefined) data.sortOrder = Math.max(-9999, Math.min(9999, Math.floor(Number(input.sort_order) || 0)));
  return data;
}

export async function createPath(user: AuthUser, input: PathInput) {
  const data = cleanFields(input);
  if (!data.title) throw Err.invalidInput("title is required");
  const courseIds = input.course_ids ? await validCourseIds(input.course_ids) : [];
  const id = newId();
  const t = now();
  const slug = await uniquePathSlug(input.slug?.trim() || String(data.title));
  await prisma.$transaction([
    prisma.learningPath.create({
      data: { id, slug, createdBy: user.user_id, createdAt: t, updatedAt: t, ...(data as { title: string }) },
    }),
    prisma.learningPathCourse.createMany({
      data: courseIds.map((courseId, i) => ({ pathId: id, courseId, sortOrder: i })),
    }),
  ]);
  return getPath(user, id);
}

export async function updatePath(user: AuthUser, id: string, input: PathInput) {
  assertUuid(id, "learning path not found");
  const existing = await prisma.learningPath.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw Err.notFound("learning path not found");
  const data = cleanFields(input);
  if (input.slug !== undefined && input.slug.trim() && slugify(input.slug) !== existing.slug) {
    data.slug = await uniquePathSlug(input.slug, id);
  }
  const ops = [prisma.learningPath.update({ where: { id }, data: { ...data, updatedAt: now() } })];
  if (input.course_ids !== undefined) {
    const courseIds = await validCourseIds(input.course_ids);
    // the link table is replaced as a whole (it only holds the ordering of the path)
    ops.push(
      prisma.learningPathCourse.deleteMany({ where: { pathId: id } }) as never,
      prisma.learningPathCourse.createMany({
        data: courseIds.map((courseId, i) => ({ pathId: id, courseId, sortOrder: i })),
      }) as never
    );
  }
  await prisma.$transaction(ops);
  return getPath(user, id);
}

/** Soft delete (the row stays, hidden). */
export async function deletePath(id: string) {
  assertUuid(id, "learning path not found");
  const existing = await prisma.learningPath.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw Err.notFound("learning path not found");
  await prisma.learningPath.update({ where: { id }, data: { deletedAt: now(), updatedAt: now() } });
  return { ok: true };
}
