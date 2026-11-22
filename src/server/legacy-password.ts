import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * G4 — verify migrated WordPress password hashes (ported from the R6-tested
 * D:\Laambad-Migration\phase3\tooling\src\auth\legacy-verify.mjs; same test vectors).
 * Mirrors WordPress 6.8 wp_check_password(): the typed password is NOT trimmed.
 *  - phpass portable ($P$ / $H$): iterated MD5 with WordPress' custom base64.
 *  - WordPress 6.8 "$wp" prefix + bcrypt( base64( HMAC-SHA384(key "wp-sha384", password) ) ).
 * Never throws on malformed input: returns false.
 */
export type LegacyScheme = "phpass" | "wordpress_wp_bcrypt";

const ITOA64 = "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function encode64(input: Buffer, count: number): string {
  let out = "";
  let i = 0;
  do {
    let value = input[i++];
    out += ITOA64[value & 0x3f];
    if (i < count) value |= input[i] << 8;
    out += ITOA64[(value >> 6) & 0x3f];
    if (i++ >= count) break;
    if (i < count) value |= input[i] << 16;
    out += ITOA64[(value >> 12) & 0x3f];
    if (i++ >= count) break;
    out += ITOA64[(value >> 18) & 0x3f];
  } while (i < count);
  return out;
}

export function phpassCheck(password: string, stored: string | null | undefined): boolean {
  if (typeof stored !== "string" || stored.length !== 34 || !/^\$[PH]\$/.test(stored)) return false;
  const log2 = ITOA64.indexOf(stored[3]);
  if (log2 < 7 || log2 > 30) return false;
  const salt = stored.slice(4, 12);
  if (salt.length !== 8) return false;
  const pw = Buffer.from(password, "utf8");
  let hash = createHash("md5").update(Buffer.concat([Buffer.from(salt, "latin1"), pw])).digest();
  for (let n = 1 << log2; n > 0; n--) hash = createHash("md5").update(Buffer.concat([hash, pw])).digest();
  const calc = Buffer.from(stored.slice(0, 12) + encode64(hash, 16), "latin1");
  const want = Buffer.from(stored, "latin1");
  return calc.length === want.length && timingSafeEqual(calc, want);
}

export function wpBcryptCheck(password: string, stored: string | null | undefined): boolean {
  if (typeof stored !== "string" || !/^\$wp\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(stored)) return false;
  const pre = createHmac("sha384", "wp-sha384").update(Buffer.from(password, "utf8")).digest("base64");
  try {
    return bcrypt.compareSync(pre, stored.slice(3));
  } catch {
    return false;
  }
}

export function isLegacyScheme(scheme: string | null | undefined): scheme is LegacyScheme {
  return scheme === "phpass" || scheme === "wordpress_wp_bcrypt";
}

/** PHP addslashes(): WordPress adds "magic quotes" to $_POST, and several core paths hash the slashed value. */
function addSlashes(s: string): string {
  return s.replace(/[\\'"\0]/g, (c) => (c === "\0" ? "\\0" : `\\${c}`));
}

/**
 * Candidates tried in order: the password as typed, then the slashed form. Passwords containing
 * ' " or \ were stored by WordPress as hash(addslashes(password)) whenever they were set through
 * $_POST without wp_unslash (profile page, registration plugins), so both forms are valid there.
 */
export function verifyLegacy(password: string, scheme: string, stored: string | null | undefined): boolean {
  if (typeof password !== "string") return false;
  const check = scheme === "phpass" ? phpassCheck : scheme === "wordpress_wp_bcrypt" ? wpBcryptCheck : null;
  if (!check) return false;
  if (check(password, stored)) return true;
  const slashed = addSlashes(password);
  return slashed !== password && check(slashed, stored);
}
