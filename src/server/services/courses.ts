import * as prerequisites from "./prerequisites";
import { isUuid } from "@/lib/uuid";
import { applyLessonAccess, lessonAccess } from "./sequencing";
import * as review from "./course-review";
import { prisma, newId, now } from "@/lib/db";
import type { CoursePricing, Prisma } from "@prisma/client";
import { fromMinor, toMinor, toMinorOrNull } from "@/server/money";
import { Err } from "@/lib/api/errors";
import { ser, toSlug } from "@/server/serialize";
import type { AuthUser } from "@/lib/auth/request";
import { decodeHtmlEntities } from "@/lib/html-entities";
import legacyThumbnails from "@/server/data/legacy-course-thumbnails.json";
import { withLegacyPrice } from "@/server/legacy-prices";
import { localLegacyUpload, userPhotoUrl } from "@/server/legacy-uploads";
// re-exported for older imports
export { localLegacyUpload };
import { blocksToText, htmlToBlocks, looksLikeHtml } from "@/lib/wp-content";

/**
 * Migrated WordPress featured image → local copy under public/legacy-uploads/.
 * The id→path map was extracted from the site's SQL backup (`_wp_attached_file`).
 */
const LEGACY_THUMBS = legacyThumbnails as Record<string, string>;
export function legacyCoverUrl(legacyThumbnailId: bigint | null | undefined): string | null {
  if (legacyThumbnailId == null) return null;
  const path = LEGACY_THUMBS[String(legacyThumbnailId)];
  // Missing from the backup → no cover (the card shows its colour fallback instead of a broken image).
  return path ? localLegacyUpload(path) : null;
}

/** A8: the cover set in this app wins; old-site courses use their WordPress featured image. */
export function courseCoverUrl(c: { coverUrl?: string | null; legacyThumbnailId?: bigint | null }): string | null {
  return c.coverUrl?.trim() || legacyCoverUrl(c.legacyThumbnailId);
}

/** A cover address: an uploaded image (https) or a file of this site (/…), nothing else. */
function cleanCoverUrl(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s.length > 1024) throw Err.invalidInput("the cover image address is too long");
  if (/^https:\/\//i.test(s) || (/^\/[^/]/.test(s) && !s.includes(".."))) return s;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(s)) return s; // local development uploads
  throw Err.invalidInput("the cover must be an uploaded image");
}

/**
 * Old-site upload URLs inside descriptions → local copy when we have it. Files that are in neither the
 * site backup nor S3 (deleted on the old site) are dropped instead of linking to laambad.com.
 */
function rewriteLegacyContentSrc(src: string): string | null {
  const m = src.match(/^https?:\/\/(?:www\.)?laambad\.com\/wp-content\/uploads\/([^?#]+)/i);
  if (!m) return src;
  let path: string;
  try {
    path = decodeURIComponent(m[1]);
  } catch {
    return src;
  }
  return localLegacyUpload(path);
}

/** Description as safe blocks + plain-text summary (migrated WordPress HTML only). */
function descriptionFields(description: string | null) {
  if (!looksLikeHtml(description)) return {};
  const blocks = htmlToBlocks(description!, rewriteLegacyContentSrc);
  const text = blocksToText(blocks);
  return { description_blocks: blocks, summary: text.length > 280 ? text.slice(0, 277).trimEnd() + "…" : text };
}

type CategoryLinkOut = { id: string; name: string; slug: string; is_primary: boolean };

/** All categories of each course (WordPress allows several), primary first. */
async function categoryLinksFor(ids: string[]) {
  const map = new Map<string, CategoryLinkOut[]>();
  if (ids.length === 0) return map;
  const links = await prisma.courseCategoryLink.findMany({
    where: { courseId: { in: ids }, category: { deletedAt: null } },
    include: { category: { select: { id: true, name: true, slug: true } } },
  });
  for (const l of links) {
    const list = map.get(l.courseId) ?? [];
    list.push({
      id: l.category.id,
      name: decodeHtmlEntities(l.category.name),
      slug: l.category.slug,
      is_primary: l.isPrimary,
    });
    map.set(l.courseId, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name));
  }
  return map;
}

/** API shape: money in integer minor units (cents); the database holds Decimal dollars (G1). */
function mapPricing(p: CoursePricing | null) {
  if (!p) return null;
  return {
    id: p.id,
    course_id: p.courseId,
    price: toMinor(p.price),
    currency: p.currency,
    is_free: p.isFree,
    discount_price: toMinorOrNull(p.discountPrice),
    start_date: p.startDate?.toISOString() ?? null,
    end_date: p.endDate?.toISOString() ?? null,
    is_active: p.isActive,
    created_at: p.createdAt?.toISOString(),
    updated_at: p.updatedAt?.toISOString(),
  };
}

function mapLesson(
  l: {
    id: string;
    sectionId: string;
    title: string;
    description: string | null;
    content: string | null;
    videoProvider: string | null;
    videoUrl: string | null;
    attachmentsJson: string | null;
    sortOrder: bigint;
    createdAt: Date | null;
    updatedAt: Date | null;
    vdocipherVideoId?: string | null;
    durationSeconds?: number | null;
    isPreview?: boolean;
  },
  redact = false
) {
  const staffFields = redact ? {} : { vdocipher_video_id: l.vdocipherVideoId ?? undefined };
  // G5: migrated lessons play through VdoCipher (OTP fetched per view); the video id itself is not exposed.
  const vdo = !!l.vdocipherVideoId && !l.videoUrl;
  return {
    id: l.id,
    section_id: l.sectionId,
    title: decodeHtmlEntities(l.title),
    description: l.description || undefined,
    content: redact ? undefined : l.content || undefined,
    video_provider: redact ? undefined : vdo ? "vdocipher" : l.videoProvider || undefined,
    video_url: redact ? undefined : l.videoUrl || undefined,
    has_vdocipher: vdo,
    duration_seconds: l.durationSeconds == null ? undefined : Number(l.durationSeconds),
    is_preview: l.isPreview || undefined,
    ...staffFields,
    attachments_json: redact ? undefined : l.attachmentsJson || undefined,
    sort_order: Number(l.sortOrder),
    created_at: l.createdAt?.toISOString(),
    updated_at: l.updatedAt?.toISOString(),
  };
}

async function courseStats(courseId: string) {
  const [sections, lessons, enrollments] = await Promise.all([
    prisma.section.count({ where: { courseId, deletedAt: null } }),
    prisma.lesson.count({
      where: { deletedAt: null, section: { courseId, deletedAt: null } },
    }),
    prisma.enrollment.count({ where: { courseId, deletedAt: null } }),
  ]);
  return {
    section_count: sections,
    lesson_count: lessons,
    enrollment_count: enrollments,
    attachment_count: 0,
  };
}

async function activePricing(courseId: string) {
  return withLegacyPrice(
    await prisma.coursePricing.findFirst({
      where: { courseId, isActive: true, deletedAt: null },
      orderBy: { updatedAt: "desc" },
    })
  );
}

export async function mapCourse(
  course: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    instructorId: string;
    categoryId: string | null;
    status: string;
    legacyThumbnailId?: bigint | null;
    coverUrl?: string | null;
    excerpt?: string | null;
    level?: string | null;
    priceType?: string | null;
    benefits?: string | null;
    requirements?: string | null;
    targetAudience?: string | null;
    materials?: string | null;
    isPublic?: boolean | null;
    submittedAt?: Date | null;
    reviewNote?: string | null;
    reviewedAt?: Date | null;
    sequentialLessons?: boolean;
    certificateTemplateId?: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
    instructor?: { id: string; name: string; email: string; avatarUrl?: string | null } | null;
    category?: { id: string; name: string; slug: string; sortOrder: bigint } | null;
    sections?: {
      id: string;
      courseId: string;
      title: string;
      sortOrder: bigint;
      createdAt: Date | null;
      updatedAt: Date | null;
      lessons?: {
        id: string;
        sectionId: string;
        title: string;
        description: string | null;
        content: string | null;
        videoProvider: string | null;
        videoUrl: string | null;
        attachmentsJson: string | null;
        sortOrder: bigint;
        createdAt: Date | null;
        updatedAt: Date | null;
      }[];
    }[];
  },
  opts?: {
    redactLessons?: boolean;
    includeSections?: boolean;
    /** Pre-fetched by mapCourseList so a list does not run 4 queries per course. */
    prefetched?: {
      stats: Awaited<ReturnType<typeof courseStats>>;
      pricing: Awaited<ReturnType<typeof activePricing>>;
      categories: CategoryLinkOut[];
      rating?: { average: number; count: number };
      quiz_count?: number;
      assignment_count?: number;
    };
  }
) {
  const stats = opts?.prefetched?.stats ?? (await courseStats(course.id));
  const pricing = opts?.prefetched ? opts.prefetched.pricing : await activePricing(course.id);
  const categories =
    opts?.prefetched?.categories ?? (await categoryLinksFor([course.id])).get(course.id) ?? [];
  const out: Record<string, unknown> = {
    id: course.id,
    title: decodeHtmlEntities(course.title),
    slug: course.slug,
    description: course.description || undefined,
    ...descriptionFields(course.description),
    cover_image_url: courseCoverUrl(course) ?? undefined,
    // A8: the cover chosen in this app (staff edit it in the Course Builder)
    ...(opts?.redactLessons ? {} : { cover_url: course.coverUrl ?? null }),
    instructor_id: course.instructorId,
    category_id: course.categoryId || undefined,
    categories,
    ...(opts?.prefetched?.rating ? { rating: opts.prefetched.rating } : {}),
    ...(opts?.prefetched?.quiz_count !== undefined
      ? { quiz_count: opts.prefetched.quiz_count, assignment_count: opts.prefetched.assignment_count }
      : {}),
    // Tutor-style course details (Course Builder → Basics / Additional)
    excerpt: course.excerpt ?? undefined,
    level: course.level ?? undefined,
    price_type: course.priceType ?? undefined,
    benefits: course.benefits ?? undefined,
    requirements: course.requirements ?? undefined,
    target_audience: course.targetAudience ?? undefined,
    materials: course.materials ?? undefined,
    is_public: course.isPublic ?? undefined,
    status: course.status,
    is_published: course.status === "published",
    // A5: review + sequencing + certificate design
    sequential_lessons: course.sequentialLessons ?? false,
    certificate_template_id: course.certificateTemplateId ?? null,
    // the reviewer's note is for the instructor: not on public pages
    ...(opts?.redactLessons
      ? {}
      : {
          review_note: course.reviewNote ?? null,
          submitted_at: course.submittedAt?.toISOString() ?? null,
          reviewed_at: course.reviewedAt?.toISOString() ?? null,
        }),
    ...stats,
    active_pricing: mapPricing(pricing),
    created_at: course.createdAt?.toISOString(),
    updated_at: course.updatedAt?.toISOString(),
  };
  if (course.instructor) {
    const photo = userPhotoUrl(course.instructor.id, course.instructor.avatarUrl);
    out.instructor = {
      id: course.instructor.id,
      name: course.instructor.name,
      email: course.instructor.email,
      avatar_url: photo,
    };
    out.instructor_name = course.instructor.name;
    out.instructor_avatar_url = photo ?? undefined;
  }
  if (course.category) {
    out.category = {
      id: course.category.id,
      name: decodeHtmlEntities(course.category.name),
      slug: course.category.slug,
      sort_order: Number(course.category.sortOrder),
    };
  }
  if (opts?.includeSections && course.sections) {
    out.sections = course.sections.map((s) => ({
      id: s.id,
      course_id: s.courseId,
      title: decodeHtmlEntities(s.title),
      sort_order: Number(s.sortOrder),
      created_at: s.createdAt?.toISOString(),
      updated_at: s.updatedAt?.toISOString(),
      lessons: (s.lessons || []).map((l) => mapLesson(l, !!opts.redactLessons)),
    }));
  }
  return ser(out);
}

/** Map a page of courses with batched stats/pricing queries (constant query count per page). */
export async function mapCourseList(rows: Parameters<typeof mapCourse>[0][]) {
  const ids = rows.map((c) => c.id);
  if (ids.length === 0) return [];
  const [sections, enrollments, pricings, links, ratings, quizzes, assignments] = await Promise.all([
    prisma.section.findMany({
      where: { courseId: { in: ids }, deletedAt: null },
      select: { courseId: true, _count: { select: { lessons: { where: { deletedAt: null } } } } },
    }),
    prisma.enrollment.groupBy({
      by: ["courseId"],
      where: { courseId: { in: ids }, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.coursePricing.findMany({
      where: { courseId: { in: ids }, isActive: true, deletedAt: null },
      orderBy: { updatedAt: "desc" },
    }),
    categoryLinksFor(ids),
    // real ratings (approved reviews only), one grouped query for the whole page
    prisma.courseReview.groupBy({
      by: ["courseId"],
      where: { courseId: { in: ids }, deletedAt: null, isApproved: true },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.quiz.groupBy({ by: ["courseId"], where: { courseId: { in: ids }, deletedAt: null }, _count: { _all: true } }),
    prisma.assignment.groupBy({ by: ["courseId"], where: { courseId: { in: ids }, deletedAt: null }, _count: { _all: true } }),
  ]);
  const quizCount = new Map(quizzes.map((r): [string, number] => [r.courseId, r._count._all]));
  const assignmentCount = new Map(assignments.map((r): [string, number] => [r.courseId, r._count._all]));
  const rate = new Map(
    ratings.map((r): [string, { average: number; count: number }] => [
      r.courseId,
      { average: Math.round(Number(r._avg.rating ?? 0) * 10) / 10, count: r._count._all },
    ])
  );
  const sec = new Map<string, { s: number; l: number }>();
  for (const r of sections) {
    const e = sec.get(r.courseId) ?? { s: 0, l: 0 };
    e.s += 1;
    e.l += r._count.lessons;
    sec.set(r.courseId, e);
  }
  const enr = new Map(enrollments.map((r): [string, number] => [r.courseId, r._count._all]));
  const price = new Map<string, (typeof pricings)[number]>();
  for (const p of pricings) if (!price.has(p.courseId)) price.set(p.courseId, withLegacyPrice(p)!);
  return Promise.all(
    rows.map((c) =>
      mapCourse(c, {
        prefetched: {
          stats: {
            section_count: sec.get(c.id)?.s ?? 0,
            lesson_count: sec.get(c.id)?.l ?? 0,
            enrollment_count: enr.get(c.id) ?? 0,
            attachment_count: 0,
          },
          pricing: price.get(c.id) ?? null,
          categories: links.get(c.id) ?? [],
          rating: rate.get(c.id) ?? { average: 0, count: 0 },
          quiz_count: quizCount.get(c.id) ?? 0,
          assignment_count: assignmentCount.get(c.id) ?? 0,
        },
      })
    )
  );
}

export async function publicList(page = 1, pageSize = 20) {
  const take = Math.min(Math.max(pageSize, 1), 100);
  const skip = (Math.max(page, 1) - 1) * take;
  const where = { status: "published", deletedAt: null };
  const [total, rows] = await Promise.all([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        instructor: { select: { id: true, name: true, email: true, avatarUrl: true } },
        category: true,
      },
    }),
  ]);
  const data = (await mapCourseList(rows)).map(withoutInstructorEmail);
  return { data, total, page: Math.max(page, 1) };
}

/** Public (anonymous, CDN-cached) responses must never expose an instructor's e-mail address. */
function withoutInstructorEmail<T>(course: T): T {
  const c = course as { instructor?: Record<string, unknown> | null };
  if (c && c.instructor && typeof c.instructor === "object") {
    const { email: _email, ...rest } = c.instructor;
    return { ...(course as object), instructor: rest } as T;
  }
  return course;
}

export async function publicBySlug(slug: string) {
  const course = await prisma.course.findFirst({
    where: { slug, status: "published", deletedAt: null },
    include: {
      instructor: { select: { id: true, name: true, email: true, avatarUrl: true } },
      category: true,
      sections: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        include: {
          lessons: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  if (!course) throw Err.notFound("course not found");
  const [mapped, rating] = await Promise.all([
    mapCourse(course, { includeSections: true, redactLessons: true }),
    courseRating(course.id),
  ]);
  // A5: required courses, shown on the course page
  const required = await prerequisites.listFor(course.id);
  return { ...withoutInstructorEmail(mapped), rating, prerequisites: required.filter((r) => r.status === "published") };
}

/** Real rating from the migrated reviews (approved only, as WordPress showed them). */
async function courseRating(courseId: string): Promise<{ average: number; count: number }> {
  const agg = await prisma.courseReview.aggregate({
    where: { courseId, deletedAt: null, isApproved: true },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const count = agg._count._all;
  const average = count ? Math.round(Number(agg._avg.rating ?? 0) * 10) / 10 : 0;
  return { average, count };
}

export async function listAuth(
  user: AuthUser,
  page = 1,
  pageSize = 20,
  mine = false,
  publishedOnly = false,
  filters: { q?: string | null; status?: string | null } = {}
) {
  const take = Math.min(Math.max(pageSize, 1), 100);
  const skip = (Math.max(page, 1) - 1) * take;
  const where: Prisma.CourseWhereInput = { deletedAt: null };
  if (publishedOnly) where.status = "published";
  else if (filters.status) {
    where.status = filters.status === "pending" ? { in: ["pending", "pending_review"] } : filters.status;
  }
  if (mine) where.instructorId = user.user_id;
  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { instructor: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        instructor: { select: { id: true, name: true, email: true, avatarUrl: true } },
        category: true,
      },
    }),
  ]);
  const data = await mapCourseList(rows);
  return { data, total, page: Math.max(page, 1) };
}

export async function getById(courseId: string, redact = false, viewer?: AuthUser) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, deletedAt: null },
    include: {
      instructor: { select: { id: true, name: true, email: true, avatarUrl: true } },
      category: true,
      sections: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        include: {
          lessons: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  if (!course) throw Err.notFound("course not found");
  const mapped = await mapCourse(course, { includeSections: true, redactLessons: redact });
  // A5: a viewer only gets the lessons they may open (enrolment + sequential order)
  return viewer ? applyLessonAccess(mapped, await lessonAccess(viewer, course)) : mapped;
}

export async function getBySlugAuth(slug: string, viewer?: AuthUser) {
  const course = await prisma.course.findFirst({
    where: { slug, deletedAt: null },
    include: {
      instructor: { select: { id: true, name: true, email: true, avatarUrl: true } },
      category: true,
      sections: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        include: {
          lessons: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  if (!course) throw Err.notFound("course not found");
  const mapped = await mapCourse(course, { includeSections: true, redactLessons: false });
  return viewer ? applyLessonAccess(mapped, await lessonAccess(viewer, course)) : mapped;
}

function canManage(user: AuthUser, instructorId: string) {
  return user.role === "admin" || user.user_id === instructorId;
}

const COURSE_LEVELS = ["all_levels", "beginner", "intermediate", "expert"];

export async function create(
  user: AuthUser,
  input: {
    title: string;
    slug?: string;
    description?: string;
    category_id?: string;
    excerpt?: string | null;
    level?: string | null;
    cover_url?: string | null;
  }
) {
  if (user.role !== "admin" && user.role !== "instructor") throw Err.forbidden();
  const title = String(input.title ?? "").trim();
  if (!title) throw Err.invalidInput("title required");
  if (title.length > 255) throw Err.invalidInput("the title is too long (max 255 characters)");
  // the URL column holds 220 characters; keep room for a "-abc123" suffix
  let slug = toSlug(String(input.slug || title).trim()).slice(0, 200).replace(/-+$/g, "");
  if (!slug) slug = `course-${newId().slice(0, 8)}`;
  // a deleted course still owns its URL (the column is unique): check every course, not only live ones
  const exists = await prisma.course.findFirst({ where: { slug }, select: { id: true } });
  if (exists) slug = `${slug}-${newId().slice(0, 6)}`;
  if (input.category_id && !isUuid(input.category_id)) throw Err.invalidInput("invalid category");
  if (input.level && !COURSE_LEVELS.includes(input.level)) throw Err.invalidInput("invalid level");
  const excerpt = String(input.excerpt ?? "").trim();
  if (excerpt.length > 2000) throw Err.invalidInput("the summary is too long");
  const t = now();
  const id = newId();
  await prisma.course.create({
    data: {
      id,
      title,
      slug,
      description: input.description || null,
      excerpt: excerpt || null,
      level: input.level || null,
      coverUrl: cleanCoverUrl(input.cover_url),
      instructorId: user.user_id,
      categoryId: input.category_id || null,
      status: "draft",
      createdAt: t,
      updatedAt: t,
    },
  });
  if (input.category_id) {
    // the catalog counts courses through the category links: keep the primary link in step
    await prisma.courseCategoryLink.upsert({
      where: { courseId_categoryId: { courseId: id, categoryId: input.category_id } },
      create: { courseId: id, categoryId: input.category_id, isPrimary: true },
      update: { isPrimary: true },
    });
  }
  return getById(id);
}

export async function update(
  user: AuthUser,
  courseId: string,
  input: Partial<{
    title: string;
    slug: string;
    description: string;
    category_id: string | null;
    excerpt: string | null;
    level: string | null;
    benefits: string | null;
    requirements: string | null;
    target_audience: string | null;
    materials: string | null;
    is_public: boolean;
    /** A5 */
    sequential_lessons: boolean;
    certificate_template_id: string | null;
    /** A8 */
    cover_url: string | null;
  }>
) {
  const course = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null } });
  if (!course) throw Err.notFound("course not found");
  if (!canManage(user, course.instructorId)) throw Err.forbidden();
  if (input.title !== undefined && String(input.title).trim().length > 255) {
    throw Err.invalidInput("the title is too long (max 255 characters)");
  }
  // an unchanged URL is kept as it is (old-site addresses); a new one is cleaned up and must be free
  let slug = input.slug?.trim();
  if (slug && slug !== course.slug) {
    slug = toSlug(slug);
    const clash = await prisma.course.findFirst({ where: { slug, id: { not: courseId } }, select: { id: true } });
    if (clash) throw Err.conflict("slug_taken", "another course already uses this URL slug");
  }
  if (input.category_id && !isUuid(input.category_id)) throw Err.invalidInput("invalid category");
  const coverUrl = input.cover_url === undefined ? undefined : cleanCoverUrl(input.cover_url);
  const opt = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() ? v : null);
  const LEVELS = ["all_levels", "beginner", "intermediate", "expert"];
  if (input.certificate_template_id) {
    if (!isUuid(input.certificate_template_id)) throw Err.invalidInput("invalid certificate template");
    const tpl = await prisma.certificateTemplate.findFirst({ where: { id: input.certificate_template_id, deletedAt: null }, select: { id: true } });
    if (!tpl) throw Err.invalidInput("certificate template not found");
  }
  if (input.level && !LEVELS.includes(input.level)) throw Err.invalidInput("invalid level");
  await prisma.course.update({
    where: { id: courseId },
    data: {
      title: input.title?.trim() || undefined,
      slug: slug || undefined,
      description: input.description !== undefined ? input.description : undefined,
      categoryId: input.category_id === undefined ? undefined : input.category_id,
      excerpt: opt(input.excerpt),
      level: opt(input.level),
      benefits: opt(input.benefits),
      requirements: opt(input.requirements),
      targetAudience: opt(input.target_audience),
      materials: opt(input.materials),
      isPublic: input.is_public === undefined ? undefined : !!input.is_public,
      sequentialLessons: input.sequential_lessons === undefined ? undefined : !!input.sequential_lessons,
      certificateTemplateId: input.certificate_template_id === undefined ? undefined : input.certificate_template_id || null,
      coverUrl,
      updatedAt: now(),
    },
  });
  // keep the many-to-many category links in step with the primary category
  if (input.category_id) {
    await prisma.courseCategoryLink.upsert({
      where: { courseId_categoryId: { courseId, categoryId: input.category_id } },
      create: { courseId, categoryId: input.category_id, isPrimary: true },
      update: { isPrimary: true },
    });
    await prisma.courseCategoryLink.updateMany({
      where: { courseId, categoryId: { not: input.category_id } },
      data: { isPrimary: false },
    });
  }
  return getById(courseId);
}

/**
 * Tutor-style status control. Suspend replaces delete: the course leaves the public catalog and
 * enrolment, nothing is removed, and it can be restored at any time.
 *  - admin: published | draft | pending | private | suspended
 *  - course owner (instructor): draft | pending (submit for review) | suspended
 */
const COURSE_STATUSES = ["published", "draft", "pending", "private", "suspended"] as const;
export async function setStatus(user: AuthUser, courseId: string, status: string) {
  if (!COURSE_STATUSES.includes(status as (typeof COURSE_STATUSES)[number])) throw Err.invalidInput("invalid status");
  const course = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null } });
  if (!course) throw Err.notFound("course not found");
  if (!canManage(user, course.instructorId)) throw Err.forbidden();
  if (user.role !== "admin" && !["draft", "pending", "suspended"].includes(status)) throw Err.forbidden();
  if (status === "published" || status === "pending") {
    const lessons = await prisma.lesson.count({ where: { deletedAt: null, section: { courseId, deletedAt: null } } });
    if (lessons < 1) throw Err.invalidInput("add at least one lesson before publishing");
  }
  await prisma.course.update({ where: { id: courseId }, data: { status, updatedAt: now() } });
  // A5: an instructor submitted the course for review → remember when + tell the admins
  if (status === "pending" && user.role !== "admin" && course.status !== "pending") await review.onSubmitted(courseId);
  return getById(courseId);
}

export async function publish(user: AuthUser, courseId: string) {
  const course = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null } });
  if (!course) throw Err.notFound("course not found");
  if (!canManage(user, course.instructorId)) throw Err.forbidden();
  if (course.status === "published") return getById(courseId);
  if (course.status === "archived") throw Err.invalidInput("archived course cannot be published");

  const sections = await prisma.section.count({ where: { courseId, deletedAt: null } });
  const lessons = await prisma.lesson.count({
    where: { deletedAt: null, section: { courseId, deletedAt: null } },
  });
  const pricing = await activePricing(courseId);
  if (sections < 1 || lessons < 1 || !pricing) {
    throw Err.invalidInput("course needs sections, lessons, and active pricing");
  }
  const status = user.role === "admin" ? "published" : "pending_review";
  await prisma.course.update({
    where: { id: courseId },
    data: { status, updatedAt: now() },
  });
  if (status === "pending_review" && !review.REVIEW_STATUSES.includes(course.status)) await review.onSubmitted(courseId);
  return getById(courseId);
}

export async function unpublish(user: AuthUser, courseId: string) {
  const course = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null } });
  if (!course) throw Err.notFound("course not found");
  if (!canManage(user, course.instructorId)) throw Err.forbidden();
  await prisma.course.update({
    where: { id: courseId },
    data: { status: "draft", updatedAt: now() },
  });
  return getById(courseId);
}

export async function approve(user: AuthUser, courseId: string) {
  if (user.role !== "admin") throw Err.forbidden();
  const course = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null } });
  if (!course) throw Err.notFound("course not found");
  await prisma.course.update({
    where: { id: courseId },
    data: { status: "published", updatedAt: now() },
  });
  return getById(courseId);
}

export async function reject(user: AuthUser, courseId: string) {
  if (user.role !== "admin") throw Err.forbidden();
  const course = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null } });
  if (!course) throw Err.notFound("course not found");
  await prisma.course.update({
    where: { id: courseId },
    data: { status: "draft", updatedAt: now() },
  });
  return getById(courseId);
}

export async function remove(user: AuthUser, courseId: string) {
  const course = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null } });
  if (!course) throw Err.notFound("course not found");
  if (!canManage(user, course.instructorId)) throw Err.forbidden();
  await prisma.course.update({
    where: { id: courseId },
    data: { deletedAt: now(), updatedAt: now() },
  });
}

export async function getPricing(courseId: string) {
  const pricing = await activePricing(courseId);
  if (!pricing) throw Err.notFound("pricing not found");
  return mapPricing(pricing);
}

export async function updatePricing(
  user: AuthUser,
  courseId: string,
  input: {
    is_free: boolean;
    price: number;
    currency: string;
    discount_price?: number | null;
    start_date?: string | null;
    end_date?: string | null;
  }
) {
  const course = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null } });
  if (!course) throw Err.notFound("course not found");
  if (!canManage(user, course.instructorId)) throw Err.forbidden();
  const t = now();
  await prisma.coursePricing.updateMany({
    where: { courseId, deletedAt: null },
    data: { isActive: false, updatedAt: t },
  });
  const id = newId();
  await prisma.coursePricing.create({
    data: {
      id,
      courseId,
      isFree: !!input.is_free,
      // API sends cents; the database stores Decimal dollars (G1)
      price: fromMinor(input.is_free ? 0 : Math.max(0, Math.floor(input.price))),
      currency: input.currency || "USD",
      discountPrice:
        input.discount_price == null ? null : fromMinor(Math.floor(input.discount_price)),
      startDate: input.start_date ? new Date(input.start_date) : null,
      endDate: input.end_date ? new Date(input.end_date) : null,
      isActive: true,
      createdAt: t,
      updatedAt: t,
    },
  });
  return getPricing(courseId);
}

export async function previewCoupon(courseId: string, code: string) {
  const pricing = await activePricing(courseId);
  if (!pricing) throw Err.notFound("pricing not found");
  const original = pricing.isFree ? 0 : toMinor(pricing.discountPrice ?? pricing.price);
  const coupon = await prisma.coupon.findFirst({
    // migrated WooCommerce codes are mostly lower-case: match case-insensitively
    where: { code: { equals: code.trim(), mode: "insensitive" }, isActive: true, deletedAt: null },
  });
  if (!coupon) {
    return {
      valid: false,
      currency: pricing.currency,
      amount_minor: original,
      original_amount_minor: original,
      saved_minor: 0,
      message: "invalid coupon",
    };
  }
  if (coupon.expiresAt && coupon.expiresAt < now()) {
    return {
      valid: false,
      currency: pricing.currency,
      amount_minor: original,
      original_amount_minor: original,
      saved_minor: 0,
      message: "coupon expired",
    };
  }
  if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
    return {
      valid: false,
      currency: pricing.currency,
      amount_minor: original,
      original_amount_minor: original,
      saved_minor: 0,
      message: "coupon usage limit reached",
    };
  }
  // Migrated WooCommerce coupons are either a percentage or a fixed amount (Decimal dollars).
  const isFixed = coupon.discountType !== "percent" && coupon.discountAmount != null;
  const pct = isFixed ? 0 : Number(coupon.discountPercent ?? 0);
  const saved = Math.min(
    original,
    isFixed ? toMinor(coupon.discountAmount) : Math.floor((original * pct) / 100)
  );
  const amount = Math.max(0, original - saved);
  return {
    valid: true,
    code: coupon.code,
    discount_percent: pct,
    discount_type: coupon.discountType,
    currency: pricing.currency,
    amount_minor: amount,
    original_amount_minor: original,
    saved_minor: saved,
  };
}

export async function addSection(
  user: AuthUser,
  courseId: string,
  input: { title: string; sort_order?: number }
) {
  const course = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null } });
  if (!course) throw Err.notFound("course not found");
  if (!canManage(user, course.instructorId)) throw Err.forbidden();
  const t = now();
  const id = newId();
  const section = await prisma.section.create({
    data: {
      id,
      courseId,
      title: input.title.trim(),
      sortOrder: BigInt(input.sort_order ?? 0),
      createdAt: t,
      updatedAt: t,
    },
  });
  return ser({
    id: section.id,
    course_id: section.courseId,
    title: section.title,
    sort_order: Number(section.sortOrder),
    created_at: section.createdAt?.toISOString(),
    updated_at: section.updatedAt?.toISOString(),
  });
}

export async function updateSection(
  user: AuthUser,
  sectionId: string,
  input: { title?: string; sort_order?: number }
) {
  const section = await prisma.section.findFirst({
    where: { id: sectionId, deletedAt: null },
    include: { course: true },
  });
  if (!section) throw Err.notFound("section not found");
  if (!canManage(user, section.course.instructorId)) throw Err.forbidden();
  const updated = await prisma.section.update({
    where: { id: sectionId },
    data: {
      title: input.title?.trim(),
      sortOrder: input.sort_order === undefined ? undefined : BigInt(input.sort_order),
      updatedAt: now(),
    },
  });
  return ser({
    id: updated.id,
    course_id: updated.courseId,
    title: updated.title,
    sort_order: Number(updated.sortOrder),
    created_at: updated.createdAt?.toISOString(),
    updated_at: updated.updatedAt?.toISOString(),
  });
}

export async function deleteSection(user: AuthUser, sectionId: string) {
  const section = await prisma.section.findFirst({
    where: { id: sectionId, deletedAt: null },
    include: { course: true },
  });
  if (!section) throw Err.notFound("section not found");
  if (!canManage(user, section.course.instructorId)) throw Err.forbidden();
  await prisma.section.update({
    where: { id: sectionId },
    data: { deletedAt: now(), updatedAt: now() },
  });
}

export async function addLesson(
  user: AuthUser,
  sectionId: string,
  input: {
    title: string;
    description?: string;
    content?: string;
    video_provider?: string;
    video_url?: string;
    attachments?: { name: string; url: string }[];
    sort_order?: number;
  }
) {
  const section = await prisma.section.findFirst({
    where: { id: sectionId, deletedAt: null },
    include: { course: true },
  });
  if (!section) throw Err.notFound("section not found");
  if (!canManage(user, section.course.instructorId)) throw Err.forbidden();
  const t = now();
  const id = newId();
  const lesson = await prisma.lesson.create({
    data: {
      id,
      sectionId,
      title: input.title.trim(),
      description: input.description || null,
      content: input.content || null,
      videoProvider: input.video_provider || null,
      videoUrl: input.video_url || null,
      attachmentsJson: input.attachments ? JSON.stringify(input.attachments) : null,
      sortOrder: BigInt(input.sort_order ?? 0),
      createdAt: t,
      updatedAt: t,
    },
  });
  return mapLesson(lesson);
}

export async function updateLesson(
  user: AuthUser,
  lessonId: string,
  input: {
    title?: string;
    description?: string;
    content?: string;
    video_provider?: string;
    video_url?: string;
    attachments?: { name: string; url: string }[];
    sort_order?: number;
    vdocipher_video_id?: string | null;
    duration_seconds?: number | null;
    is_preview?: boolean;
  }
) {
  if (input.vdocipher_video_id && !/^[0-9a-f]{32}$/i.test(input.vdocipher_video_id.trim())) {
    throw Err.invalidInput("VdoCipher video id must be 32 hex characters");
  }
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, deletedAt: null },
    include: { section: { include: { course: true } } },
  });
  if (!lesson) throw Err.notFound("lesson not found");
  if (!canManage(user, lesson.section.course.instructorId)) throw Err.forbidden();
  const updated = await prisma.lesson.update({
    where: { id: lessonId },
    data: {
      title: input.title?.trim(),
      description: input.description,
      content: input.content,
      videoProvider: input.video_provider,
      videoUrl: input.video_url,
      attachmentsJson:
        input.attachments === undefined ? undefined : JSON.stringify(input.attachments),
      sortOrder: input.sort_order === undefined ? undefined : BigInt(input.sort_order),
      vdocipherVideoId:
        input.vdocipher_video_id === undefined ? undefined : input.vdocipher_video_id?.trim().toLowerCase() || null,
      durationSeconds:
        input.duration_seconds === undefined ? undefined : input.duration_seconds == null ? null : Math.max(0, Math.round(input.duration_seconds)),
      isPreview: input.is_preview === undefined ? undefined : !!input.is_preview,
      updatedAt: now(),
    },
  });
  return mapLesson(updated);
}

export async function deleteLesson(user: AuthUser, lessonId: string) {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, deletedAt: null },
    include: { section: { include: { course: true } } },
  });
  if (!lesson) throw Err.notFound("lesson not found");
  if (!canManage(user, lesson.section.course.instructorId)) throw Err.forbidden();
  const t = now();
  await prisma.$transaction([
    prisma.lesson.update({
      where: { id: lessonId },
      data: { deletedAt: t, updatedAt: t },
    }),
    // A6: the lesson's quizzes and assignments (with their attempts / submissions) stay in the topic;
    // its own files and links go with it
    prisma.quiz.updateMany({ where: { lessonId, deletedAt: null }, data: { lessonId: null, updatedAt: t } }),
    prisma.assignment.updateMany({ where: { lessonId, deletedAt: null }, data: { lessonId: null, updatedAt: t } }),
    prisma.courseResource.updateMany({ where: { lessonId, deletedAt: null }, data: { deletedAt: t, updatedAt: t } }),
  ]);
}

/**
 * Public category list for the marketing pages: real migrated categories that have at least
 * one published course (counted through course_category_links, like WordPress did).
 */
export async function publicCategories() {
  const rows = await prisma.courseCategory.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      sortOrder: true,
      _count: {
        select: { links: { where: { course: { status: "published", deletedAt: null } } } },
      },
    },
  });
  return rows
    .map((c) => ({
      id: c.id,
      name: decodeHtmlEntities(c.name),
      slug: c.slug,
      sort_order: Number(c.sortOrder),
      course_count: c._count.links,
    }))
    .filter((c) => c.course_count > 0)
    .sort((a, b) => b.course_count - a.course_count || a.name.localeCompare(b.name));
}
