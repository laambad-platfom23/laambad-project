/**
 * A5 — Course bundles (diplomas): several courses sold together. Buying a bundle (WaafiPay, or a manual
 * EVC request approved by an admin) opens every course of the bundle for the student.
 * Price = sale_price when set, else price. The two diplomas of the old site were imported as drafts.
 */
import { prisma, newId, now } from "@/lib/db";
import { ApiError, Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { fromMinor, toMinor } from "@/server/money";
import { isWaafiPayConfigured, normalizeSomaliMobile, waafiPurchase } from "@/server/waafipay";
import { findBestEnrollment, hasCourseAccess } from "@/server/enrollment-status";
import { assertUuid, isUuid } from "@/lib/uuid";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { courseCoverUrl } from "./courses";
import { withLegacyPrice } from "@/server/legacy-prices";
import { slugify } from "./learning-paths";
import { notify } from "@/server/notify";

type BundleRow = NonNullable<Awaited<ReturnType<typeof load>>>;
async function load(where: { id?: string; slug?: string }) {
  return prisma.bundle.findFirst({
    where: { ...where, deletedAt: null },
    include: {
      courses: {
        orderBy: { sortOrder: "asc" },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              slug: true,
              status: true,
              deletedAt: true,
              legacyThumbnailId: true,
              coverUrl: true,
              instructor: { select: { name: true } },
              pricing: { where: { isActive: true, deletedAt: null }, take: 1 },
            },
          },
        },
      },
    },
  });
}

const priceMinor = (b: { price: unknown; salePrice: unknown }) =>
  b.salePrice !== null && b.salePrice !== undefined ? toMinor(b.salePrice as never) : toMinor(b.price as never);

function view(b: BundleRow, extra?: { owned?: boolean; pending?: boolean; owned_courses?: number }) {
  const courses = b.courses
    .filter((bc) => bc.course && !bc.course.deletedAt)
    .map((bc) => {
      const p = withLegacyPrice(bc.course.pricing[0] ?? null);
      return {
        id: bc.course.id,
        title: decodeHtmlEntities(bc.course.title),
        slug: bc.course.slug,
        status: bc.course.status,
        instructor_name: bc.course.instructor?.name ?? null,
        cover_url: courseCoverUrl(bc.course),
        price: p ? (p.isFree ? 0 : toMinor(p.discountPrice ?? p.price)) : 0,
      };
    });
  const value = courses.reduce((s, c) => s + c.price, 0);
  return {
    id: b.id,
    title: b.title,
    slug: b.slug,
    description: b.description,
    cover_url: b.coverUrl ?? courses.find((c) => c.cover_url)?.cover_url ?? null,
    price: toMinor(b.price),
    sale_price: b.salePrice !== null ? toMinor(b.salePrice) : null,
    effective_price: priceMinor(b),
    courses_value: value, // what the courses cost one by one
    currency: b.currency,
    status: b.status,
    course_count: courses.length,
    courses,
    ...extra,
  };
}

async function ownership(userId: string, b: BundleRow) {
  const ids = b.courses.map((c) => c.courseId);
  const [orders, enrolled] = await Promise.all([
    prisma.bundleOrder.findMany({ where: { userId, bundleId: b.id, status: { in: ["paid", "pending"] } }, select: { status: true } }),
    prisma.enrollment.findMany({ where: { userId, courseId: { in: ids }, deletedAt: null }, select: { courseId: true, status: true, paymentStatus: true, completedAt: true } }),
  ]);
  const have = new Set(enrolled.filter((e) => hasCourseAccess(e)).map((e) => e.courseId));
  return {
    owned: orders.some((o) => o.status === "paid") || (ids.length > 0 && ids.every((id) => have.has(id))),
    pending: orders.some((o) => o.status === "pending"),
    owned_courses: ids.filter((id) => have.has(id)).length,
  };
}

export async function listBundles(user: AuthUser | null) {
  const admin = user?.role === "admin";
  const ids = await prisma.bundle.findMany({
    where: { deletedAt: null, ...(admin ? {} : { status: "published" }) },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const out = [];
  for (const { id } of ids) {
    const b = await load({ id });
    if (!b) continue;
    out.push(user ? view(b, await ownership(user.user_id, b)) : view(b));
  }
  return out;
}

export async function getBundle(user: AuthUser | null, slugOrId: string) {
  const b = await load(isUuid(slugOrId) ? { id: slugOrId } : { slug: slugOrId });
  if (!b || (b.status !== "published" && user?.role !== "admin")) throw Err.notFound("bundle not found");
  return user ? view(b, await ownership(user.user_id, b)) : view(b);
}

// ── admin ──
type BundleInput = {
  title?: string;
  slug?: string;
  description?: string | null;
  cover_url?: string | null;
  price?: number; // cents
  sale_price?: number | null; // cents
  status?: string;
  course_ids?: string[];
};

async function uniqueSlug(base: string, exceptId?: string) {
  let slug = slugify(base);
  for (let i = 2; i < 50; i++) {
    if (!(await prisma.bundle.findFirst({ where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) } }))) return slug;
    slug = `${slugify(base)}-${i}`;
  }
  return `${slugify(base)}-${newId().slice(0, 6)}`;
}

function cents(v: unknown, field: string) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 100_000_00) throw Err.invalidInput(`invalid ${field}`);
  return n;
}

async function validCourses(ids: unknown) {
  if (!Array.isArray(ids)) throw Err.invalidInput("course_ids must be a list");
  const list = [...new Set(ids.map(String))].slice(0, 40);
  if (list.some((id) => !isUuid(id))) throw Err.invalidInput("unknown course");
  const found = await prisma.course.count({ where: { id: { in: list }, deletedAt: null } });
  if (found !== list.length) throw Err.invalidInput("unknown course");
  return list;
}

export async function saveBundle(user: AuthUser, id: string | null, input: BundleInput) {
  if (user.role !== "admin") throw Err.forbidden();
  const existing = id ? await prisma.bundle.findFirst({ where: { id: assertUuid(id, "bundle not found"), deletedAt: null } }) : null;
  if (id && !existing) throw Err.notFound("bundle not found");
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const t = String(input.title).trim().slice(0, 255);
    if (!t) throw Err.invalidInput("title is required");
    data.title = t;
  }
  if (!existing && !data.title) throw Err.invalidInput("title is required");
  if (input.description !== undefined) data.description = input.description ? String(input.description).slice(0, 20_000) : null;
  if (input.cover_url !== undefined) {
    const c = String(input.cover_url ?? "").trim();
    if (c && !/^https?:\/\//i.test(c) && !c.startsWith("/")) throw Err.invalidInput("cover must be a URL");
    data.coverUrl = c || null;
  }
  if (input.price !== undefined) data.price = fromMinor(cents(input.price, "price"));
  if (input.sale_price !== undefined) data.salePrice = input.sale_price === null ? null : fromMinor(cents(input.sale_price, "sale price"));
  if (input.status !== undefined) {
    if (!["draft", "published"].includes(String(input.status))) throw Err.invalidInput("invalid status");
    data.status = String(input.status);
  }
  const courseIds = input.course_ids !== undefined ? await validCourses(input.course_ids) : null;
  const t = now();
  const bundleId = existing?.id ?? newId();
  if ((data.status ?? existing?.status) === "published") {
    const count = courseIds ? courseIds.length : await prisma.bundleCourse.count({ where: { bundleId } });
    if (count < 2) throw Err.invalidInput("a bundle needs at least 2 courses before publishing");
  }
  const ops = [];
  if (existing) ops.push(prisma.bundle.update({ where: { id: bundleId }, data: { ...data, updatedAt: t } }));
  else
    ops.push(
      prisma.bundle.create({
        data: { id: bundleId, slug: await uniqueSlug(input.slug?.trim() || String(data.title)), createdBy: user.user_id, createdAt: t, updatedAt: t, ...(data as { title: string }) },
      })
    );
  if (courseIds) {
    ops.push(prisma.bundleCourse.deleteMany({ where: { bundleId } }) as never);
    ops.push(prisma.bundleCourse.createMany({ data: courseIds.map((courseId, i) => ({ bundleId, courseId, sortOrder: i })) }) as never);
  }
  await prisma.$transaction(ops);
  return getBundle(user, bundleId);
}

export async function deleteBundle(user: AuthUser, id: string) {
  if (user.role !== "admin") throw Err.forbidden();
  assertUuid(id, "bundle not found");
  const b = await prisma.bundle.findFirst({ where: { id, deletedAt: null } });
  if (!b) throw Err.notFound("bundle not found");
  await prisma.bundle.update({ where: { id }, data: { deletedAt: now(), status: "draft", updatedAt: now() } });
  return { ok: true };
}

/** Open every course of the bundle for the student (keeps access they already have). */
async function grant(userId: string, bundleId: string, orderId: string) {
  const b = await load({ id: bundleId });
  if (!b) return;
  const t = now();
  for (const bc of b.courses) {
    const e = await findBestEnrollment(userId, bc.courseId);
    if (e && hasCourseAccess(e)) continue;
    if (e) await prisma.enrollment.update({ where: { id: e.id }, data: { status: "active", paymentStatus: "paid", updatedAt: t } });
    else
      await prisma.enrollment.create({
        data: { id: newId(), userId, courseId: bc.courseId, status: "active", paymentStatus: "paid", enrolledAt: t, createdAt: t, updatedAt: t },
      });
  }
  notify({
    userId,
    kind: "bundle",
    ref: orderId,
    title: `Your diploma is open: ${b.title}`,
    body: `All ${b.courses.length} courses of "${b.title}" are now open for you.`,
    link: "/dashboard/my-courses",
    email: {
      subject: `"${b.title}" is open`,
      lines: [`Your payment was confirmed. All ${b.courses.length} courses of "${b.title}" are now open.`, "Start with the first course whenever you are ready."],
      cta: "Go to my courses",
    },
  });
}

async function buyable(user: AuthUser, bundleId: string) {
  assertUuid(bundleId, "bundle not found");
  const b = await load({ id: bundleId });
  if (!b || b.status !== "published") throw Err.notFound("bundle not found");
  const own = await ownership(user.user_id, b);
  if (own.owned) throw Err.conflict("already_owned", "you already have all courses of this bundle");
  return b;
}

const orderView = (o: { id: string; bundleId: string; amount: unknown; currency: string; status: string; provider: string }) => ({
  id: o.id,
  bundle_id: o.bundleId,
  amount: toMinor(o.amount as never),
  currency: o.currency,
  status: o.status,
  provider: o.provider,
});

/** Free bundle: open it right away. */
export async function enrollFree(user: AuthUser, bundleId: string) {
  const b = await buyable(user, bundleId);
  if (priceMinor(b) > 0) throw Err.paymentRequired();
  const t = now();
  const row = await prisma.bundleOrder.create({
    data: { id: newId(), bundleId, userId: user.user_id, amount: 0, currency: b.currency, status: "paid", provider: "free", paidAt: t, createdAt: t, updatedAt: t },
  });
  await grant(user.user_id, bundleId, row.id);
  return orderView(row);
}

export async function payWithWaafi(user: AuthUser, bundleId: string, input: { phone?: string }) {
  const b = await buyable(user, bundleId);
  const amount = priceMinor(b);
  if (amount === 0) return { ...(await enrollFree(user, bundleId)), outcome: "approved" as const, message: "Enrolled" };
  if (!isWaafiPayConfigured()) throw new ApiError(503, "waafipay_not_configured", "WaafiPay is not available right now. Please use manual payment.");
  if (b.currency.toUpperCase() !== "USD") throw Err.invalidInput("WaafiPay accepts USD only");
  const msisdn = normalizeSomaliMobile(input.phone);
  if (!msisdn) throw Err.invalidInput("enter a valid Somali mobile number (e.g. 61 234 5678)");
  const t = now();
  const recent = await prisma.bundleOrder.findMany({
    where: { userId: user.user_id, provider: "wafi", createdAt: { gte: new Date(t.getTime() - 10 * 60_000) } },
    select: { bundleId: true, status: true, createdAt: true },
  });
  if (recent.length >= 5) throw new ApiError(429, "too_many_attempts", "Too many payment attempts. Please wait a few minutes.");
  if (recent.some((r) => r.bundleId === bundleId && r.status === "pending" && r.createdAt >= new Date(t.getTime() - 3 * 60_000))) {
    throw Err.conflict("payment_in_progress", "A payment for this bundle is already waiting for your PIN.");
  }
  const row = await prisma.bundleOrder.create({
    data: { id: newId(), bundleId, userId: user.user_id, amount: fromMinor(amount), currency: b.currency, status: "pending", provider: "wafi", providerRefId: msisdn, createdAt: t, updatedAt: t },
  });
  const outcome = await waafiPurchase({
    msisdn,
    amountMinor: amount,
    currency: b.currency,
    referenceId: row.id,
    invoiceId: row.id.replace(/-/g, "").slice(0, 20),
    description: `Laambad bundle: ${b.title}`.slice(0, 100),
  });
  const t2 = now();
  if (outcome.kind === "approved") {
    const done = await prisma.bundleOrder.updateMany({
      where: { id: row.id, status: "pending" },
      data: { status: "paid", paidAt: t2, transactionId: outcome.transactionId || null, updatedAt: t2 },
    });
    if (done.count === 1) await grant(user.user_id, bundleId, row.id);
    return { ...orderView({ ...row, status: "paid" }), outcome: "approved" as const, message: "Payment received. All courses are open." };
  }
  if (outcome.kind === "declined") {
    await prisma.bundleOrder.updateMany({
      where: { id: row.id, status: "pending" },
      data: { status: "failed", note: `waafipay ${outcome.code}: ${outcome.message}`.slice(0, 500), updatedAt: t2 },
    });
    return { ...orderView({ ...row, status: "failed" }), outcome: "declined" as const, message: outcome.message };
  }
  return { ...orderView(row), outcome: "unknown" as const, message: "We could not confirm the payment yet. If money was taken, the courses open after we verify it." };
}

export async function requestManual(user: AuthUser, bundleId: string, input: { sender_phone?: string; reference?: string }) {
  const b = await buyable(user, bundleId);
  const amount = priceMinor(b);
  if (amount === 0) return enrollFree(user, bundleId);
  const sender = normalizeSomaliMobile(input.sender_phone);
  if (!sender) throw Err.invalidInput("enter a valid Somali mobile number for the sender");
  const reference = (input.reference ?? "").replace(/[^\w\-./ #]/g, "").trim().slice(0, 64) || null;
  const t = now();
  const open = await prisma.bundleOrder.findFirst({ where: { bundleId, userId: user.user_id, provider: "offline", status: "pending" } });
  const row = open
    ? await prisma.bundleOrder.update({
        where: { id: open.id },
        data: { amount: fromMinor(amount), providerRefId: sender, transactionId: reference ?? open.transactionId, updatedAt: t },
      })
    : await prisma.bundleOrder.create({
        data: { id: newId(), bundleId, userId: user.user_id, amount: fromMinor(amount), currency: b.currency, status: "pending", provider: "offline", providerRefId: sender, transactionId: reference, createdAt: t, updatedAt: t },
      });
  return orderView(row);
}

export async function adminOrders(user: AuthUser, status?: string | null) {
  if (user.role !== "admin") throw Err.forbidden();
  const rows = await prisma.bundleOrder.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { bundle: { select: { title: true } }, user: { select: { name: true, email: true, phone: true } } },
  });
  return rows.map((o) => ({
    ...orderView(o),
    bundle_title: o.bundle.title,
    student_name: o.user.name,
    student_email: o.user.email,
    payer_phone: o.providerRefId && /^252\d{9}$/.test(o.providerRefId) ? `+${o.providerRefId}` : undefined,
    transaction_id: o.transactionId ?? undefined,
    note: o.note ?? undefined,
    created_at: o.createdAt.toISOString(),
  }));
}

export async function adminDecide(user: AuthUser, id: string, approve: boolean, text?: string) {
  if (user.role !== "admin") throw Err.forbidden();
  assertUuid(id, "order not found");
  const o = await prisma.bundleOrder.findFirst({ where: { id } });
  if (!o) throw Err.notFound("order not found");
  const t = now();
  if (approve) {
    if (o.status === "paid") return { ok: true, already: true };
    const ref = (text ?? "").replace(/[^\w\-./ #]/g, "").trim().slice(0, 64);
    await prisma.bundleOrder.update({ where: { id }, data: { status: "paid", paidAt: t, updatedAt: t, ...(ref ? { transactionId: ref } : {}) } });
    await grant(o.userId, o.bundleId, o.id);
    return { ok: true };
  }
  if (o.status !== "pending") throw Err.conflict("not_pending", "only pending orders can be rejected");
  await prisma.bundleOrder.update({ where: { id }, data: { status: "failed", note: (text || "rejected by admin").slice(0, 500), updatedAt: t } });
  return { ok: true };
}
