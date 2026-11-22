import { NextRequest } from "next/server";
import { parseAccess, AccessClaims } from "./jwt";
import { Err } from "@/lib/api/errors";

export type AuthUser = AccessClaims;

export async function optionalAuth(req: NextRequest): Promise<AuthUser | null> {
  const header = req.headers.get("authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    return await parseAccess(m[1].trim());
  } catch {
    return null;
  }
}

export async function requireAuth(req: NextRequest): Promise<AuthUser> {
  const user = await optionalAuth(req);
  if (!user) throw Err.unauthorized();
  return user;
}

export function requireRole(user: AuthUser, ...roles: string[]) {
  if (!roles.includes(user.role)) throw Err.forbidden();
}

export function requirePerm(user: AuthUser, ...perms: string[]) {
  const ok = perms.every((p) => user.perms.includes(p));
  if (!ok) throw Err.forbidden();
}

export function requireAnyPerm(user: AuthUser, ...perms: string[]) {
  const ok = perms.some((p) => user.perms.includes(p));
  if (!ok) throw Err.forbidden();
}

export function clientMeta(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "";
  const userAgent = req.headers.get("user-agent") || "";
  return { ip, userAgent };
}
