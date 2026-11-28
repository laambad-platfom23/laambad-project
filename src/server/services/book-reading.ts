/**
 * A12 (Phase 2 test): reading books in the app — where a reader is (page, bookmarks) and reviews.
 *
 * - Progress: only someone who may read the book (free book, paid order, admin) saves progress; the
 *   reader also tells us the page count the first time a book is opened (if nobody set it yet).
 * - Reviews: one per reader and book; only readers can write one (a paid order, or progress saved on
 *   a free book — i.e. they opened it). Everyone can read the reviews of a published book.
 */
import { prisma, newId, now } from "@/lib/db";
import { ApiError, Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { assertUuid, isUuid } from "@/lib/uuid";
import { userPhotoUrl } from "@/server/legacy-uploads";
import { hasAccess } from "./books";

async function bookOf(bookId: string, published = true) {
  assertUuid(bookId, "book not found");
  const b = await prisma.book.findFirst({ where: { id: bookId, deletedAt: null, ...(published ? { status: "published" } : {}) } });
  if (!b) throw Err.notFound("book not found");
  return b;
}

const cleanPages = (v: unknown, max = 20_000) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= max ? n : null;
};

function progressView(p: { lastPage: number; pageCount: number | null; bookmarks: unknown; updatedAt: Date } | null) {
  const marks = Array.isArray(p?.bookmarks) ? (p!.bookmarks as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  const total = p?.pageCount ?? 0;
  return {
    last_page: p?.lastPage ?? 1,
    page_count: p?.pageCount ?? null,
    percent: p && total ? Math.min(100, Math.round((p.lastPage / total) * 100)) : 0,
    bookmarks: [...new Set(marks)].sort((a, b) => a - b),
    updated_at: p?.updatedAt.toISOString() ?? null,
  };
}

export async function getProgress(user: AuthUser, bookId: string) {
  const b = await bookOf(bookId, user.role !== "admin");
  if (!(await hasAccess(user, b))) throw Err.forbidden();
  const p = await prisma.bookProgress.findUnique({ where: { userId_bookId: { userId: user.user_id, bookId: b.id } } });
  return progressView(p);
}

export async function saveProgress(user: AuthUser, bookId: string, input: { last_page?: unknown; page_count?: unknown; bookmarks?: unknown }) {
  const b = await bookOf(bookId, user.role !== "admin");
  if (!(await hasAccess(user, b))) throw Err.forbidden();
  const pageCount = cleanPages(input.page_count) ?? b.pageCount ?? null;
  const last = cleanPages(input.last_page, pageCount ?? 20_000) ?? undefined;
  let bookmarks: number[] | undefined;
  if (input.bookmarks !== undefined) {
    if (!Array.isArray(input.bookmarks)) throw Err.invalidInput("bookmarks must be a list of pages");
    bookmarks = [...new Set(input.bookmarks.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= (pageCount ?? 20_000)))]
      .sort((x, y) => x - y)
      .slice(0, 500);
  }
  const t = now();
  const p = await prisma.bookProgress.upsert({
    where: { userId_bookId: { userId: user.user_id, bookId: b.id } },
    create: { userId: user.user_id, bookId: b.id, lastPage: last ?? 1, pageCount, bookmarks: bookmarks ?? [], createdAt: t, updatedAt: t },
    update: { ...(last ? { lastPage: last } : {}), ...(pageCount ? { pageCount } : {}), ...(bookmarks ? { bookmarks } : {}), updatedAt: t },
  });
  // the first reader of a book tells us how many pages it has (shown on the book page)
  if (!b.pageCount && pageCount) {
    await prisma.book.updateMany({ where: { id: b.id, pageCount: null }, data: { pageCount } });
  }
  return progressView(p);
}

// ── reviews ──

async function canReview(user: AuthUser, b: { id: string; isFree: boolean; price: unknown }) {
  if (user.role === "admin") return false;
  const paid = await prisma.bookOrder.findFirst({ where: { bookId: b.id, userId: user.user_id, status: "paid" }, select: { id: true } });
  if (paid) return true;
  // a free book: whoever opened it in the reader
  const opened = await prisma.bookProgress.findUnique({ where: { userId_bookId: { userId: user.user_id, bookId: b.id } }, select: { userId: true } });
  return !!opened && (b.isFree || Number(b.price) === 0);
}

async function summary(bookId: string) {
  const rows = await prisma.bookReview.groupBy({ by: ["rating"], where: { bookId, deletedAt: null }, _count: { _all: true } });
  const count = rows.reduce((n, r) => n + r._count._all, 0);
  const sum = rows.reduce((n, r) => n + r.rating * r._count._all, 0);
  return {
    average: count ? Math.round((sum / count) * 10) / 10 : 0,
    count,
    distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: rows.find((r) => r.rating === stars)?._count._all ?? 0 })),
  };
}

/** Anyone: the reviews of a published book, 10 per page (name and photo only). */
export async function publicReviews(bookId: string, page: number) {
  if (!isUuid(bookId)) throw Err.notFound("book not found");
  const b = await bookOf(bookId);
  const p = Math.max(1, Math.floor(page) || 1);
  const [s, rows] = await Promise.all([
    summary(b.id),
    prisma.bookReview.findMany({
      where: { bookId: b.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      skip: (p - 1) * 10,
      take: 11,
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    }),
  ]);
  return {
    ...s,
    page: p,
    has_more: rows.length > 10,
    reviews: rows.slice(0, 10).map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      user: { name: r.user?.name ?? "Student", avatar_url: r.user ? userPhotoUrl(r.user.id, r.user.avatarUrl) : null },
      created_at: r.createdAt.toISOString(),
    })),
  };
}

/** Signed in: my review of this book and whether I may write one. */
export async function myReview(user: AuthUser, bookId: string) {
  const b = await bookOf(bookId);
  const [mine, can] = await Promise.all([
    prisma.bookReview.findFirst({ where: { bookId: b.id, userId: user.user_id, deletedAt: null } }),
    canReview(user, b),
  ]);
  return {
    can_review: can,
    mine: mine ? { id: mine.id, rating: mine.rating, comment: mine.comment, created_at: mine.createdAt.toISOString(), updated_at: mine.updatedAt.toISOString() } : null,
  };
}

export async function saveReview(user: AuthUser, bookId: string, input: { rating?: unknown; comment?: unknown }) {
  const b = await bookOf(bookId);
  if (!(await canReview(user, b))) throw new ApiError(403, "forbidden", "only readers of this book can review it");
  const rating = Math.round(Number(input.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) throw Err.invalidInput("choose 1 to 5 stars");
  const comment = String(input.comment ?? "").trim().slice(0, 5000) || null;
  const t = now();
  const mine = await prisma.bookReview.findFirst({ where: { bookId: b.id, userId: user.user_id, deletedAt: null } });
  const row = mine
    ? await prisma.bookReview.update({ where: { id: mine.id }, data: { rating, comment, updatedAt: t } })
    : await prisma.bookReview.create({ data: { id: newId(), bookId: b.id, userId: user.user_id, rating, comment, createdAt: t, updatedAt: t } });
  return { id: row.id, rating: row.rating, comment: row.comment, created_at: row.createdAt.toISOString(), updated_at: row.updatedAt.toISOString() };
}

/** The author removes their review; an admin removes any review. */
export async function deleteReview(user: AuthUser, reviewId: string) {
  assertUuid(reviewId, "review not found");
  const r = await prisma.bookReview.findFirst({ where: { id: reviewId, deletedAt: null } });
  if (!r) throw Err.notFound("review not found");
  if (r.userId !== user.user_id && user.role !== "admin") throw Err.forbidden();
  await prisma.bookReview.update({ where: { id: r.id }, data: { deletedAt: now(), updatedAt: now() } });
  return { ok: true };
}
