"use client";

import { Suspense } from "react";
import { AdminLoginForm } from "@/components/auth/admin-login-form";

/** Administrator sign-in — reachable only by visiting /admin directly (no public link). */
export default function AdminLoginRoute() {
  return (
    <Suspense fallback={<div className="flex min-h-svh items-center justify-center">Loading…</div>}>
      <AdminLoginForm audience="admin" />
    </Suspense>
  );
}
