import { Prisma } from "@prisma/client";
import legacyPrices from "@/server/data/legacy-course-prices.json";
import { isZero } from "@/server/money";

/**
 * Data gap G2 (display fallback): the first migration loaded every course_pricing.price as 0 because
 * WordPress kept the real price on the linked WooCommerce product (`_regular_price` / `_sale_price`).
 * The map (course id → product price in cents) was read from the site's SQL backup.
 *
 * The real fix is in the loader (04-courses now reads the product price). This fallback applies only while
 * a database row still says 0 for a non-free course (e.g. the frozen `migration-rehearsal` branch), and it
 * switches itself off once the row is corrected. Nothing is written.
 */
type LegacyPrice = {
  wp_course_id: number;
  wc_product_id: number;
  regular_cents: number;
  sale_cents: number | null;
  /** WooCommerce stores sale dates as unix seconds. */
  sale_from: string | null;
  sale_to: string | null;
};

const PRICES = legacyPrices as Record<string, LegacyPrice>;

function saleActive(p: LegacyPrice, at = Date.now()): boolean {
  if (p.sale_cents == null || p.sale_cents >= p.regular_cents) return false;
  const from = p.sale_from ? Number(p.sale_from) * 1000 : null;
  const to = p.sale_to ? Number(p.sale_to) * 1000 : null;
  if (from != null && Number.isFinite(from) && at < from) return false;
  if (to != null && Number.isFinite(to) && at > to) return false;
  return true;
}

type PricingRow = {
  courseId: string;
  price: Prisma.Decimal;
  isFree: boolean;
  discountPrice: Prisma.Decimal | null;
};

/** Returns the row with the WooCommerce price (Decimal dollars) filled in when the migrated row has price 0. */
export function withLegacyPrice<T extends PricingRow>(row: T | null): T | null {
  if (!row || row.isFree || !isZero(row.price)) return row;
  const p = PRICES[row.courseId];
  if (!p) return row;
  return {
    ...row,
    price: new Prisma.Decimal(p.regular_cents).div(100),
    discountPrice: saleActive(p) ? new Prisma.Decimal(p.sale_cents!).div(100) : row.discountPrice,
  };
}
