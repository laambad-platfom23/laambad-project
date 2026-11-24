"use client";

import { useQuery } from "@tanstack/react-query";
import { Video } from "lucide-react";
import { liveApi } from "@/services/api/course-features";
import { SessionRow } from "@/components/learning/session-row";

/** A5: upcoming live sessions of the course, on the learn page (hidden when there are none). */
export function CourseLiveSessions({ courseId }: { courseId: string }) {
  const { data } = useQuery({
    queryKey: ["course-live", courseId],
    queryFn: () => liveApi.forCourse(courseId).then((r) => r.data.data),
    refetchInterval: 60_000,
    retry: false,
  });
  const upcoming = (data ?? []).filter((s) => !s.is_past);
  if (!upcoming.length) return null;
  return (
    <div className="mt-3 shrink-0 overflow-hidden rounded-2xl border bg-card">
      <p className="flex items-center gap-2 border-b px-4 py-2.5 text-sm font-semibold">
        <Video className="h-4 w-4 text-brand" /> Live sessions
      </p>
      <div className="divide-y">
        {upcoming.slice(0, 3).map((s) => (
          <SessionRow key={s.id} s={s} />
        ))}
      </div>
    </div>
  );
}
