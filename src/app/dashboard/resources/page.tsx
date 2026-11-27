"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, FolderOpen, Paperclip } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { dashboardApi } from "@/services/api/dashboard";
import { courseItemsApi } from "@/services/api/course-items";
import { ResourceFileRow, ResourceLinkRow } from "@/components/learning/item-ui";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";

/** Student → Resources: the files and links of every course they can open, course by course. */
export default function ResourcesPage() {
  const userId = useAuthStore((s) => s.user?.id ?? "");
  const { data: overview, isLoading } = useQuery({
    queryKey: ["dashboard-overview", userId],
    queryFn: () => dashboardApi.overview().then((r) => r.data),
    enabled: !!userId,
  });
  const courses = (overview?.courses ?? []).filter((c) => c.payment_status === "paid");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <FolderOpen className="h-7 w-7 text-primary" /> Resources
        </h1>
        <p className="mt-1 text-muted-foreground">Slides, PDFs, data files and links from your courses. Open a course to see its files.</p>
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : !courses.length ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-sm text-muted-foreground">Enroll in a course to see its resources.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {courses.map((c) => (
            <CourseBlock key={c.course_id} courseId={c.course_id} title={c.course_title} slug={c.course_slug} />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseBlock({ courseId, title, slug }: { courseId: string; title: string; slug: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["course-resources", courseId],
    queryFn: () => courseItemsApi.resources(courseId).then((r) => r.data),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <FolderOpen className="h-5 w-5 shrink-0 text-brand" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{title}</span>
          <span className="text-xs text-muted-foreground">
            {open ? (isLoading ? "Loading…" : `${data?.total ?? 0} ${data?.total === 1 ? "resource" : "resources"}`) : "Show files"}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {open && data ? (
        data.total === 0 ? (
          <p className="border-t px-4 py-4 text-sm text-muted-foreground">This course has no resources yet.</p>
        ) : (
          <div className="space-y-3 border-t p-3">
            {data.course.length || data.course_links.length ? (
              <div className="overflow-hidden rounded-lg border">
                <p className="border-b bg-muted/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Course materials</p>
                <ul className="divide-y">
                  {data.course.map((f) => (
                    <ResourceFileRow key={f.id} f={f} compact />
                  ))}
                  {data.course_links.map((l, i) => (
                    <ResourceLinkRow key={`${l.id ?? l.url}-${i}`} l={l} compact />
                  ))}
                </ul>
              </div>
            ) : null}
            {data.lessons.map((l) => (
              <div key={l.lesson_id} className="overflow-hidden rounded-lg border">
                <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <p className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">{l.lesson_title}</p>
                  <Link
                    href={`/learn/${encodeURIComponent(slug)}?lesson=${l.lesson_id}&tab=resources`}
                    className="shrink-0 text-xs font-semibold text-brand hover:underline"
                  >
                    Go to lesson
                  </Link>
                </div>
                <ul className="divide-y">
                  {l.files.map((f) => (
                    <ResourceFileRow key={f.id} f={f} compact />
                  ))}
                  {l.links.map((x, i) => (
                    <ResourceLinkRow key={`${x.id ?? x.url}-${i}`} l={x} compact />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
