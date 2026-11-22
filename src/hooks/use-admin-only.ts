"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { isAdminUser } from "@/lib/auth-routing";

/**
 * Non-admins are redirected away from administrator-only routes
 * (users, institute-wide enrollments/payments, coupons, audit).
 */
export function useAdminOnlyPage(redirectTo = "/dashboard") {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const admin = isAdminUser(user);

  useEffect(() => {
    if (!user) return;
    if (!admin) {
      router.replace(redirectTo);
    }
  }, [user, admin, router, redirectTo]);

  const ready = Boolean(user) && admin;
  return { user, admin, ready };
}
