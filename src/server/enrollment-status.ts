import { prisma } from "@/lib/db";

/**
 * G3 — enrollment status mapping.
 * Migrated data (Tutor/WooCommerce): status active | cancelled | pending | on_hold, and "finished" is
 * represented by completed_at being set. payment_status: paid | not_required (free) | pending | cancelled | unknown.
 * The app historically used active | completed | canceled (one L) and payment_status paid | pending | failed.
 * These helpers accept both vocabularies; the database values are never rewritten.
 */
type EnrollmentLike = {
  status: string;
  paymentStatus: string;
  completedAt: Date | null;
};

/** Enrollment statuses that can give course access (before checking payment). */
export const ACCESS_STATUSES = ["active", "completed"];

export function isCancelledStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === "cancelled" || s === "canceled";
}

/** Payment states that grant access: paid, or a free/zero-total order (`not_required`). */
export function isPaymentSettled(paymentStatus: string): boolean {
  const s = paymentStatus.toLowerCase();
  return s === "paid" || s === "not_required" || s === "free";
}

export function hasCourseAccess(e: EnrollmentLike): boolean {
  return ACCESS_STATUSES.includes(e.status.toLowerCase()) && isPaymentSettled(e.paymentStatus);
}

/** Status for the API/UI: completed when finished, `canceled` for both spellings, else as stored. */
export function apiEnrollmentStatus(e: EnrollmentLike): string {
  if (isCancelledStatus(e.status)) return "canceled";
  const s = e.status.toLowerCase();
  if (ACCESS_STATUSES.includes(s) && e.completedAt) return "completed";
  return s;
}

/**
 * Payment status for the API/UI, which only understands paid | pending | failed:
 * `paid` only when the enrollment really grants access (so a paid-but-pending Tutor enrollment
 * does not unlock lessons), `failed` for cancelled payments, otherwise `pending`.
 */
export function apiPaymentStatus(e: EnrollmentLike): string {
  if (hasCourseAccess(e)) return "paid";
  const p = e.paymentStatus.toLowerCase();
  if (p === "cancelled" || p === "canceled" || p === "failed") return "failed";
  return "pending";
}

/** Raw stored values, for admin screens that show the migrated detail. */
export function sourceStatuses(e: EnrollmentLike & { sourceStatus?: string | null }) {
  return { source_status: e.sourceStatus ?? e.status, source_payment_status: e.paymentStatus };
}

/**
 * The user's best enrollment for a course. WordPress created one enrollment per order, so a user can
 * have several rows for the same course: prefer one that grants access, then the most recent.
 */
export async function findBestEnrollment(userId: string, courseId: string) {
  const rows = await prisma.enrollment.findMany({
    where: { userId, courseId, deletedAt: null },
    orderBy: { enrolledAt: "desc" },
  });
  return (
    rows.find((e) => hasCourseAccess(e)) ??
    rows.find((e) => ACCESS_STATUSES.includes(e.status.toLowerCase())) ??
    rows[0] ??
    null
  );
}
