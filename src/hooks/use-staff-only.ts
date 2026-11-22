"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { isStaffUser } from "@/lib/auth-routing";

/**
 * Learners are redirected away from instructor/admin-only routes.
 * Returns whether the current user may see staff UI (after profile is loaded).
 */
export function useStaffOnlyPage(redirectTo = "/dashboard/my-learning") {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const staff = isStaffUser(user);

  useEffect(() => {
    if (!user) return;
    if (!staff) {
      router.replace(redirectTo);
    }
  }, [user, staff, router, redirectTo]);

  const ready = Boolean(user) && staff;
  return { user, staff, ready };
}
