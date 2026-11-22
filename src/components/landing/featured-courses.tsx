"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronRight, Play, Users } from "lucide-react";
import { coursesApi } from "@/services/api/courses";
import type { Course } from "@/types";
import { courseCoverRawUrl, publicCourseCoverImageUrlFromRaw } from "@/lib/course-cover";
import { useAuthenticatedImageSrc } from "@/hooks/use-authenticated-image-src";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/reveal";
function courseLandingHref(slug: string) {
  return `/courses/${encodeURIComponent(slug)}`;
}

/** Home featured: one row, max 4 courses */
const FEATURED_COURSES_PAGE_SIZE = 4;

/** Placeholder cover bands — brand blues only (no random rainbow) */
export const SOLID_HEADER_FALLBACKS = [
  "bg-[#0B1F3A]",
  "bg-[#0A1830]",
  "bg-[#061528]",
  "bg-[#123252]",
];

export const cardCoverAspect = "aspect-[3/2] min-h-[112px] sm:min-h-[120px]";

/** Catalog grid covers — tall enough to read imagery, still fits 4 columns. */
export const catalogCardCoverClass =
  "relative h-[128px] w-full overflow-hidden sm:h-[136px] lg:h-[132px] xl:h-[140px]";

export function formatCatalogPrice(course: Course): string {
  const p = course.active_pricing;
  if (!p) return "See pricing";
  if (p.is_free) return "Free";
  const minor = p.effective_amount ?? p.price;
  return `${(p.currency || "USD").toUpperCase()} ${(minor / 100).toFixed(2)}`;
}

/**
 * Same cover resolution as dashboard / learn cards: public file URL when possible,
 * JWT blob for /api/v1/files/:id when the public URL fails (wrong API host, etc.).
 */
export function FeaturedCourseCardHeader({
  course,
  index,
  variant = "default",
}: {
  course: Course;
  index: number;
  /** `catalog` — fixed height for multi-column grids so titles & price stay visible above the fold */
  variant?: "default" | "catalog";
}) {
  const coverShell = variant === "catalog" ? catalogCardCoverClass : cn("relative w-full overflow-hidden", cardCoverAspect);
  const raw = courseCoverRawUrl(course);
  const publicUrl = publicCourseCoverImageUrlFromRaw(raw);
  const [publicFetchFailed, setPublicFetchFailed] = useState(false);
  useEffect(() => setPublicFetchFailed(false), [course.id, raw, publicUrl]);

  const hookInput = publicUrl && !publicFetchFailed ? null : raw;
  const { displaySrc, loading, failed } = useAuthenticatedImageSrc(hookInput);
  const src = publicUrl && !publicFetchFailed ? publicUrl : displaySrc;
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [course.id, src, publicFetchFailed]);

  const categoryName = course.category?.name;
  const solid = (
    <div
      className={cn(coverShell, SOLID_HEADER_FALLBACKS[index % SOLID_HEADER_FALLBACKS.length])}
    >
      {categoryName ? (
        <span className="absolute left-2 top-2 rounded-md border border-white/25 bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm dark:border-white/40 dark:bg-[#0B1F3A]/90 dark:text-white">
          {categoryName}
        </span>
      ) : null}
    </div>
  );

  if (!raw) {
    return solid;
  }

  if (loading) {
    return <Skeleton className={cn("w-full rounded-none", coverShell)} />;
  }

  if (!src || failed || broken) {
    return solid;
  }

  return (
    <div className={coverShell}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => {
          if (publicUrl && !publicFetchFailed) {
            setPublicFetchFailed(true);
            return;
          }
          setBroken(true);
        }}
      />
      <div className="absolute inset-0 bg-[#0f172a]/45 dark:bg-[#0a1628]/55" />
      {categoryName ? (
        <span className="absolute left-2 top-2 rounded-md border border-white/30 bg-white/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0B1F3A] shadow-sm dark:border-[#FF6B45]/40 dark:bg-[#0B1F3A] dark:text-white">
          {categoryName}
        </span>
      ) : null}
    </div>
  );
}

export function FeaturedCoursesSection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-courses", "featured", FEATURED_COURSES_PAGE_SIZE],
    queryFn: () => coursesApi.publicList(1, FEATURED_COURSES_PAGE_SIZE).then((r) => r.data),
    staleTime: 60 * 1000,
  });

  const courses = (data?.data ?? []).slice(0, FEATURED_COURSES_PAGE_SIZE);
  const publishedTotal = data?.total;
  const viewAllHref = "/courses";

  return (
    <section
      id="courses"
      className={cn(
        "relative overflow-hidden py-16 sm:py-20",
        "border-t border-[#0B1F3A]/10 bg-white",
        "dark:border-white/10 dark:bg-[#030A14]",
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[#0B1F3A]/15 dark:bg-white/20"
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mb-10 flex flex-col gap-4 sm:mb-12 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0B1F3A] dark:text-white/80">
              Catalog
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#0B1F3A] dark:text-white sm:text-3xl">
              Featured courses
            </h2>
            <p className="mt-2 text-base leading-relaxed text-[#0A1830]/90 dark:text-white/90">
              Koorsooyinka ugu dambeeyay ee Laambad
            </p>
            {publishedTotal != null && publishedTotal > 0 ? (
              <p className="mt-2 text-xs leading-relaxed text-[#0A1830]/70 dark:text-white/75">
                Only <strong className="font-semibold text-[#0B1F3A] dark:text-white">published</strong> courses
                appear here ({publishedTotal} in catalog). Draft courses stay in the dashboard until you publish them.
              </p>
            ) : null}
          </div>
          <Link
            href={viewAllHref}
            className="group inline-flex shrink-0 items-center gap-2 self-start rounded-full border-2 border-[#0B1F3A] bg-white px-5 py-2.5 text-sm font-semibold text-[#0B1F3A] shadow-sm transition duration-300 hover:-translate-y-0.5 hover:bg-[#0B1F3A] hover:text-white dark:border-white dark:bg-white dark:text-[#0B1F3A] dark:hover:bg-white/90 sm:self-auto"
          >
            View all
            <ChevronRight className="h-4 w-4 transition duration-300 group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </Reveal>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {Array.from({ length: FEATURED_COURSES_PAGE_SIZE }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border border-[#0B1F3A]/15 bg-white shadow-sm dark:border-white/20 dark:bg-[#061528]"
              >
                <Skeleton className={cn("w-full rounded-none", cardCoverAspect)} />
                <div className="space-y-2.5 p-4 sm:p-5">
                  <Skeleton className="h-4 w-full dark:bg-white/15" />
                  <Skeleton className="h-3 w-2/3 dark:bg-white/15" />
                  <Skeleton className="h-3 w-1/2 dark:bg-white/15" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <p className="rounded-2xl border border-dashed border-[#0B1F3A]/30 bg-white px-4 py-8 text-center text-sm text-[#0B1F3A] dark:border-white/30 dark:bg-[#061528] dark:text-white">
            Could not load courses. Check your connection or try again later.
          </p>
        ) : courses.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#0B1F3A]/25 bg-white py-12 text-center text-[#0A1830] dark:border-white/25 dark:bg-[#061528] dark:text-white/80">
            No published courses yet. Instructors can add courses from the dashboard.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {courses.map((course: Course, index: number) => {
              const lessons = course.lesson_count ?? 0;
              const enrolled = course.enrollment_count ?? 0;
              return (
                <Reveal key={course.id} delay={index * 80}>
                  <Link
                    href={courseLandingHref(course.slug)}
                    className={cn(
                      "group/card relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white shadow-md transition-all duration-300",
                      "border-[#0B1F3A]/15 hover:-translate-y-1.5 hover:border-[#0B1F3A]/40 hover:shadow-xl",
                      "dark:border-white/20 dark:bg-[#061528] dark:hover:border-white/45 dark:hover:bg-[#0B1F3A]",
                    )}
                  >
                    <div className="relative overflow-hidden">
                      <FeaturedCourseCardHeader course={course} index={index} />
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-[#0f172a]/50 opacity-0 transition-all duration-300 group-hover/card:opacity-100">
                        <div className="flex h-11 w-11 scale-90 items-center justify-center rounded-full bg-white text-[#0B1F3A] shadow-lg ring-2 ring-white/60 transition duration-300 group-hover/card:scale-100">
                          <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col border-t border-[#0B1F3A]/10 p-4 sm:p-5 dark:border-white/15">
                      <h3 className="line-clamp-2 min-h-[2.5rem] text-[15px] font-bold leading-snug tracking-tight text-[#0f172a] transition-colors duration-300 group-hover/card:text-[#0B1F3A] dark:text-white dark:group-hover/card:text-white">
                        {course.title}
                      </h3>
                      <p className="mt-1.5 line-clamp-1 text-xs font-medium text-[#64748b] dark:text-white/75">
                        {course.instructor_name || "Instructor"}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-[#0B1F3A]/15 pt-3 text-[11px] font-medium text-[#64748b] dark:border-white/20 dark:text-white/70">
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <Users className="h-3.5 w-3.5 shrink-0 text-[#0B1F3A] dark:text-white" />
                          <span className="truncate">{enrolled.toLocaleString()} enrolled</span>
                        </span>
                        <span className="text-[#cbd5e1] dark:text-white/30" aria-hidden>
                          ·
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <BookOpen className="h-3.5 w-3.5 shrink-0 text-[#0B1F3A] dark:text-white" />
                          {lessons} {lessons === 1 ? "lesson" : "lessons"}
                        </span>
                      </div>
                      <div className="mt-auto pt-4">
                        <span className="inline-flex w-full items-center justify-between rounded-lg bg-[#0B1F3A]/[0.08] px-3 py-2 text-sm font-bold tabular-nums text-[#0B1F3A] transition-colors duration-300 group-hover/card:bg-[#0B1F3A]/[0.14] dark:bg-white/15 dark:text-white">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#0B1F3A]/80 dark:text-white/70">
                            Price
                          </span>
                          {formatCatalogPrice(course)}
                        </span>
                      </div>
                    </div>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
