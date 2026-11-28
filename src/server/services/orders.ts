/**
 * Orders (Phase 2 test, A11): course payments AND book orders in one list, for admins (all orders,
 * with approve / reject / coupon) and for students (their own). Server-side paging (10 per page).
 *
 * Course orders live in `payments` (7,000+ rows, many migrated from WooCommerce), book orders in
 * `book_orders`; one UNION ALL query sorts and pages both together.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { Err } from "@/lib/api/errors";
import { toMinor } from "@/server/money";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { assertUuid } from "@/lib/uuid";
import { maskMobile } from "@/server/waafipay";
import * as misc from "./misc";
import * as books from "./books";

export type OrderKind = "course" | "book";
export type StatusGroup = "pending" | "completed" | "failed" | "refunded" | "all";
const GROUPS: Record<Exclude<StatusGroup, "all">, string[]> = {
  pending: ["pending"],
  completed: ["paid", "success", "completed"],
  failed: ["failed", "cancelled", "canceled", "rejected"],
  refunded: ["refunded"],
};
const groupOf = (status: string): Exclude<StatusGroup, "all"> =>
  (Object.keys(GROUPS) as Exclude<StatusGroup, "all">[]).find((g) => GROUPS[g].includes(status)) ?? "pending";

export function parseStatus(v: string | null): StatusGroup {
  return v === "pending" || v === "completed" || v === "failed" || v === "refunded" ? v : "all";
}
export function parseKind(v: string | null): OrderKind | null {
  return v === "course" || v === "book" ? v : null;
}

const UNION = Prisma.sql`
  SELECT 'course'::text AS kind, p.id, p.user_id, p.course_id AS item_id, p.amount, p.currency, p.status, p.provider,
         p.provider_ref_id AS payer, p.transaction_id, p.coupon_id, p.refund_reason AS note, p.created_at, p.paid_at
    FROM payments p
   WHERE p.deleted_at IS NULL
  UNION ALL
  SELECT 'book'::text, b.id, b.user_id, b.book_id, b.amount, b.currency, b.status, b.provider,
         b.provider_ref_id, b.transaction_id, b.coupon_id, b.note, b.created_at, b.paid_at
    FROM book_orders b`;

const JOINS = Prisma.sql`
  LEFT JOIN users u ON u.id = o.user_id
  LEFT JOIN courses c ON o.kind = 'course' AND c.id = o.item_id
  LEFT JOIN books bk ON o.kind = 'book' AND bk.id = o.item_id
  LEFT JOIN coupons cp ON cp.id = o.coupon_id`;

type Filter = { status?: StatusGroup; kind?: OrderKind | null; q?: string | null; userId?: string | null };

function where(f: Filter, withStatus: boolean) {
  const c: Prisma.Sql[] = [];
  if (f.kind) c.push(Prisma.sql`o.kind = ${f.kind}`);
  if (f.userId) c.push(Prisma.sql`o.user_id = ${f.userId}::uuid`);
  if (withStatus && f.status && f.status !== "all") c.push(Prisma.sql`o.status IN (${Prisma.join(GROUPS[f.status])})`);
  const q = String(f.q ?? "").trim().slice(0, 100);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    c.push(Prisma.sql`(u.name ILIKE ${like} OR u.email ILIKE ${like} OR u.phone ILIKE ${like} OR c.title ILIKE ${like} OR bk.title ILIKE ${like}
      OR o.transaction_id ILIKE ${like} OR o.payer ILIKE ${like} OR o.id::text ILIKE ${like} OR cp.code ILIKE ${like})`);
  }
  return c.length ? Prisma.sql`WHERE ${Prisma.join(c, " AND ")}` : Prisma.empty;
}

type Row = {
  kind: OrderKind;
  id: string;
  user_id: string | null;
  item_id: string;
  amount: Prisma.Decimal;
  currency: string;
  status: string;
  provider: string;
  payer: string | null;
  transaction_id: string | null;
  note: string | null;
  created_at: Date | null;
  paid_at: Date | null;
  student_name: string | null;
  student_email: string | null;
  student_phone: string | null;
  item_title: string | null;
  item_slug: string | null;
  coupon_code: string | null;
};

function view(r: Row, forAdmin: boolean) {
  const phone = r.payer && /^252\d{9}$/.test(r.payer) ? r.payer : null;
  return {
    kind: r.kind,
    id: r.id,
    item_id: r.item_id,
    item_title: r.item_title ? decodeHtmlEntities(r.item_title) : r.kind === "book" ? "Book" : "Course",
    item_slug: r.item_slug,
    amount: toMinor(r.amount),
    currency: r.currency || "USD",
    status: r.status,
    status_group: groupOf(r.status),
    provider: r.provider,
    payer_phone: phone ? (forAdmin ? `+${phone}` : maskMobile(phone)) : null,
    transaction_id: r.transaction_id,
    coupon_code: r.coupon_code,
    note: forAdmin || groupOf(r.status) === "failed" ? r.note : null,
    created_at: r.created_at?.toISOString() ?? null,
    paid_at: r.paid_at?.toISOString() ?? null,
    ...(forAdmin
      ? {
          user_id: r.user_id,
          student_name: r.student_name ?? (r.user_id ? null : "Guest checkout"),
          student_email: r.student_email,
          student_phone: r.student_phone,
        }
      : {}),
  };
}

async function list(f: Filter, page: number, pageSize: number, forAdmin: boolean) {
  const size = Math.min(50, Math.max(1, pageSize));
  const p = Math.max(1, page);
  const [rows, counted, totals] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      SELECT o.kind, o.id, o.user_id, o.item_id, o.amount, o.currency, o.status, o.provider, o.payer, o.transaction_id, o.note,
             o.created_at, o.paid_at, u.name AS student_name, u.email AS student_email, u.phone AS student_phone,
             COALESCE(c.title, bk.title) AS item_title, COALESCE(c.slug, bk.slug) AS item_slug, cp.code AS coupon_code
        FROM (${UNION}) o ${JOINS}
        ${where(f, true)}
       ORDER BY o.created_at DESC NULLS LAST, o.id DESC
       LIMIT ${size} OFFSET ${(p - 1) * size}`,
    // per-status numbers for the tabs (same search / type, any status)
    prisma.$queryRaw<{ status: string; n: number }[]>`
      SELECT o.status, count(*)::int AS n FROM (${UNION}) o ${JOINS} ${where(f, false)} GROUP BY o.status`,
    // money received in the current view (completed orders only)
    prisma.$queryRaw<{ currency: string; total: Prisma.Decimal }[]>`
      SELECT o.currency, sum(o.amount) AS total FROM (${UNION}) o ${JOINS}
       ${where({ ...f, status: "completed" }, true)} GROUP BY o.currency`,
  ]);
  const counts = { pending: 0, completed: 0, failed: 0, refunded: 0, all: 0 };
  for (const c of counted) {
    counts[groupOf(c.status)] += c.n;
    counts.all += c.n;
  }
  const status = f.status ?? "all";
  return {
    data: rows.map((r) => view(r, forAdmin)),
    total: counts[status],
    page: p,
    page_size: size,
    counts,
    received: totals.map((t) => ({ currency: t.currency || "USD", amount: toMinor(t.total) })).filter((t) => t.amount > 0),
  };
}

/** Admin: every order (course + book), filtered and paged. */
export function adminOrders(f: Filter, page: number, pageSize: number) {
  return list(f, page, pageSize, true);
}

/** A student's own orders (courses and books). */
export function myOrders(userId: string, f: Omit<Filter, "userId">, page: number, pageSize: number) {
  return list({ ...f, userId }, page, pageSize, false);
}

/** Sidebar badge: pending course orders + pending book orders. */
export async function pendingCount() {
  const [a, b] = await Promise.all([
    prisma.payment.count({ where: { deletedAt: null, status: "pending" } }),
    prisma.bookOrder.count({ where: { status: "pending" } }),
  ]);
  return { total: a + b, courses: a, books: b };
}

// ── admin actions (one place for both kinds) ──
export async function approve(kind: OrderKind, id: string, reference?: string) {
  assertUuid(id, "order not found");
  return kind === "book" ? books.adminApproveOrder(id, reference) : misc.completePayment(id, reference);
}
export async function reject(kind: OrderKind, id: string, reason?: string) {
  assertUuid(id, "order not found");
  return kind === "book" ? books.adminRejectOrder(id, reason) : misc.rejectPayment(id, reason);
}
export async function applyCoupon(kind: OrderKind, id: string, code?: string) {
  assertUuid(id, "order not found");
  if (!String(code ?? "").trim()) throw Err.invalidInput("enter a coupon code");
  return kind === "book" ? books.adminApplyCoupon(id, String(code)) : misc.adminApplyCouponToPayment(id, String(code));
}
