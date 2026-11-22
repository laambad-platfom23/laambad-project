"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "@/services/api/dashboard";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth-store";
import {
  EnrolledCourseCard,
  EnrolledCourseCardSkeleton,
} from "@/components/dashboard/enrolled-course-card";
import { BookOpen } from "lucide-react";

export default function MyCoursesPage() {
  const userId = useAuthStore((s) => s.user?.id ?? "");
  const { data: overview, isLoading } = useQuery({
    queryKey: ["dashboard-overview", userId],
    queryFn: async () => {
      const res = await dashboardApi.overview();
      return res.data;
    },
    enabled: !!userId,
  });

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 shadow-sm md:p-8">
          <div className="h-9 w-48 max-w-full animate-pulse rounded-lg bg-muted md:h-10 md:w-64" />
          <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-muted/80" />
        </div>
        <div>
          <div className="mb-4 h-6 w-32 animate-pulse rounded bg-muted" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3].map((i) => (
              <EnrolledCourseCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 shadow-sm md:p-8">
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/10 hidden"
          aria-hidden
        />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            Your learning
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">My courses</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Open a course to continue lessons. Cover images match what you set on the course (first image in the
            description).
          </p>
        </div>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Enrolled</h2>
        {!overview?.courses?.length ? (
          <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 py-20 text-center">
            <BookOpen className="mx-auto h-14 w-14 text-muted-foreground/35" />
            <h3 className="mt-4 text-lg font-semibold">No enrollments yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Explore published courses and enroll to see them here.
            </p>
            <Button asChild className="mt-6" size="sm">
              <Link href="/courses">Browse catalog</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {overview.courses.map((course) => (
              <EnrolledCourseCard key={course.course_id} course={course} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
