"use client";

import { Suspense } from "react";
import { AdminLoginForm } from "@/components/auth/admin-login-form";

/** Instructor sign-in — reached from the "Be Instructor" button in the header. */
export default function InstructorLoginRoute() {
  return (
    <Suspense fallback={<div className="flex min-h-svh items-center justify-center">Loading…</div>}>
      <AdminLoginForm audience="instructor" />
    </Suspense>
  );
}
