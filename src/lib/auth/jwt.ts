import { SignJWT, jwtVerify } from "jose";

function parseDuration(raw: string | undefined, fallbackMs: number): number {
  if (!raw) return fallbackMs;
  const m = raw.trim().match(/^(\d+)(ms|s|m|h|d)?$/i);
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  const unit = (m[2] || "s").toLowerCase();
  const mult =
    unit === "ms" ? 1 : unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return n * mult;
}

function secretKey(kind: "access" | "refresh") {
  const access = process.env.JWT_SECRET || "development-only-replace-with-openssl-rand-base64-48";
  const refresh = process.env.JWT_REFRESH_SECRET || access;
  return new TextEncoder().encode(kind === "access" ? access : refresh);
}

export function accessTTLMs() {
  return parseDuration(process.env.JWT_ACCESS_EXPIRY, 15 * 60_000);
}

export function refreshTTLMs() {
  return parseDuration(process.env.JWT_REFRESH_EXPIRY, 168 * 3_600_000);
}

export function issuer() {
  return process.env.JWT_ISSUER || "sodemy-backend";
}

export type AccessClaims = {
  user_id: string;
  role: string;
  perms: string[];
  typ: string;
  sub: string;
};

export async function signAccess(userId: string, roleSlug: string, permissions: string[]) {
  const expMs = accessTTLMs();
  const expiresAt = new Date(Date.now() + expMs);
  const token = await new SignJWT({
    user_id: userId,
    role: roleSlug,
    perms: permissions,
    typ: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer())
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secretKey("access"));
  return { token, expiresAt, expiresIn: Math.floor(expMs / 1000) };
}

export async function parseAccess(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, secretKey("access"), { issuer: issuer() });
  if (payload.typ !== "access") throw new Error("not an access token");
  return {
    user_id: String(payload.user_id || payload.sub),
    role: String(payload.role || ""),
    perms: Array.isArray(payload.perms) ? (payload.perms as string[]) : [],
    typ: "access",
    sub: String(payload.sub),
  };
}

export async function signRefresh(userId: string, jti: string) {
  const expMs = refreshTTLMs();
  const expiresAt = new Date(Date.now() + expMs);
  const token = await new SignJWT({ typ: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer())
    .setSubject(userId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secretKey("refresh"));
  return { token, expiresAt };
}

export async function parseRefresh(token: string): Promise<{ userId: string; jti: string }> {
  const { payload } = await jwtVerify(token, secretKey("refresh"), { issuer: issuer() });
  if (payload.typ !== "refresh") throw new Error("not a refresh token");
  if (!payload.jti || !payload.sub) throw new Error("invalid refresh token");
  return { userId: String(payload.sub), jti: String(payload.jti) };
}
