"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { coursesApi } from "@/services/api/courses";
import { enrollmentsApi } from "@/services/api/enrollments";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { BookOpen, Loader2, Search, Users } from "lucide-react";
import type { Course } from "@/types";
import { getApiErrorMessage } from "@/lib/utils";
import { extractCoverImageUrl, publicCourseCoverImageUrlFromRaw } from "@/lib/course-cover";
import { useAuthenticatedImageSrc } from "@/hooks/use-authenticated-image-src";

function formatPrice(course: Course): string {
  const p = course.active_pricing;
  if (!p) return "—";
  if (p.is_free) return "Free";
  const minor = p.effective_amount ?? p.price;
  return `${(p.currency || "USD").toUpperCase()} ${(minor / 100).toFixed(2)}`;
}

function CatalogCoverBanner({
  description,
  coverUrl,
  isPublished,
}: {
  description: string | undefined;
  coverUrl?: string | null;
  isPublished: boolean;
}) {
  const raw = coverUrl?.trim() || extractCoverImageUrl(description);
  const publicUrl = isPublished ? publicCourseCoverImageUrlFromRaw(raw) : null;
  const { displaySrc, loading, failed } = useAuthenticatedImageSrc(publicUrl ? null : raw);
  const [broken, setBroken] = useState(false);

  const src = publicUrl ?? displaySrc;

  useEffect(() => setBroken(false), [raw, publicUrl]);

  if (!publicUrl && loading && raw) {
    return <Skeleton className="h-36 w-full rounded-none rounded-t-xl" />;
  }
  if (!src || failed || broken) {
    return (
      <div className="flex h-36 items-center justify-center bg-muted/80 text-xs text-muted-foreground">
        No cover
      </div>
    );
  }
  return (
    <div className="relative h-36 w-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setBroken(true)}
      />
      <div className="absolute inset-0 bg-background/75" />
    </div>
  );
}

export default function CatalogPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page] = useState(1);
  const [search, setSearch] = useState("");
  const pageSize = 24;

  const { data, isLoading } = useQuery({
    queryKey: ["catalog-courses", page, pageSize],
    queryFn: () =>
      coursesApi.list(page, pageSize, false, { published_only: true }).then((r) => r.data),
  });

  const courses = data?.data ?? [];
  const filtered = search.trim()
    ? courses.filter((c: Course) => c.title.toLowerCase().includes(search.toLowerCase()))
    : courses;

  const [enrollingId, setEnrollingId] = useState<string | null>(null);

  const enrollMutation = useMutation({
    mutationFn: (courseId: string) => enrollmentsApi.enroll(courseId),
    onMutate: (courseId) => setEnrollingId(courseId),
    onSettled: () => setEnrollingId(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      queryClient.invalidateQueries({ queryKey: ["catalog-courses"] });
      queryClient.invalidateQueries({ queryKey: ["my-courses"] });
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      toast.success("You’re enrolled!");
    },
    onError: (err: unknown, courseId: string) => {
      if (axios.isAxiosError(err) && err.response?.status === 402) {
        toast.message("Payment required — opening checkout");
        router.push(`/checkout?courseId=${courseId}`);
        return;
      }
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        toast.message("Already enrolled in this course");
        router.push("/dashboard/my-learning");
        return;
      }
      const msg = getApiErrorMessage(err, "Could not enroll");
      if (msg.toLowerCase().includes("already")) {
        toast.message("Already enrolled in this course");
        return;
      }
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Browse catalog</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Published courses open for enrollment. After you enroll, they appear under{" "}
          <span className="font-medium text-foreground">My courses</span>.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by title…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-20 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">No published courses match your search.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((course: Course) => {
            const live = course.is_published ?? course.published ?? false;
            const lessons = course.lesson_count ?? 0;
            const enrolled = course.enrollment_count ?? 0;
            const detailHref = `/courses/${encodeURIComponent(course.slug)}`;
            return (
              <Card
                key={course.id}
                className="flex flex-col overflow-hidden border-border/60 transition-all hover:border-primary/20 hover:shadow-lg"
              >
                <Link
                  href={detailHref}
                  className="block outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CatalogCoverBanner description={course.description} coverUrl={course.cover_image_url} isPublished={live} />
                  <CardHeader className="pb-2 pt-4">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="line-clamp-2 text-base leading-snug">{course.title}</CardTitle>
                      {live ? (
                        <Badge variant="secondary" className="shrink-0 text-[10px] font-semibold">
                          Published
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          Draft
                        </Badge>
                      )}
                    </div>
                    {course.instructor_name && (
                      <CardDescription className="line-clamp-1">Instructor: {course.instructor_name}</CardDescription>
                    )}
                    <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {enrolled.toLocaleString()} enrolled
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <BookOpen className="h-3.5 w-3.5" />
                        {lessons} lessons
                      </span>
                      <span className="font-semibold text-foreground">{formatPrice(course)}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="line-clamp-3 text-sm text-muted-foreground">
                      {(course.description || "").replace(/^#{1,6}\s+/gm, "").replace(/!\[[^\]]*\]\([^)]+\)\s*/g, "").slice(0, 160)}
                      {(course.description || "").length > 160 ? "…" : ""}
                    </p>
                  </CardContent>
                </Link>
                <div className="mt-auto border-t border-border/50 px-6 pb-4 pt-3">
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={enrollingId !== null}
                    onClick={(e) => {
                      e.preventDefault();
                      enrollMutation.mutate(course.id);
                    }}
                  >
                    {enrollingId === course.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Enroll
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
