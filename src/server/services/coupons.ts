/**
 * Coupons for courses and books (Phase 2 test, A11).
 *
 * A coupon is a percentage or a fixed amount, with an optional expiry date and usage limit, for
 * "all" items, only "courses" or only "books". The price is always computed here on the server.
 * A use is counted when an order that carries the coupon is settled (paid), once per order.
 * Admins manage coupons on /dashboard/coupons and can put a coupon on a pending order.
 */
import { prisma, newId, now } from "@/lib/db";
import { Err } from "@/lib/api/errors";
import { fromMinor, toMinor, toMinorOrNull } from "@/server/money";
import { assertUuid } from "@/lib/uuid";

export type CouponTarget = "course" | "book";
export const COUPON_SCOPES = ["all", "courses", "books"] as const;
type Scope = (typeof COUPON_SCOPES)[number];

type CouponRow = NonNullable<Awaited<ReturnType<typeof prisma.coupon.findFirst>>>;

/** Migrated WooCommerce coupons are "percent", "fixed_cart" or "fixed_product"; new ones "percent" | "fixed". */
const isFixed = (c: Pick<CouponRow, "discountType" | "discountAmount">) => c.discountType !== "percent" && c.discountAmount != null;

export async function findByCode(code: string | null | undefined) {
  const s = String(code ?? "").trim();
  if (!s || s.length > 191) return null;
  // codes were typed in any case on the old site: match case-insensitively
  return prisma.coupon.findFirst({ where: { code: { equals: s, mode: "insensitive" }, deletedAt: null } });
}

export type CouponResult =
  | {
      valid: true;
      coupon_id: string;
      code: string;
      discount_type: string;
      discount_percent: number;
      amount_minor: number;
      original_amount_minor: number;
      saved_minor: number;
    }
  | { valid: false; amount_minor: number; original_amount_minor: number; saved_minor: 0; message: string };

/** The price of one item after a coupon, or why the coupon does not apply. */
export async function evaluate(code: string | null | undefined, target: CouponTarget, originalMinor: number): Promise<CouponResult> {
  const no = (message: string): CouponResult => ({ valid: false, amount_minor: originalMinor, original_amount_minor: originalMinor, saved_minor: 0, message });
  const c = await findByCode(code);
  if (!c || !c.isActive) return no("invalid coupon");
  if (c.expiresAt && c.expiresAt < now()) return no("coupon expired");
  if (c.usageLimit != null && c.usageCount >= c.usageLimit) return no("coupon usage limit reached");
  const scope = (c.appliesTo || "all") as Scope;
  if (scope === "courses" && target !== "course") return no("this coupon is for courses only");
  if (scope === "books" && target !== "book") return no("this coupon is for books only");
  const pct = isFixed(c) ? 0 : Number(c.discountPercent ?? 0);
  const saved = Math.max(0, Math.min(originalMinor, isFixed(c) ? toMinor(c.discountAmount) : Math.floor((originalMinor * pct) / 100)));
  return {
    valid: true,
    coupon_id: c.id,
    code: c.code,
    discount_type: isFixed(c) ? "fixed" : "percent",
    discount_percent: pct,
    amount_minor: Math.max(0, originalMinor - saved),
    original_amount_minor: originalMinor,
    saved_minor: saved,
  };
}

/** Public shape of a preview (what the checkout shows); never exposes the coupon id. */
export function previewView(r: CouponResult, currency: string) {
  if (!r.valid) return { valid: false, currency, amount_minor: r.amount_minor, original_amount_minor: r.original_amount_minor, saved_minor: 0, message: r.message };
  return {
    valid: true,
    code: r.code,
    discount_type: r.discount_type,
    discount_percent: r.discount_percent,
    currency,
    amount_minor: r.amount_minor,
    original_amount_minor: r.original_amount_minor,
    saved_minor: r.saved_minor,
  };
}

/** One more use: called when an order carrying the coupon becomes paid (exactly once per order). */
export async function countUse(couponId: string | null | undefined) {
  if (!couponId) return;
  await prisma.coupon
    .update({ where: { id: couponId }, data: { usageCount: { increment: 1 }, updatedAt: now() } })
    .catch(() => undefined);
}

// ── Admin ──

function view(c: CouponRow) {
  const expired = !!(c.expiresAt && c.expiresAt < now());
  const used = Number(c.usageCount);
  const limit = c.usageLimit == null ? null : Number(c.usageLimit);
  return {
    id: c.id,
    code: c.code,
    discount_type: isFixed(c) ? ("fixed" as const) : ("percent" as const),
    discount_percent: isFixed(c) ? null : Number(c.discountPercent ?? 0),
    /** fixed coupons, in cents */
    discount_amount: isFixed(c) ? toMinorOrNull(c.discountAmount) : null,
    applies_to: (c.appliesTo || "all") as Scope,
    expires_at: c.expiresAt?.toISOString() ?? null,
    usage_limit: limit,
    usage_count: used,
    is_active: c.isActive,
    expired,
    used_up: limit != null && used >= limit,
    created_at: c.createdAt?.toISOString() ?? null,
  };
}

export async function adminList(opts: { q?: string | null; status?: string | null; page: number; pageSize: number }) {
  const q = String(opts.q ?? "").trim().slice(0, 100);
  const t = now();
  const where = {
    deletedAt: null,
    ...(q ? { code: { contains: q, mode: "insensitive" as const } } : {}),
    ...(opts.status === "active"
      ? { isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gte: t } }] }
      : opts.status === "inactive"
        ? { OR: [{ isActive: false }, { expiresAt: { lt: t } }] }
        : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.coupon.count({ where }),
    prisma.coupon.findMany({
      where,
      orderBy: [{ createdAt: { sort: "desc", nulls: "last" } }, { code: "asc" }],
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
  ]);
  return { data: rows.map(view), total, page: opts.page };
}

type CouponInput = {
  code?: unknown;
  discount_type?: unknown;
  /** percent: 1–100; fixed: cents */
  value?: unknown;
  applies_to?: unknown;
  expires_at?: unknown;
  usage_limit?: unknown;
  is_active?: unknown;
};

function clean(input: CouponInput, partial: boolean) {
  const out: {
    code?: string;
    discountType?: string;
    discountPercent?: ReturnType<typeof fromMinor> | number | null;
    discountAmount?: ReturnType<typeof fromMinor> | null;
    appliesTo?: string;
    expiresAt?: Date | null;
    usageLimit?: bigint | null;
    isActive?: boolean;
  } = {};
  if (input.code !== undefined || !partial) {
    const code = String(input.code ?? "").trim();
    if (!code) throw Err.invalidInput("enter a coupon code");
    if (code.length > 60 || /\s/.test(code)) throw Err.invalidInput("the code must be one word, up to 60 characters");
    out.code = code;
  }
  if (input.discount_type !== undefined || input.value !== undefined || !partial) {
    const type = String(input.discount_type ?? "percent") === "fixed" ? "fixed" : "percent";
    const value = Number(input.value);
    if (type === "percent") {
      if (!Number.isFinite(value) || value <= 0 || value > 100) throw Err.invalidInput("a percentage must be 1–100");
      out.discountType = "percent";
      out.discountPercent = Math.round(value * 100) / 100;
      out.discountAmount = null;
    } else {
      const cents = Math.round(value);
      if (!Number.isFinite(cents) || cents <= 0 || cents > 100_000_00) throw Err.invalidInput("enter the amount off");
      out.discountType = "fixed";
      out.discountAmount = fromMinor(cents);
      out.discountPercent = null;
    }
  }
  if (input.applies_to !== undefined) {
    const s = String(input.applies_to);
    if (!(COUPON_SCOPES as readonly string[]).includes(s)) throw Err.invalidInput("invalid 'applies to'");
    out.appliesTo = s;
  }
  if (input.expires_at !== undefined) {
    const s = String(input.expires_at ?? "").trim();
    if (!s) out.expiresAt = null;
    else {
      const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T23:59:59Z` : s);
      if (Number.isNaN(d.getTime())) throw Err.invalidInput("invalid expiry date");
      out.expiresAt = d;
    }
  }
  if (input.usage_limit !== undefined) {
    const s = String(input.usage_limit ?? "").trim();
    if (!s) out.usageLimit = null;
    else {
      const n = Math.floor(Number(s));
      if (!Number.isFinite(n) || n < 1 || n > 1_000_000) throw Err.invalidInput("the usage limit must be a positive number");
      out.usageLimit = BigInt(n);
    }
  }
  if (input.is_active !== undefined) out.isActive = !!input.is_active;
  return out;
}

export async function adminCreate(input: CouponInput) {
  const data = clean(input, false);
  const t = now();
  const existing = await prisma.coupon.findFirst({ where: { code: { equals: data.code!, mode: "insensitive" } } });
  if (existing && !existing.deletedAt) throw Err.conflict("coupon_exists", "a coupon with this code already exists");
  const fields = {
    code: data.code!,
    discountType: data.discountType!,
    discountPercent: data.discountPercent ?? null,
    discountAmount: data.discountAmount ?? null,
    appliesTo: data.appliesTo ?? "all",
    expiresAt: data.expiresAt ?? null,
    usageLimit: data.usageLimit ?? null,
    isActive: data.isActive ?? true,
    updatedAt: t,
  };
  // a deleted coupon keeps its (unique) code: bring it back with the new settings and a fresh count
  const row = existing
    ? await prisma.coupon.update({ where: { id: existing.id }, data: { ...fields, deletedAt: null, usageCount: BigInt(0) } })
    : await prisma.coupon.create({ data: { id: newId(), createdAt: t, ...fields } });
  return view(row);
}

export async function adminUpdate(id: string, input: CouponInput) {
  assertUuid(id, "coupon not found");
  const c = await prisma.coupon.findFirst({ where: { id, deletedAt: null } });
  if (!c) throw Err.notFound("coupon not found");
  const data = clean(input, true);
  if (data.code && data.code.toLowerCase() !== c.code.toLowerCase()) {
    const taken = await prisma.coupon.findFirst({ where: { code: { equals: data.code, mode: "insensitive" }, id: { not: id } } });
    if (taken) throw Err.conflict("coupon_exists", "a coupon with this code already exists");
  }
  const row = await prisma.coupon.update({ where: { id }, data: { ...data, updatedAt: now() } });
  return view(row);
}

export async function adminDelete(id: string) {
  assertUuid(id, "coupon not found");
  const c = await prisma.coupon.findFirst({ where: { id, deletedAt: null } });
  if (!c) throw Err.notFound("coupon not found");
  // soft delete: orders that used it keep their history
  await prisma.coupon.update({ where: { id }, data: { deletedAt: now(), isActive: false, updatedAt: now() } });
  return { ok: true };
}
