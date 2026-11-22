/**
 * Role slugs from GET /api/v1/me (`user` = learner / student).
 * Staff see the institute overview; learners land on My Learning.
 *
 * We also treat `users.write` as staff-only (Administrator in RBAC seed) when `role`
 * is missing or stale in the client — fixes admin being sent to the learner shell.
 */

export type AuthLikeUser = {
  role?: string | null;
  role_slug?: string | null;
  permissions?: string[] | null;
} | null | undefined;

function roleSlugOf(user: AuthLikeUser): string {
  return (user?.role ?? user?.role_slug ?? "").trim().toLowerCase();
}

export function hasPermission(user: AuthLikeUser, key: string): boolean {
  return Boolean(user?.permissions?.includes(key));
}

export function isAdminUser(user: AuthLikeUser): boolean {
  if (!user) return false;
  if (roleSlugOf(user) === "admin") return true;
  // Seeded Administrator always has users.write
  return hasPermission(user, "users.write");
}

export function isInstructorUser(user: AuthLikeUser): boolean {
  return roleSlugOf(user) === "instructor";
}

export function isStaffRole(
  role: string | undefined | null,
  permissions?: string[] | null
): boolean {
  const r = (role ?? "").trim().toLowerCase();
  if (r === "admin" || r === "instructor") return true;
  if (permissions?.includes("users.write")) return true;
  return false;
}

export function isStaffUser(user: AuthLikeUser): boolean {
  if (!user) return false;
  return isStaffRole(user.role ?? user.role_slug, user.permissions);
}

export function defaultDashboardPath(
  role: string | undefined | null,
  permissions?: string[] | null
): string {
  return isStaffRole(role, permissions) ? "/dashboard" : "/dashboard/my-learning";
}

export function defaultDashboardPathForUser(user: AuthLikeUser): string {
  return isStaffUser(user) ? "/dashboard" : "/dashboard/my-learning";
}
