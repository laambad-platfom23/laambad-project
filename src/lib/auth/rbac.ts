import type { AuthUser } from "./request";
import { Err } from "@/lib/api/errors";

export function hasRole(user: AuthUser, ...roles: string[]) {
  return roles.includes(user.role);
}

export function hasAllPerms(user: AuthUser, ...perms: string[]) {
  return perms.every((p) => user.perms.includes(p));
}

export function hasAnyPerm(user: AuthUser, ...perms: string[]) {
  return perms.some((p) => user.perms.includes(p));
}

export function assertRole(user: AuthUser, ...roles: string[]) {
  if (!hasRole(user, ...roles)) throw Err.forbidden();
}

export function assertPerms(user: AuthUser, ...perms: string[]) {
  if (!hasAllPerms(user, ...perms)) throw Err.forbidden();
}
