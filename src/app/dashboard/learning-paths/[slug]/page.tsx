"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Circle, PlayCircle, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { learningPathsApi } from "@/services/api/student-features";
import { cn } from "@/lib/utils";

/** A2: one learning path with the student's progress through its courses. */
export default function LearningPathPage() {
  const params = useParams();
  const slug = typeof params.slug === "string" ? decodeURIComponent(params.slug) : "";
  const { data: p, isLoading, isError } = useQuery({
    queryKey: ["learning-path", slug],
    queryFn: () => learningPathsApi.get(slug).then((r) => r.data),
    enabled: !!slug,
    retry: false,
  });

  if (isLoading) return <Skeleton className="h-96 rounded-xl" />;
  if (isError || !p) {
    return (
      <div className="py-16 text-center">
        <p className="font-semibold">Learning path not found</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/dashboard/learning-paths">All learning paths</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/dashboard/learning-paths" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Learning paths
      </Link>
      <div className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Route className="h-7 w-7 shrink-0 text-primary" /> {p.title}
        </h1>
        {p.description ? <p className="whitespace-pre-wrap text-muted-foreground">{p.description}</p> : null}
        {p.progress_percent !== undefined && p.course_count > 0 ? (
          <div className="max-w-md space-y-1 pt-2">
            <div className="flex justify-between text-sm">
              <span>
                {p.finished_courses}/{p.course_count} courses finished
              </span>
              <span className="font-semibold">{p.progress_percent}%</span>
            </div>
            <Progress value={p.progress_percent} className="h-2.5" />
          </div>
        ) : null}
      </div>

      <ol className="relative space-y-4 border-l-2 border-muted pl-6">
        {p.courses.map((c, i) => {
          const isNext = p.next_course_slug === c.slug;
          return (
            <li key={c.id} className="relative">
              <span className="absolute -left-[33px] top-4 flex h-6 w-6 items-center justify-center rounded-full bg-background">
                {c.finished ? (
                  <CheckCircle2 className="h-6 w-6 text-success" />
                ) : isNext ? (
                  <PlayCircle className="h-6 w-6 text-brand" />
                ) : (
                  <Circle className="h-6 w-6 text-muted-foreground/50" />
                )}
              </span>
              <Card className={cn(isNext && "border-brand/50 shadow-md")}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  {c.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.cover_url} alt="" className="h-20 w-full rounded-lg object-cover sm:w-32" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step {i + 1}</p>
                    <p className="font-semibold">{c.title}</p>
                    {c.instructor_name ? <p className="text-xs text-muted-foreground">{c.instructor_name}</p> : null}
                    {c.enrolled && c.lessons_total ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.lessons_done}/{c.lessons_total} lessons
                      </p>
                    ) : null}
                  </div>
                  <Button asChild size="sm" variant={isNext ? "default" : "outline"} className="shrink-0">
                    <Link href={c.enrolled ? `/learn/${encodeURIComponent(c.slug)}` : `/courses/${encodeURIComponent(c.slug)}`}>
                      {c.finished ? "Review" : c.enrolled ? "Continue" : "View course"}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
