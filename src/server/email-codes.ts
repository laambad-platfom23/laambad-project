import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma, newId } from "@/lib/db";

/**
 * One-time 6-digit e-mail codes (table email_codes, see prisma/app-sql/A1-email-verification.sql).
 * Raw SQL on purpose: the generated Prisma client predates the table.
 *
 * Security: only HMAC-SHA256(server secret, id:purpose:code) is stored; a code works once, expires,
 * and dies after 5 wrong guesses; a new code cancels the previous ones; max 3 codes per hour and
 * one per minute per user and purpose.
 */
export type CodePurpose = "reset_password" | "verify_email";

const MAX_ATTEMPTS = 5;
const MAX_PER_HOUR = 3;
const COOLDOWN_MS = 60_000;

function secret(): string {
  const s = process.env.EMAIL_CODE_SECRET || process.env.JWT_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("EMAIL_CODE_SECRET / JWT_SECRET missing");
  return `email-code:${s || "development-only-replace-with-openssl-rand-base64-48"}`;
}

function hashCode(id: string, purpose: CodePurpose, code: string): string {
  return createHmac("sha256", secret()).update(`${id}:${purpose}:${code}`).digest("hex");
}

export type IssueResult =
  | { ok: true; code: string; minutes: number }
  | { ok: false; reason: "cooldown" | "rate_limited"; retryAfterSeconds: number };

export async function issueEmailCode(
  userId: string,
  purpose: CodePurpose,
  minutes: number,
  ip?: string
): Promise<IssueResult> {
  const recent = (await prisma.$queryRaw`
    SELECT created_at FROM email_codes
     WHERE user_id = ${userId}::uuid AND purpose = ${purpose} AND created_at > now() - interval '1 hour'
     ORDER BY created_at DESC`) as { created_at: Date }[];
  if (recent.length) {
    const since = Date.now() - new Date(recent[0].created_at).getTime();
    if (since < COOLDOWN_MS) {
      return { ok: false, reason: "cooldown", retryAfterSeconds: Math.ceil((COOLDOWN_MS - since) / 1000) };
    }
  }
  if (recent.length >= MAX_PER_HOUR) {
    const oldest = new Date(recent[recent.length - 1].created_at).getTime();
    return { ok: false, reason: "rate_limited", retryAfterSeconds: Math.max(60, Math.ceil((oldest + 3_600_000 - Date.now()) / 1000)) };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const id = newId();
  await prisma.$transaction([
    // a new code cancels any older open one
    prisma.$executeRaw`UPDATE email_codes SET consumed_at = now()
       WHERE user_id = ${userId}::uuid AND purpose = ${purpose} AND consumed_at IS NULL`,
    prisma.$executeRaw`INSERT INTO email_codes (id, user_id, purpose, code_hash, expires_at, ip)
       VALUES (${id}::uuid, ${userId}::uuid, ${purpose}, ${hashCode(id, purpose, code)},
               now() + make_interval(mins => ${minutes}), ${ip ? ip.slice(0, 255) : null})`,
  ]);
  return { ok: true, code, minutes };
}

/** true once for the right code; wrong guesses count towards the limit. */
export async function consumeEmailCode(userId: string, purpose: CodePurpose, code: string): Promise<boolean> {
  const clean = String(code ?? "").replace(/\D/g, "");
  if (clean.length !== 6) return false;
  const rows = (await prisma.$queryRaw`
    SELECT id, code_hash, attempts FROM email_codes
     WHERE user_id = ${userId}::uuid AND purpose = ${purpose}
       AND consumed_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`) as { id: string; code_hash: string; attempts: number }[];
  const row = rows[0];
  if (!row || row.attempts >= MAX_ATTEMPTS) return false;

  const expected = Buffer.from(row.code_hash, "hex");
  const given = Buffer.from(hashCode(row.id, purpose, clean), "hex");
  const match = expected.length === given.length && timingSafeEqual(expected, given);
  if (!match) {
    await prisma.$executeRaw`UPDATE email_codes SET attempts = attempts + 1 WHERE id = ${row.id}::uuid`;
    return false;
  }
  // conditional: two parallel requests with the same code → only one wins
  const n = await prisma.$executeRaw`UPDATE email_codes SET consumed_at = now()
     WHERE id = ${row.id}::uuid AND consumed_at IS NULL AND attempts < ${MAX_ATTEMPTS}`;
  return n === 1;
}

export async function emailVerifiedAt(userId: string): Promise<Date | null> {
  const rows = (await prisma.$queryRaw`SELECT email_verified_at FROM users WHERE id = ${userId}::uuid`) as {
    email_verified_at: Date | null;
  }[];
  return rows[0]?.email_verified_at ?? null;
}

export async function markEmailVerified(userId: string): Promise<void> {
  await prisma.$executeRaw`UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
     WHERE id = ${userId}::uuid`;
}
