"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/** Course details moved to /courses/[slug] (Udemy-style, outside dashboard). */
export default function LegacyCourseRedirect() {
  const params = useParams();
  const router = useRouter();
  const slug = typeof params.slug === "string" ? params.slug : "";

  useEffect(() => {
    if (slug) {
      router.replace(`/courses/${encodeURIComponent(slug)}`);
    }
  }, [slug, router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      Opening course…
    </div>
  );
}
