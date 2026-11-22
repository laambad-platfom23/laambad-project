"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

function RedirectToCleanCheckout() {
  const sp = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const q = sp.toString();
    router.replace(`/checkout${q ? `?${q}` : ""}`);
  }, [sp, router]);
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <Skeleton className="h-10 w-56 rounded-lg" />
      <p className="text-sm text-muted-foreground">Opening checkout…</p>
    </div>
  );
}

/** Legacy URL: `/dashboard/checkout` → full-page `/checkout` (no sidebar). */
export default function DashboardCheckoutRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Skeleton className="h-10 w-56 rounded-lg" />
        </div>
      }
    >
      <RedirectToCleanCheckout />
    </Suspense>
  );
}
