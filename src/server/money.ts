import { Prisma } from "@prisma/client";

/**
 * G1 — money unit boundary.
 * The migrated database stores money as Decimal(16,2) **dollars** (e.g. 25.00).
 * The app's API contract and UI use integer **minor units** (cents, e.g. 2500) and divide by 100 to show.
 * Every service converts here, so the API and the UI stay unchanged.
 */
export type DecimalLike = Prisma.Decimal | number | string;

/** Decimal dollars → integer cents (half-up rounding, exact for 2-dp values). */
export function toMinor(v: DecimalLike | null | undefined): number {
  if (v == null) return 0;
  return new Prisma.Decimal(v).mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

export function toMinorOrNull(v: DecimalLike | null | undefined): number | null {
  return v == null ? null : toMinor(v);
}

/** Integer cents → Decimal dollars for writing to the database. */
export function fromMinor(minor: number | bigint): Prisma.Decimal {
  const n = typeof minor === "bigint" ? Number(minor) : minor;
  if (!Number.isFinite(n)) throw new Error("invalid money amount");
  return new Prisma.Decimal(Math.round(n)).div(100);
}

export function isZero(v: DecimalLike | null | undefined): boolean {
  return v == null || new Prisma.Decimal(v).isZero();
}
