import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma, newId, now } from "@/lib/db";
import { ApiError, Err } from "@/lib/api/errors";
import { isWaafiPayConfigured, maskMobile, normalizeSomaliMobile, waafiPurchase } from "@/server/waafipay";
import { withLegacyPrice } from "@/server/legacy-prices";
import { fromMinor, toMinor, toMinorOrNull } from "@/server/money";
import { findBestEnrollment, hasCourseAccess } from "@/server/enrollment-status";
import { previewCoupon } from "@/server/services/courses";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { ser, toSlug } from "@/server/serialize";
import type { AuthUser } from "@/lib/auth/request";
import { savePublicUpload } from "@/lib/local-storage";
import { courseDurationMinutes, courseIssuesCertificate, formatDuration } from "@/server/legacy-course-certificates";

// ── Users ──
export async function listUsers(page = 1, pageSize = 20, opts: { q?: string; role?: string } = {}) {
  const take = Math.min(Math.max(pageSize, 1), 100);
  const skip = (Math.max(page, 1) - 1) * take;
  const q = (opts.q ?? "").trim().slice(0, 100);
  // UI role "student" = stored slug "user"
  const roleSlug = opts.role === "student" ? "user" : opts.role;
  const where = {
    deletedAt: null,
    ...(roleSlug && ["admin", "instructor", "user"].includes(roleSlug) ? { role: { slug: roleSlug } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { username: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take,
      include: { role: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    data: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      username: u.username,
      phone: u.phone,
      avatar_url: u.avatarUrl,
      is_active: u.isActive,
      role: u.role.slug,
      role_slug: u.role.slug,
      created_at: u.createdAt?.toISOString(),
      updated_at: u.updatedAt?.toISOString(),
    })),
    total,
    page: Math.max(page, 1),
  };
}

export async function getUser(id: string) {
  const u = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: { role: true },
  });
  if (!u) throw Err.notFound("user not found");
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    username: u.username,
    phone: u.phone,
    avatar_url: u.avatarUrl,
    is_active: u.isActive,
    role: u.role.slug,
    role_slug: u.role.slug,
  };
}

export async function updateUserRole(id: string, roleSlug: string) {
  const role = await prisma.role.findFirst({ where: { slug: roleSlug, deletedAt: null } });
  if (!role) throw Err.notFound("role not found");
  await prisma.user.update({ where: { id }, data: { roleId: role.id, updatedAt: now() } });
  return getUser(id);
}

export async function setUserActive(id: string, active: boolean) {
  await prisma.user.update({ where: { id }, data: { isActive: active, updatedAt: now() } });
  return getUser(id);
}

/**
 * Admin: give a user (e.g. a migrated instructor who no longer knows their WordPress password) a new
 * password. Replaces the legacy WordPress hash with bcrypt and signs the user out everywhere.
 */
export async function setUserPassword(id: string, password: unknown) {
  if (typeof password !== "string" || password.length < 8) throw Err.weakPassword();
  if (password.length > 200) throw Err.invalidInput("password is too long");
  const user = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!user) throw Err.notFound("user not found");
  const hash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { password: hash, passwordScheme: "bcrypt", legacyPasswordHash: null, mustResetPassword: false, updatedAt: now() },
    }),
    prisma.session.deleteMany({ where: { userId: id } }),
  ]);
  return getUser(id);
}

// ── Categories ──
export async function listCourseCategories() {
  const rows = await prisma.courseCategory.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" },
  });
  return ser(
    rows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      sort_order: Number(c.sortOrder),
      created_at: c.createdAt?.toISOString(),
      updated_at: c.updatedAt?.toISOString(),
    }))
  );
}

export async function createCourseCategory(input: {
  name: string;
  slug?: string;
  sort_order?: number;
}) {
  const t = now();
  const slug = (input.slug || toSlug(input.name)).trim();
  const row = await prisma.courseCategory.create({
    data: {
      id: newId(),
      name: input.name.trim(),
      slug,
      sortOrder: BigInt(input.sort_order ?? 0),
      createdAt: t,
      updatedAt: t,
    },
  });
  return ser({
    id: row.id,
    name: row.name,
    slug: row.slug,
    sort_order: Number(row.sortOrder),
  });
}

export async function updateCourseCategory(
  id: string,
  input: { name?: string; slug?: string; sort_order?: number }
) {
  const row = await prisma.courseCategory.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      slug: input.slug?.trim(),
      sortOrder: input.sort_order === undefined ? undefined : BigInt(input.sort_order),
      updatedAt: now(),
    },
  });
  return ser({
    id: row.id,
    name: row.name,
    slug: row.slug,
    sort_order: Number(row.sortOrder),
  });
}

export async function deleteCourseCategory(id: string) {
  await prisma.courseCategory.update({
    where: { id },
    data: { deletedAt: now(), updatedAt: now() },
  });
}

// ── Certificates ──
type CertRow = {
  id: string;
  userId: string;
  courseId: string;
  verificationId: string;
  issuedAt: Date;
  pdfUrl: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  user: { id: string; name: string; email?: string };
  course: { id: string; title: string; slug: string };
};

/** Everything the certificate design needs (Tutor template tutor_cb_25649). */
async function certificateView(c: CertRow, opts: { includeEmail?: boolean } = {}) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { userId: c.userId, courseId: c.courseId, deletedAt: null, completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true },
  });
  return ser({
    id: c.id,
    user_id: c.userId,
    course_id: c.courseId,
    verification_id: c.verificationId,
    issued_at: c.issuedAt.toISOString(),
    completed_at: (enrollment?.completedAt ?? c.issuedAt).toISOString(),
    pdf_url: c.pdfUrl,
    student_name: c.user.name,
    course_title: decodeHtmlEntities(c.course.title),
    duration: formatDuration(courseDurationMinutes(c.courseId)),
    user: { id: c.user.id, name: c.user.name, ...(opts.includeEmail ? { email: c.user.email } : {}) },
    course: { id: c.course.id, title: decodeHtmlEntities(c.course.title), slug: c.course.slug },
    created_at: c.createdAt?.toISOString(),
    updated_at: c.updatedAt?.toISOString(),
  });
}

const CERT_INCLUDE = {
  user: { select: { id: true, name: true, email: true } },
  course: { select: { id: true, title: true, slug: true } },
} as const;

export async function listCertificates(userId: string) {
  const rows = await prisma.certificate.findMany({
    where: { userId, deletedAt: null },
    include: CERT_INCLUDE,
    orderBy: { issuedAt: "desc" },
  });
  return ser(
    rows.map((c) => ({
      id: c.id,
      user_id: c.userId,
      course_id: c.courseId,
      verification_id: c.verificationId,
      issued_at: c.issuedAt.toISOString(),
      pdf_url: c.pdfUrl,
      student_name: c.user.name,
      course_title: decodeHtmlEntities(c.course.title),
      course: { id: c.course.id, title: decodeHtmlEntities(c.course.title), slug: c.course.slug },
    }))
  );
}

export async function getCertificate(userId: string, id: string) {
  const c = await prisma.certificate.findFirst({
    where: { id, userId, deletedAt: null },
    include: CERT_INCLUDE,
  });
  if (!c) throw Err.notFound("certificate not found");
  return certificateView(c, { includeEmail: true });
}

/** 16 lowercase hex chars, the same shape as the Tutor LMS certificate ids (e.g. 89120a6ea51d8bb1). */
async function newVerificationId() {
  for (let i = 0; i < 5; i++) {
    const id = randomBytes(8).toString("hex");
    const taken = await prisma.certificate.findFirst({ where: { verificationId: id }, select: { id: true } });
    if (!taken) return id;
  }
  throw new Error("could not allocate a certificate id");
}

/**
 * Complete a course and issue its certificate (Tutor "Complete Course"). Requirements: the student
 * has access and has completed every lesson. Idempotent: returns the existing certificate.
 * Returns null when the course gives no certificate (template "none" in WordPress).
 */
export async function completeCourseAndIssue(userId: string, courseId: string) {
  const enrollment = await findBestEnrollment(userId, courseId);
  if (!enrollment || !hasCourseAccess(enrollment)) throw Err.forbidden();

  const existing = await prisma.certificate.findFirst({
    where: { userId, courseId, deletedAt: null },
    select: { id: true },
  });
  if (existing) return getCertificate(userId, existing.id);

  const lessonIds = (
    await prisma.lesson.findMany({
      where: { deletedAt: null, section: { courseId, deletedAt: null } },
      select: { id: true },
    })
  ).map((l) => l.id);
  // progress belongs to the user + lesson (migrated rows may point at another enrollment of the same course)
  const done = await prisma.lessonProgress.count({
    where: { userId, lessonId: { in: lessonIds }, completed: true, deletedAt: null },
  });
  if (lessonIds.length === 0 || done < lessonIds.length) {
    throw Err.invalidInput("complete all lessons first");
  }

  const t = now();
  if (!enrollment.completedAt) {
    await prisma.enrollment.update({ where: { id: enrollment.id }, data: { completedAt: t, updatedAt: t } });
  }
  if (!courseIssuesCertificate(courseId)) return null;

  const row = await prisma.certificate.create({
    data: {
      id: newId(),
      userId,
      courseId,
      verificationId: await newVerificationId(),
      issuedAt: t,
      createdAt: t,
      updatedAt: t,
    },
  });
  return getCertificate(userId, row.id);
}

export async function issueCertificate(user: AuthUser, courseId: string) {
  const cert = await completeCourseAndIssue(user.user_id, courseId);
  if (!cert) throw Err.conflict("no_certificate", "this course does not give a certificate");
  return cert;
}

/** Public verification page (QR target). Shows the certificate, never the e-mail. */
export async function verifyCertificate(verificationId: string) {
  const c = await prisma.certificate.findFirst({
    where: { verificationId: { in: [verificationId.trim(), verificationId.trim().toLowerCase()] }, deletedAt: null },
    include: CERT_INCLUDE,
  });
  if (!c) throw Err.notFound("certificate not found");
  return { valid: true, certificate: await certificateView(c) };
}

// ── Notifications ──
export async function listNotifications(userId: string) {
  const rows = await prisma.notification.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return ser(
    rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      meta: n.meta,
      read_at: n.readAt?.toISOString() ?? null,
      created_at: n.createdAt?.toISOString(),
    }))
  );
}

export async function markNotificationRead(userId: string, id: string) {
  const n = await prisma.notification.findFirst({ where: { id, userId, deletedAt: null } });
  if (!n) throw Err.notFound("notification not found");
  await prisma.notification.update({
    where: { id },
    data: { readAt: now(), updatedAt: now() },
  });
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null, deletedAt: null },
    data: { readAt: now(), updatedAt: now() },
  });
}

// ── Research ──
export async function publicResearch(page = 1, pageSize = 20) {
  const take = Math.min(Math.max(pageSize, 1), 100);
  const skip = (Math.max(page, 1) - 1) * take;
  const where = { status: "published", deletedAt: null };
  const [total, rows] = await Promise.all([
    prisma.researchPaper.count({ where }),
    prisma.researchPaper.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: { author: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  return {
    data: ser(
      rows.map((p) => ({
        id: p.id,
        title: p.title,
        abstract: p.abstract,
        pdf_url: p.pdfUrl,
        status: p.status,
        author_id: p.authorId,
        author: p.author,
        created_at: p.createdAt?.toISOString(),
      }))
    ),
    total,
    page: Math.max(page, 1),
  };
}

export async function listResearchCategories() {
  const rows = await prisma.researchCategory.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });
  return ser(rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug })));
}

export async function createResearchCategory(input: { name: string; slug?: string }) {
  const t = now();
  const row = await prisma.researchCategory.create({
    data: {
      id: newId(),
      name: input.name.trim(),
      slug: (input.slug || toSlug(input.name)).trim(),
      createdAt: t,
      updatedAt: t,
    },
  });
  return ser({ id: row.id, name: row.name, slug: row.slug });
}

export async function updateResearchCategory(
  id: string,
  input: { name?: string; slug?: string }
) {
  const row = await prisma.researchCategory.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      slug: input.slug?.trim(),
      updatedAt: now(),
    },
  });
  return ser({ id: row.id, name: row.name, slug: row.slug });
}

export async function deleteResearchCategory(id: string) {
  await prisma.researchCategory.update({
    where: { id },
    data: { deletedAt: now(), updatedAt: now() },
  });
}

export async function listResearchPapers(page = 1, pageSize = 20) {
  const take = Math.min(Math.max(pageSize, 1), 100);
  const skip = (Math.max(page, 1) - 1) * take;
  const where = { deletedAt: null };
  const [total, rows] = await Promise.all([
    prisma.researchPaper.count({ where }),
    prisma.researchPaper.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: { author: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  return {
    data: ser(
      rows.map((p) => ({
        id: p.id,
        title: p.title,
        abstract: p.abstract,
        pdf_url: p.pdfUrl,
        status: p.status,
        author_id: p.authorId,
        author: p.author,
        created_at: p.createdAt?.toISOString(),
      }))
    ),
    total,
    page: Math.max(page, 1),
  };
}

export async function getResearchPaper(id: string) {
  const p = await prisma.researchPaper.findFirst({
    where: { id, deletedAt: null },
    include: {
      author: { select: { id: true, name: true, email: true } },
      reviews: true,
    },
  });
  if (!p) throw Err.notFound("paper not found");
  return ser({
    id: p.id,
    title: p.title,
    abstract: p.abstract,
    pdf_url: p.pdfUrl,
    status: p.status,
    author_id: p.authorId,
    author: p.author,
    reviews: p.reviews,
    created_at: p.createdAt?.toISOString(),
  });
}

export async function createResearchPaper(
  user: AuthUser,
  input: { title: string; abstract?: string; pdf_url: string; category_ids?: string[] }
) {
  const t = now();
  const id = newId();
  await prisma.researchPaper.create({
    data: {
      id,
      authorId: user.user_id,
      title: input.title.trim(),
      abstract: input.abstract || null,
      pdfUrl: input.pdf_url,
      status: "draft",
      createdAt: t,
      updatedAt: t,
    },
  });
  if (input.category_ids?.length) {
    await prisma.researchPaperCategory.createMany({
      data: input.category_ids.map((categoryId) => ({
        researchPaperId: id,
        categoryId,
      })),
      skipDuplicates: true,
    });
  }
  return getResearchPaper(id);
}

export async function updateResearchPaper(
  user: AuthUser,
  id: string,
  input: { title?: string; abstract?: string; pdf_url?: string }
) {
  const p = await prisma.researchPaper.findFirst({ where: { id, deletedAt: null } });
  if (!p) throw Err.notFound("paper not found");
  if (p.authorId !== user.user_id && user.role !== "admin") throw Err.forbidden();
  await prisma.researchPaper.update({
    where: { id },
    data: {
      title: input.title?.trim(),
      abstract: input.abstract,
      pdfUrl: input.pdf_url,
      updatedAt: now(),
    },
  });
  return getResearchPaper(id);
}

export async function submitResearchPaper(user: AuthUser, id: string) {
  const p = await prisma.researchPaper.findFirst({ where: { id, deletedAt: null } });
  if (!p) throw Err.notFound("paper not found");
  if (p.authorId !== user.user_id && user.role !== "admin") throw Err.forbidden();
  await prisma.researchPaper.update({
    where: { id },
    data: { status: "submitted", updatedAt: now() },
  });
  return getResearchPaper(id);
}

export async function setResearchPaperStatus(id: string, status: string) {
  await prisma.researchPaper.update({
    where: { id },
    data: { status, updatedAt: now() },
  });
  return getResearchPaper(id);
}

export async function addResearchReview(
  user: AuthUser,
  paperId: string,
  input: { comment: string; rating?: number }
) {
  const t = now();
  await prisma.researchReview.create({
    data: {
      id: newId(),
      paperId,
      reviewerId: user.user_id,
      comment: input.comment,
      rating: input.rating == null ? null : BigInt(input.rating),
      createdAt: t,
      updatedAt: t,
    },
  });
  return getResearchPaper(paperId);
}

// ── Payments ──
const PAYMENT_DONE = ["paid", "success", "completed"];

/** Server-side price for a checkout (never trusts the browser): active pricing, then a valid coupon. */
async function checkoutAmount(courseId: string, couponCode?: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, status: "published", deletedAt: null },
    select: { id: true, title: true, slug: true },
  });
  if (!course) throw Err.notFound("course not found");
  const pricing = withLegacyPrice(
    await prisma.coursePricing.findFirst({
      where: { courseId, isActive: true, deletedAt: null },
    })
  );
  if (!pricing) throw Err.notFound("pricing not found");

  // amounts in integer cents here; stored as Decimal dollars (G1)
  let amount = pricing.isFree ? 0 : toMinor(pricing.discountPrice ?? pricing.price);
  let couponId: string | null = null;
  if (couponCode?.trim()) {
    // same rules as the checkout preview (percent / fixed, case-insensitive code, expiry, usage limit)
    const preview = await previewCoupon(courseId, couponCode);
    if (preview.valid) {
      amount = preview.amount_minor;
      const coupon = await prisma.coupon.findFirst({
        where: { code: { equals: couponCode.trim(), mode: "insensitive" }, deletedAt: null },
        select: { id: true },
      });
      couponId = coupon?.id ?? null;
    }
  }
  return { course, amount: Math.max(0, amount), currency: pricing.currency || "USD", couponId };
}

/** Give the user access after a settled payment (reuses the best existing enrollment row). */
async function activateEnrollment(userId: string, courseId: string, t: Date) {
  const existing = await findBestEnrollment(userId, courseId);
  if (existing && hasCourseAccess(existing)) return;
  if (existing) {
    await prisma.enrollment.update({
      where: { id: existing.id },
      data: { paymentStatus: "paid", status: "active", updatedAt: t },
    });
    return;
  }
  await prisma.enrollment.create({
    data: {
      id: newId(),
      userId,
      courseId,
      status: "active",
      paymentStatus: "paid",
      enrolledAt: t,
      createdAt: t,
      updatedAt: t,
    },
  });
}

function paymentView(row: {
  id: string;
  userId: string | null;
  courseId: string;
  amount: Parameters<typeof toMinor>[0];
  currency: string;
  status: string;
  provider: string;
  transactionId?: string | null;
}) {
  return ser({
    id: row.id,
    user_id: row.userId,
    course_id: row.courseId,
    amount: toMinor(row.amount),
    currency: row.currency,
    status: row.status,
    provider: row.provider,
    transaction_id: row.transactionId ?? undefined,
  });
}

/**
 * Manual payment request (EVC Plus to the institute number): the student sends the money, tells us the
 * sender number / transaction id, and an admin approves it on the Payments page. Free totals settle now.
 */
export async function createPayment(
  user: AuthUser,
  courseId: string,
  input?: { coupon_code?: string; provider?: string; sender_phone?: string; reference?: string }
) {
  const { amount, currency, couponId } = await checkoutAmount(courseId, input?.coupon_code);
  const existing = await findBestEnrollment(user.user_id, courseId);
  if (existing && hasCourseAccess(existing)) throw Err.alreadyEnrolled();

  // only manual requests are created here; WaafiPay goes through payWithWaafi (real charge)
  const provider = amount === 0 ? "free" : "offline";
  let senderPhone: string | null = null;
  if (amount > 0 && input?.sender_phone?.trim()) {
    senderPhone = normalizeSomaliMobile(input.sender_phone);
    if (!senderPhone) throw Err.invalidInput("enter a valid Somali mobile number for the sender");
  }
  const reference = (input?.reference ?? "").replace(/[^\w\-./ #]/g, "").trim().slice(0, 64) || null;

  const t = now();
  if (amount > 0) {
    // one open request per course: update it instead of piling up duplicates
    const open = await prisma.payment.findFirst({
      where: { userId: user.user_id, courseId, provider: "offline", status: "pending", deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (open) {
      const row = await prisma.payment.update({
        where: { id: open.id },
        data: {
          amount: fromMinor(amount),
          currency,
          couponId,
          providerRefId: senderPhone ?? open.providerRefId,
          transactionId: reference ?? open.transactionId,
          updatedAt: t,
        },
      });
      return paymentView(row);
    }
  }

  const row = await prisma.payment.create({
    data: {
      id: newId(),
      userId: user.user_id,
      courseId,
      amount: fromMinor(amount),
      currency,
      status: amount === 0 ? "paid" : "pending",
      provider,
      couponId,
      providerRefId: senderPhone,
      transactionId: reference,
      paidAt: amount === 0 ? t : null,
      idempotencyKey: newId(),
      createdAt: t,
      updatedAt: t,
    },
  });
  if (amount === 0) await activateEnrollment(user.user_id, courseId, t);
  return paymentView(row);
}

/**
 * WaafiPay (EVC Plus / Zaad / Sahal / eDahab): the payer gets a USSD prompt and confirms with the PIN.
 * The amount is computed here, the payment row is written before the charge (referenceId = row id), and
 * access is granted only on an APPROVED answer. An unclear answer leaves the row pending for an admin.
 */
export async function payWithWaafi(
  user: AuthUser,
  courseId: string,
  input: { phone?: string; coupon_code?: string }
) {
  const { course, amount, currency, couponId } = await checkoutAmount(courseId, input.coupon_code);
  const existing = await findBestEnrollment(user.user_id, courseId);
  if (existing && hasCourseAccess(existing)) throw Err.alreadyEnrolled();
  if (amount === 0) {
    const free = await createPayment(user, courseId, { coupon_code: input.coupon_code });
    return { ...free, outcome: "approved" as const, course_slug: course.slug, message: "Enrolled" };
  }
  if (!isWaafiPayConfigured()) {
    throw new ApiError(503, "waafipay_not_configured", "WaafiPay is not available right now. Please use manual payment.");
  }
  if (currency.toUpperCase() !== "USD") throw Err.invalidInput("WaafiPay accepts USD only");
  const msisdn = normalizeSomaliMobile(input.phone);
  if (!msisdn) throw Err.invalidInput("enter a valid Somali mobile number (e.g. 61 234 5678)");

  // abuse / double-charge guards
  const t = now();
  const since10 = new Date(t.getTime() - 10 * 60_000);
  const since3 = new Date(t.getTime() - 3 * 60_000);
  const recent = await prisma.payment.findMany({
    where: { userId: user.user_id, provider: "wafi", createdAt: { gte: since10 }, deletedAt: null },
    select: { courseId: true, status: true, createdAt: true },
  });
  if (recent.length >= 5) {
    throw new ApiError(429, "too_many_attempts", "Too many payment attempts. Please wait a few minutes.");
  }
  if (recent.some((r) => r.courseId === courseId && r.status === "pending" && r.createdAt && r.createdAt >= since3)) {
    throw Err.conflict(
      "payment_in_progress",
      "A payment for this course is already waiting for your PIN. Check your phone or try again in a few minutes."
    );
  }

  const row = await prisma.payment.create({
    data: {
      id: newId(),
      userId: user.user_id,
      courseId,
      amount: fromMinor(amount),
      currency,
      status: "pending",
      provider: "wafi",
      couponId,
      providerRefId: msisdn,
      idempotencyKey: newId(),
      createdAt: t,
      updatedAt: t,
    },
  });

  const outcome = await waafiPurchase({
    msisdn,
    amountMinor: amount,
    currency,
    referenceId: row.id,
    invoiceId: row.id.replace(/-/g, "").slice(0, 20),
    description: `Laambad course: ${decodeHtmlEntities(course.title)}`,
  });

  const t2 = now();
  if (outcome.kind === "approved") {
    // conditional update: never re-settle a row an admin already touched
    await prisma.payment.updateMany({
      where: { id: row.id, status: "pending" },
      data: { status: "paid", paidAt: t2, transactionId: outcome.transactionId || null, updatedAt: t2 },
    });
    await activateEnrollment(user.user_id, courseId, t2);
    return {
      ...paymentView({ ...row, status: "paid", transactionId: outcome.transactionId }),
      outcome: "approved" as const,
      course_slug: course.slug,
      message: "Payment received. Your course is now open.",
    };
  }
  if (outcome.kind === "declined") {
    await prisma.payment.updateMany({
      where: { id: row.id, status: "pending" },
      data: { status: "failed", refundReason: `waafipay ${outcome.code}: ${outcome.message}`.slice(0, 500), updatedAt: t2 },
    });
    return {
      ...paymentView({ ...row, status: "failed" }),
      outcome: "declined" as const,
      course_slug: course.slug,
      message: outcome.message,
    };
  }
  return {
    ...paymentView(row),
    outcome: "unknown" as const,
    course_slug: course.slug,
    message:
      "We could not confirm the payment yet. If money was taken from your account, the course will be opened after we verify it.",
  };
}

/** Admin: approve a pending (or failed) payment after checking the money arrived → access. */
export async function completePayment(paymentId: string, reference?: string) {
  const p = await prisma.payment.findFirst({ where: { id: paymentId, deletedAt: null } });
  if (!p) throw Err.notFound("payment not found");
  if (PAYMENT_DONE.includes(p.status)) return { ok: true, already: true };
  if (p.status === "refunded") throw Err.conflict("payment_refunded", "this payment was refunded");
  const t = now();
  const ref = (reference ?? "").replace(/[^\w\-./ #]/g, "").trim().slice(0, 64);
  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "paid", paidAt: t, updatedAt: t, ...(ref ? { transactionId: ref } : {}) },
  });
  // G11: migrated guest-checkout payments have no user; there is nobody to enroll.
  if (!p.userId) return { ok: true, enrolled: false };
  await activateEnrollment(p.userId, p.courseId, t);
  return { ok: true };
}

/** Admin: reject a pending payment request (money not received). Does not touch existing access. */
export async function rejectPayment(paymentId: string, reason?: string) {
  const p = await prisma.payment.findFirst({ where: { id: paymentId, deletedAt: null } });
  if (!p) throw Err.notFound("payment not found");
  if (p.status !== "pending") throw Err.conflict("not_pending", "only pending payments can be rejected");
  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "failed", refundReason: (reason || "rejected by admin").slice(0, 500), updatedAt: now() },
  });
  return { ok: true };
}

export async function refundPayment(paymentId: string, reason?: string) {
  const p = await prisma.payment.findFirst({ where: { id: paymentId, deletedAt: null } });
  if (!p) throw Err.notFound("payment not found");
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: "refunded",
      refundedAt: now(),
      refundReason: reason || null,
      updatedAt: now(),
    },
  });
  return { ok: true };
}

export async function listMyPayments(userId: string) {
  const rows = await prisma.payment.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { course: { select: { title: true, slug: true } } },
  });
  return ser(
    rows.map((p) => ({
      id: p.id,
      user_id: p.userId,
      course_id: p.courseId,
      course_title: p.course ? decodeHtmlEntities(p.course.title) : undefined,
      course_slug: p.course?.slug,
      amount: toMinor(p.amount),
      payer_phone: p.providerRefId && /^252\d{9}$/.test(p.providerRefId) ? maskMobile(p.providerRefId) : undefined,
      note: p.status === "failed" ? p.refundReason ?? undefined : undefined,
      currency: p.currency,
      status: p.status,
      provider: p.provider,
      transaction_id: p.transactionId ?? undefined,
      paid_at: p.paidAt?.toISOString() ?? null,
      refunded_at: p.refundedAt?.toISOString() ?? null,
      created_at: p.createdAt?.toISOString(),
    }))
  );
}

export async function adminListPayments(page = 1, pageSize = 20) {
  const take = Math.min(Math.max(pageSize, 1), 100);
  const skip = (Math.max(page, 1) - 1) * take;
  const where = { deletedAt: null };
  const [total, rows] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        course: { select: { id: true, title: true, slug: true } },
      },
    }),
  ]);
  return {
    data: ser(
      rows.map((p) => ({
        id: p.id,
        user_id: p.userId,
        course_id: p.courseId,
        course_title: p.course ? decodeHtmlEntities(p.course.title) : undefined,
        course_slug: p.course?.slug,
        student_name: p.user?.name ?? (p.userId ? undefined : "Guest checkout"),
        student_email: p.user?.email ?? undefined,
        transaction_id: p.transactionId ?? undefined,
        // payer / sender wallet number (WaafiPay or manual EVC request): admin sees it in full
        payer_phone: p.providerRefId && /^252\d{9}$/.test(p.providerRefId) ? `+${p.providerRefId}` : undefined,
        note: p.status === "failed" ? p.refundReason ?? undefined : undefined,
        paid_at: p.paidAt?.toISOString() ?? null,
        refunded_at: p.refundedAt?.toISOString() ?? null,
        amount: toMinor(p.amount),
        currency: p.currency,
        status: p.status,
        provider: p.provider,
        // G11: guest checkout (no account) — the UI must tolerate a null user
        user: p.user ?? null,
        is_guest: !p.userId,
        course: p.course,
        created_at: p.createdAt?.toISOString(),
      }))
    ),
    total,
    page: Math.max(page, 1),
  };
}

export async function approveOfflineEnrollment(enrollmentId: string) {
  const e = await prisma.enrollment.findFirst({ where: { id: enrollmentId, deletedAt: null } });
  if (!e) throw Err.notFound("enrollment not found");
  const t = now();
  await prisma.enrollment.update({
    where: { id: enrollmentId },
    data: { paymentStatus: "paid", status: "active", updatedAt: t },
  });
  await prisma.payment.create({
    data: {
      id: newId(),
      userId: e.userId,
      courseId: e.courseId,
      amount: fromMinor(0),
      currency: "USD",
      status: "paid",
      provider: "offline",
      paidAt: t,
      createdAt: t,
      updatedAt: t,
    },
  });
  return { ok: true };
}

// ── Coupons ──
export async function listCoupons() {
  const rows = await prisma.coupon.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return ser(
    rows.map((c) => ({
      id: c.id,
      code: c.code,
      discount_type: c.discountType,
      discount_percent: c.discountPercent == null ? null : Number(c.discountPercent),
      /** fixed-amount coupons, in cents */
      discount_amount: toMinorOrNull(c.discountAmount),
      expires_at: c.expiresAt?.toISOString() ?? null,
      usage_limit: c.usageLimit == null ? null : Number(c.usageLimit),
      usage_count: Number(c.usageCount),
      is_active: c.isActive,
    }))
  );
}

export async function createCoupon(input: {
  code: string;
  discount_percent: number;
  expires_at?: string | null;
  usage_limit?: number | null;
}) {
  const t = now();
  const row = await prisma.coupon.create({
    data: {
      id: newId(),
      code: input.code.trim().toUpperCase(),
      discountType: "percent",
      discountPercent: input.discount_percent,
      expiresAt: input.expires_at ? new Date(input.expires_at) : null,
      usageLimit: input.usage_limit == null ? null : BigInt(input.usage_limit),
      isActive: true,
      createdAt: t,
      updatedAt: t,
    },
  });
  return ser({
    id: row.id,
    code: row.code,
    discount_percent: Number(row.discountPercent),
  });
}

// ── Reviews ──
export async function listReviews(courseId: string) {
  // only approved reviews are public (as on WordPress; 18 migrated reviews are unapproved)
  const rows = await prisma.courseReview.findMany({
    where: { courseId, deletedAt: null, isApproved: true },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" },
  });
  return ser(
    rows.map((r) => ({
      id: r.id,
      user_id: r.userId,
      course_id: r.courseId,
      rating: Number(r.rating),
      comment: r.comment,
      user: {
        id: r.user.id,
        name: r.user.name,
        avatar_url: r.user.avatarUrl,
      },
      created_at: r.createdAt?.toISOString(),
    }))
  );
}

export async function reviewStats(courseId: string) {
  const rows = await prisma.courseReview.findMany({
    where: { courseId, deletedAt: null, isApproved: true },
    select: { rating: true },
  });
  const count = rows.length;
  const avg = count
    ? rows.reduce((s, r) => s + Number(r.rating), 0) / count
    : 0;
  return { average: avg, count };
}

export async function createReview(
  user: AuthUser,
  courseId: string,
  input: { rating: number; comment?: string }
) {
  if (input.rating < 1 || input.rating > 5) throw Err.invalidInput("rating 1-5");
  const t = now();
  const row = await prisma.courseReview.create({
    data: {
      id: newId(),
      userId: user.user_id,
      courseId,
      rating: BigInt(input.rating),
      comment: input.comment || null,
      createdAt: t,
      updatedAt: t,
    },
  });
  return ser({
    id: row.id,
    rating: Number(row.rating),
    comment: row.comment,
  });
}

export async function updateReview(
  user: AuthUser,
  id: string,
  input: { rating?: number; comment?: string }
) {
  const r = await prisma.courseReview.findFirst({ where: { id, deletedAt: null } });
  if (!r) throw Err.notFound("review not found");
  if (r.userId !== user.user_id && user.role !== "admin") throw Err.forbidden();
  await prisma.courseReview.update({
    where: { id },
    data: {
      rating: input.rating === undefined ? undefined : BigInt(input.rating),
      comment: input.comment,
      updatedAt: now(),
    },
  });
  return { ok: true };
}

export async function deleteReview(user: AuthUser, id: string) {
  const r = await prisma.courseReview.findFirst({ where: { id, deletedAt: null } });
  if (!r) throw Err.notFound("review not found");
  if (r.userId !== user.user_id && user.role !== "admin") throw Err.forbidden();
  await prisma.courseReview.update({
    where: { id },
    data: { deletedAt: now(), updatedAt: now() },
  });
}

// ── Lesson Q&A ──
export async function listLessonQuestions(lessonId: string) {
  // G9: migrated Tutor Q&A threads are course-level (lesson_id null, course_id set), so a lesson page
  // shows its own questions plus the course-level ones of the same course.
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId },
    select: { section: { select: { courseId: true } } },
  });
  const courseId = lesson?.section.courseId;
  const rows = await prisma.lessonQuestion.findMany({
    where: {
      deletedAt: null,
      OR: [{ lessonId }, ...(courseId ? [{ lessonId: null, courseId }] : [])],
    },
    include: {
      author: { select: { id: true, name: true } },
      answerer: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return ser(
    rows.map((q) => ({
      id: q.id,
      lesson_id: q.lessonId,
      course_id: q.courseId,
      is_course_level: q.lessonId == null,
      body: q.body,
      // field names used by the lesson Q&A panel (LessonQuestion in services/api/lesson-qa.ts)
      author_name: q.author?.name ?? "Student",
      answer: q.answerBody,
      answerer_name: q.answerer?.name ?? null,
      answered_at: q.answeredAt?.toISOString() ?? null,
      created_at: q.createdAt?.toISOString(),
    }))
  );
}

export async function createLessonQuestion(
  user: AuthUser,
  lessonId: string,
  body: string
) {
  const t = now();
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, deletedAt: null },
    select: { section: { select: { courseId: true } } },
  });
  if (!lesson) throw Err.notFound("lesson not found");
  const text = (body ?? "").trim();
  if (!text) throw Err.invalidInput("question required");
  // students must have access to the course; staff may always post
  if (user.role !== "admin" && user.role !== "instructor") {
    const e = await findBestEnrollment(user.user_id, lesson.section.courseId);
    if (!e || !hasCourseAccess(e)) throw Err.forbidden();
  }
  const row = await prisma.lessonQuestion.create({
    data: {
      id: newId(),
      lessonId,
      courseId: lesson.section.courseId,
      authorId: user.user_id,
      body: text,
      createdAt: t,
      updatedAt: t,
    },
  });
  return ser({ id: row.id, body: row.body, lesson_id: row.lessonId });
}

export async function answerLessonQuestion(
  user: AuthUser,
  questionId: string,
  answerBody: string
) {
  const text = (answerBody ?? "").trim();
  if (!text) throw Err.invalidInput("answer required");
  const q = await prisma.lessonQuestion.findFirst({
    where: { id: questionId, deletedAt: null },
    select: { courseId: true, lesson: { select: { section: { select: { course: { select: { instructorId: true } } } } } } },
  });
  if (!q) throw Err.notFound("question not found");
  // only an admin or the course's instructor may publish an answer
  let instructorId = q.lesson?.section.course.instructorId ?? null;
  if (!instructorId && q.courseId) {
    instructorId = (await prisma.course.findFirst({ where: { id: q.courseId }, select: { instructorId: true } }))?.instructorId ?? null;
  }
  if (user.role !== "admin" && instructorId !== user.user_id) throw Err.forbidden();
  await prisma.lessonQuestion.update({
    where: { id: questionId },
    data: {
      answerBody: text,
      answererId: user.user_id,
      answeredAt: now(),
      updatedAt: now(),
    },
  });
  return { ok: true };
}

// ── Files ──
export async function uploadFile(user: AuthUser, file: File) {
  const buf = Buffer.from(await file.arrayBuffer());
  const saved = await savePublicUpload(
    "files",
    file.name,
    buf,
    file.type || "application/octet-stream"
  );
  const t = now();
  const id = newId();
  await prisma.uploadedFile.create({
    data: {
      id,
      userId: user.user_id,
      storageDriver: "local",
      storageKey: saved.storageKey,
      originalName: file.name,
      contentType: file.type || "application/octet-stream",
      size: BigInt(file.size),
      createdAt: t,
      updatedAt: t,
    },
  });
  return { id, url: saved.url, storage_key: saved.storageKey };
}

export async function getFile(id: string) {
  const f = await prisma.uploadedFile.findFirst({ where: { id, deletedAt: null } });
  if (!f) throw Err.notFound("file not found");
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  const url = f.storageKey.startsWith("http")
    ? f.storageKey
    : `${base}/${f.storageKey.replace(/^\//, "")}`;
  return { id: f.id, url, content_type: f.contentType };
}

// ── Audit ──
export async function listAuditLogs(page = 1, pageSize = 50) {
  const take = Math.min(Math.max(pageSize, 1), 100);
  const skip = (Math.max(page, 1) - 1) * take;
  const [total, rows] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.findMany({
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    data: ser(
      rows.map((a) => ({
        id: a.id,
        method: a.method,
        path: a.path,
        status_code: Number(a.statusCode),
        user_id: a.userId,
        role_slug: a.roleSlug,
        created_at: a.createdAt?.toISOString(),
      }))
    ),
    total,
    page: Math.max(page, 1),
  };
}
