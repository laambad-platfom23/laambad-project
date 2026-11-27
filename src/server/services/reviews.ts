/**
 * A7 — course reviews (star rating + comment).
 *  - Only a student with access to the course can review it, and only once: writing again updates the
 *    same review. (Before, anyone signed in could post any number of reviews on any course.)
 *  - Lists show approved reviews only, as on the old site (18 migrated reviews were never approved);
 *    the author always sees their own review.
 */
import { prisma, newId, now } from "@/lib/db";
import { Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { assertUuid } from "@/lib/uuid";
import { hasCourseAccess, isCancelledStatus } from "@/server/enrollment-status";
import { userPhotoUrl } from "@/server/legacy-uploads";
import { courseCoverUrl } from "./courses";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { plain } from "@/lib/plain-text";
import { courseContext } from "./curriculum";

type ReviewRow = { id: string; rating: bigint; comment: string | null; isApproved: boolean; createdAt: Date | null; updatedAt: Date | null };

function mineView(r: ReviewRow) {
  return {
    id: r.id,
    rating: Number(r.rating),
    comment: plain(r.comment) || null,
    approved: r.isApproved,
    created_at: r.createdAt?.toISOString() ?? null,
    updated_at: r.updatedAt?.toISOString() ?? null,
  };
}

async function stats(courseId: string) {
  const groups = await prisma.courseReview.groupBy({
    by: ["rating"],
    where: { courseId, deletedAt: null, isApproved: true },
    _count: { _all: true },
  });
  const count = groups.reduce((n, g) => n + g._count._all, 0);
  const sum = groups.reduce((n, g) => n + Number(g.rating) * g._count._all, 0);
  return {
    average: count ? Math.round((sum / count) * 10) / 10 : 0,
    count,
    distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: groups.find((g) => Number(g.rating) === stars)?._count._all ?? 0 })),
  };
}

/**
 * Public course page → Reviews: anyone may read the approved reviews of a published course,
 * 10 per page, newest first. Only the reviewer's name and photo are shown (as on the old site).
 */
export async function publicReviews(courseId: string, page = 1) {
  assertUuid(courseId, "course not found");
  const c = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null, status: "published" }, select: { id: true } });
  if (!c) throw Err.notFound("course not found");
  const size = 10;
  const p = Math.max(1, Math.min(200, Math.floor(Number(page)) || 1));
  const [s, rows] = await Promise.all([
    stats(c.id),
    prisma.courseReview.findMany({
      where: { courseId: c.id, deletedAt: null, isApproved: true },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (p - 1) * size,
      take: size + 1,
    }),
  ]);
  return {
    ...s,
    page: p,
    has_more: rows.length > size,
    reviews: rows.slice(0, size).map((r) => ({
      id: r.id,
      rating: Number(r.rating),
      comment: plain(r.comment) || null,
      user: { name: r.user.name, avatar_url: userPhotoUrl(r.user.id, r.user.avatarUrl) },
      created_at: r.createdAt?.toISOString() ?? null,
    })),
  };
}

/** Learn page → Reviews: average, 5…1 star bars, my review, and the newest reviews. */
export async function summary(user: AuthUser, courseId: string) {
  const ctx = await courseContext(user, courseId, "member");
  const [s, rows, mine] = await Promise.all([
    stats(ctx.id),
    prisma.courseReview.findMany({
      where: { courseId: ctx.id, deletedAt: null, isApproved: true },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.courseReview.findFirst({ where: { courseId: ctx.id, userId: user.user_id, deletedAt: null }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    ...s,
    can_review: !ctx.staff,
    mine: mine ? mineView(mine) : null,
    reviews: rows.map((r) => ({
      id: r.id,
      rating: Number(r.rating),
      comment: plain(r.comment) || null,
      user: { id: r.user.id, name: r.user.name, avatar_url: userPhotoUrl(r.user.id, r.user.avatarUrl) },
      mine: r.userId === user.user_id,
      created_at: r.createdAt?.toISOString() ?? null,
    })),
  };
}

function clean(input: { rating?: unknown; comment?: unknown }) {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw Err.invalidInput("choose 1 to 5 stars");
  const comment = String(input.comment ?? "").trim();
  if (comment.length > 5000) throw Err.invalidInput("the review is too long (max 5,000 characters)");
  return { rating, comment: comment || null };
}

/** Write or update MY review of a course I can open (one per student and course). */
export async function saveMine(user: AuthUser, courseId: string, input: { rating?: unknown; comment?: unknown }) {
  const ctx = await courseContext(user, courseId, "member");
  if (ctx.staff) throw Err.invalidInput("the course staff cannot review their own course");
  const { rating, comment } = clean(input);
  const t = now();
  const existing = await prisma.courseReview.findFirst({
    where: { courseId: ctx.id, userId: user.user_id, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const row = existing
    ? await prisma.courseReview.update({ where: { id: existing.id }, data: { rating: BigInt(rating), comment, updatedAt: t } })
    : await prisma.courseReview.create({
        data: { id: newId(), userId: user.user_id, courseId: ctx.id, rating: BigInt(rating), comment, isApproved: true, createdAt: t, updatedAt: t },
      });
  return mineView(row);
}

/** PATCH reviews/:id — the author (or an admin) changes stars / text. */
export async function updateOne(user: AuthUser, id: string, input: { rating?: unknown; comment?: unknown }) {
  assertUuid(id, "review not found");
  const r = await prisma.courseReview.findFirst({ where: { id, deletedAt: null } });
  if (!r) throw Err.notFound("review not found");
  if (r.userId !== user.user_id && user.role !== "admin") throw Err.forbidden();
  const { rating, comment } = clean({ rating: input.rating ?? Number(r.rating), comment: input.comment === undefined ? r.comment : input.comment });
  const row = await prisma.courseReview.update({ where: { id }, data: { rating: BigInt(rating), comment, updatedAt: now() } });
  return mineView(row);
}

/** Dashboard → Reviews: only the courses I can open, with my review (or none yet) and the course rating. */
export async function myCourses(user: AuthUser) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: user.user_id, deletedAt: null, course: { deletedAt: null } },
    select: { courseId: true, status: true, paymentStatus: true, completedAt: true, enrolledAt: true },
    orderBy: { enrolledAt: "desc" },
  });
  const ids = [...new Set(enrollments.filter((e) => !isCancelledStatus(e.status) && hasCourseAccess(e)).map((e) => e.courseId))];
  if (!ids.length) return { data: [] };
  const [courses, mine, ratings] = await Promise.all([
    prisma.course.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, slug: true, legacyThumbnailId: true, coverUrl: true, instructorId: true } }),
    prisma.courseReview.findMany({ where: { userId: user.user_id, courseId: { in: ids }, deletedAt: null }, orderBy: { createdAt: "desc" } }),
    prisma.courseReview.groupBy({
      by: ["courseId"],
      where: { courseId: { in: ids }, deletedAt: null, isApproved: true },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);
  const byId = new Map(courses.map((c) => [c.id, c]));
  return {
    data: ids
      .map((id) => byId.get(id))
      .filter((c): c is NonNullable<typeof c> => !!c && c.instructorId !== user.user_id)
      .map((c) => {
        const r = mine.find((x) => x.courseId === c.id);
        const g = ratings.find((x) => x.courseId === c.id);
        return {
          course: { id: c.id, title: decodeHtmlEntities(c.title), slug: c.slug, cover_image_url: courseCoverUrl(c) },
          rating: { average: g ? Math.round(Number(g._avg.rating ?? 0) * 10) / 10 : 0, count: g?._count._all ?? 0 },
          mine: r ? mineView(r) : null,
        };
      }),
  };
}
