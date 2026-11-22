"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  GraduationCap,
  Play,
  Search,
  SlidersHorizontal,
  Star,
  Users,
  X,
} from "lucide-react";
import { coursesApi } from "@/services/api/courses";
import type { Course } from "@/types";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FeaturedCourseCardHeader,
  formatCatalogPrice,
} from "@/components/landing/featured-courses";

function courseLandingHref(slug: string) {
  return `/courses/${encodeURIComponent(slug)}`;
}

async function fetchAllPublicCourses(): Promise<Course[]> {
  const pageSize = 100;
  let page = 1;
  const all: Course[] = [];
  let total = Infinity;
  while (all.length < total) {
    const r = await coursesApi.publicList(page, pageSize);
    const { data, total: t } = r.data;
    total = t;
    all.push(...data);
    if (data.length < pageSize) break;
    page += 1;
    if (page > 50) break;
  }
  return all;
}

function priceSortKey(c: Course): number {
  const p = c.active_pricing;
  if (!p) return Number.MAX_SAFE_INTEGER;
  if (p.is_free) return 0;
  return p.effective_amount ?? p.price;
}

function matchesPriceFilter(c: Course, f: string): boolean {
  if (f === "all") return true;
  const p = c.active_pricing;
  if (f === "free") return !!p?.is_free;
  if (f === "paid") return !!p && !p.is_free;
  return true;
}

/** Small round instructor photo; falls back to the initial when there is no photo or it fails to load. */
function InstructorFace({ name, src }: { name: string; src?: string | null }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-navy/10 text-[11px] font-bold text-brand-navy ring-2 ring-border dark:bg-white/10 dark:text-white">
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element -- migrated photos of unknown size
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        name.trim().charAt(0).toUpperCase()
      )}
    </span>
  );
}

function matchesSearch(c: Course, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  if (c.title.toLowerCase().includes(s)) return true;
  if (c.instructor_name?.toLowerCase().includes(s)) return true;
  if (c.category?.name.toLowerCase().includes(s)) return true;
  if (c.categories?.some((cat) => cat.name.toLowerCase().includes(s))) return true;
  return false;
}

/** A course belongs to every category it is linked to (not only its primary one). */
function inCategory(c: Course, slug: string): boolean {
  if (c.category?.slug === slug) return true;
  return !!c.categories?.some((cat) => cat.slug === slug);
}

function applySort(list: Course[], sort: string): Course[] {
  const copy = [...list];
  switch (sort) {
    case "title-asc":
      return copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    case "title-desc":
      return copy.sort((a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: "base" }));
    case "price-asc":
      return copy.sort((a, b) => priceSortKey(a) - priceSortKey(b));
    case "price-desc":
      return copy.sort((a, b) => priceSortKey(b) - priceSortKey(a));
    default:
      return copy;
  }
}

export function CoursesCatalogSkeleton() {
  return (
    <div className="min-h-[50vh]">
      <div className="relative overflow-hidden border-b border-white/10 bg-[#0B1F3A] px-4 py-10 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-7xl">
          <Skeleton className="h-4 w-28 rounded bg-white/20" />
          <Skeleton className="mt-4 h-11 max-w-lg rounded-lg bg-white/20" />
          <Skeleton className="mt-3 h-4 max-w-2xl rounded bg-white/12" />
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-5 sm:px-6">
        <Skeleton className="mb-6 h-[4.5rem] w-full rounded-2xl" />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-7">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[380px] rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function CoursesCatalogView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [priceFilter, setPriceFilter] = useState("all");
  const [sort, setSort] = useState("featured");

  /** When the query string changes (links, back/forward, category), sync controlled state. */
  const queryString = searchParams.toString();
  useEffect(() => {
    const p = new URLSearchParams(queryString);
    setSearch(p.get("q") ?? "");
    setCategory(p.get("category") ?? "all");
  }, [queryString]);

  const replaceCategoryInUrl = useCallback(
    (slug: string) => {
      const p = new URLSearchParams(searchParams.toString());
      if (search.trim()) p.set("q", search.trim());
      else p.delete("q");
      if (slug === "all") p.delete("category");
      else p.set("category", slug);
      const qs = p.toString();
      router.replace(qs ? `/courses?${qs}` : "/courses", { scroll: false });
    },
    [router, searchParams, search],
  );

  const { data: courses = [], isLoading, isError, error } = useQuery({
    queryKey: ["public-courses", "catalog-all"],
    queryFn: fetchAllPublicCourses,
    staleTime: 60 * 1000,
  });

  const { data: publicCategories } = useQuery({
    queryKey: ["public-course-categories"],
    queryFn: () => coursesApi.publicCategories().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const categoryOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const cat of publicCategories ?? []) m.set(cat.slug, cat.name);
    for (const c of courses) {
      for (const cat of c.categories ?? []) if (!m.has(cat.slug)) m.set(cat.slug, cat.name);
      if (c.category?.slug && c.category?.name && !m.has(c.category.slug)) {
        m.set(c.category.slug, c.category.name);
      }
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [courses, publicCategories]);

  const filtered = useMemo(() => {
    let list = courses.filter((c) => matchesSearch(c, search));
    if (category !== "all") {
      list = list.filter((c) => inCategory(c, category));
    }
    list = list.filter((c) => matchesPriceFilter(c, priceFilter));
    return applySort(list, sort);
  }, [courses, search, category, priceFilter, sort]);

  const clearFilters = useCallback(() => {
    setSearch("");
    setCategory("all");
    setPriceFilter("all");
    setSort("featured");
    router.replace("/courses", { scroll: false });
  }, [router]);

  const onCategorySelect = useCallback(
    (slug: string) => {
      setCategory(slug);
      replaceCategoryInUrl(slug);
    },
    [replaceCategoryInUrl],
  );

  const hasActiveFilters =
    search.trim() !== "" || category !== "all" || priceFilter !== "all" || sort !== "featured";

  return (
    <div className="min-h-[60vh]">
      {/* Hero — grid texture, glow orbs, balanced layout */}
      <section className="relative overflow-hidden border-b border-white/10 bg-[#0B1F3A] text-white">
        <div
          className="pointer-events-none absolute inset-0 bg-white/[0.03]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-[#E84A27]/15 hidden motion-safe:animate-hero-glow"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-36 left-0 h-80 w-80 rounded-full bg-[#38bdf8]/12 hidden motion-safe:animate-hero-glow"
          style={{ animationDelay: "1.2s" }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-7xl px-4 py-9 sm:px-6 sm:py-11 lg:py-12">
          <div className="lg:grid lg:grid-cols-[1fr_min(22rem,100%)] lg:items-center lg:gap-10">
            <div className="motion-safe:animate-fade-in-up">
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[#FF6B45]">
                <GraduationCap className="h-3.5 w-3.5 text-[#FF6B45] motion-safe:animate-hero-live" aria-hidden />
                Course catalog
              </p>
              <h1 className="mt-3 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.35rem] lg:leading-tight">
                Learn from evidence-led programmes
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/90 sm:text-[15px]">
                Search and sort the full catalog — by topic, price, or title — then open any course for
                curriculum, pricing, and enrollment.
              </p>
            </div>
            <div className="mt-8 flex flex-wrap gap-3 lg:mt-0 lg:flex-col lg:items-stretch">
              <div className="flex min-w-[10rem] flex-1 items-center gap-3 rounded-xl border border-white/15 bg-white/[0.07] px-4 py-3 backdrop-blur-sm transition duration-300 hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/[0.1] motion-safe:animate-fade-in-up sm:flex-initial">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#E84A27]/20 text-[#FF6B45]">
                  <GraduationCap className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
                    Published only
                  </p>
                  <p className="text-sm font-semibold text-white">Ready to enroll</p>
                </div>
              </div>
              <div
                className="flex min-w-[10rem] flex-1 items-center gap-3 rounded-xl border border-white/15 bg-white/[0.07] px-4 py-3 backdrop-blur-sm transition duration-300 hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/[0.1] motion-safe:animate-fade-in-up sm:flex-initial"
                style={{ animationDelay: "0.1s" }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#E84A27]/20 text-[#FF6B45]">
                  <SlidersHorizontal className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
                    Fine-tune
                  </p>
                  <p className="text-sm font-semibold text-white">Price &amp; sort</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-6 sm:pb-14 sm:pt-6">
        <div
          className={cn(
            "mb-6 flex flex-col gap-3 rounded-2xl border border-[#0B1F3A]/12 bg-white/95 p-3 shadow-[0_12px_40px_-12px_rgba(11,31,58,0.18)] backdrop-blur-sm dark:border-white/20 dark:bg-[#132948]/95 dark:shadow-[0_16px_48px_-16px_rgba(0,0,0,0.45)]",
            "sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:p-4",
          )}
        >
          <div className="relative min-w-0 flex-1 md:min-w-[16rem]">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0B1F3A]/50 dark:text-white/70"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Search courses, instructors, categories…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                "h-11 rounded-xl border-[#0B1F3A]/18 bg-[#f5f8fd] pl-10 shadow-inner shadow-[#0B1F3A]/[0.04] dark:border-white/25 dark:bg-[#1a3f6b]/80",
                "text-[#0f172a] placeholder:text-[#64748b] dark:text-white dark:placeholder:text-white/45",
                "focus-visible:ring-2 focus-visible:ring-[#0B1F3A]/25 dark:focus-visible:ring-[#E84A27]/25",
              )}
              autoComplete="off"
              aria-label="Search courses"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <span className="hidden items-center gap-1.5 pr-1 text-[10px] font-bold uppercase tracking-wider text-[#0B1F3A]/55 dark:text-white/75 sm:inline-flex">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              Refine
            </span>

            <Select value={category} onValueChange={onCategorySelect}>
              <SelectTrigger className="h-11 w-[min(100vw-2rem,10.5rem)] rounded-xl border-[#0B1F3A]/15 bg-white dark:border-white/25 dark:bg-[#061528]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categoryOptions.map(([slug, name]) => (
                  <SelectItem key={slug} value={slug}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={priceFilter} onValueChange={setPriceFilter}>
              <SelectTrigger className="h-11 w-[min(100vw-2rem,9rem)] rounded-xl border-[#0B1F3A]/15 bg-white dark:border-white/25 dark:bg-[#061528]">
                <SelectValue placeholder="Price" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any price</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="h-11 w-[min(100vw-2rem,11.5rem)] rounded-xl border-[#0B1F3A]/15 bg-white dark:border-white/25 dark:bg-[#061528]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="featured">Catalog order</SelectItem>
                <SelectItem value="title-asc">Name A–Z</SelectItem>
                <SelectItem value="title-desc">Name Z–A</SelectItem>
                <SelectItem value="price-asc">Price: low to high</SelectItem>
                <SelectItem value="price-desc">Price: high to low</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 gap-1.5 rounded-xl border-[#0B1F3A]/25 dark:border-white/30"
                onClick={clearFilters}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Reset
              </Button>
            ) : null}
          </div>
        </div>

        <p className="mb-4 flex flex-wrap items-baseline gap-x-2 text-sm text-[#0B1F3A]/80 dark:text-white/75">
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-3.5 w-24 animate-pulse rounded bg-[#0B1F3A]/15 dark:bg-white/10" />
            </span>
          ) : (
            <>
              <span className="font-semibold tabular-nums text-[#0B1F3A] dark:text-[#FF8A66]">
                {filtered.length}
              </span>{" "}
              {filtered.length === 1 ? "course" : "courses"}
              {filtered.length !== courses.length ? (
                <span className="text-[#64748b] dark:text-white/50"> (of {courses.length} published)</span>
              ) : null}
            </>
          )}
        </p>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[380px] rounded-2xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-dashed border-[#0B1F3A]/25 bg-[#0B1F3A]/[0.04] px-6 py-14 text-center dark:border-white/25 dark:bg-white/5">
            <p className="font-medium text-[#0B1F3A] dark:text-white">Could not load courses</p>
            <p className="mt-2 text-sm text-[#64748b] dark:text-white/70">
              {(error as Error)?.message || "Check your connection and try again."}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#0B1F3A]/20 py-16 text-center dark:border-white/15">
            <BookOpen className="mx-auto h-12 w-12 text-[#0B1F3A]/35 dark:text-white/35" />
            <p className="mt-4 text-[#0B1F3A]/80 dark:text-white/80">No courses match your filters.</p>
            {hasActiveFilters ? (
              <Button type="button" variant="secondary" className="mt-4" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
            {filtered.map((course: Course, index: number) => {
              const lessons = course.lesson_count ?? 0;
              const enrolled = course.enrollment_count ?? 0;
              const instructorLine = course.instructor_name?.trim() || "Laambad faculty";
              return (
                <Link
                  key={course.id}
                  href={courseLandingHref(course.slug)}
                  className={cn(
                    "group/card flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground",
                    "shadow-[0_8px_30px_-18px_rgba(11,31,58,0.35)] transition-all duration-300",
                    "hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_22px_44px_-20px_rgba(11,31,58,0.35)]",
                    "dark:shadow-[0_8px_30px_-18px_rgba(0,0,0,0.6)] dark:hover:shadow-[0_22px_44px_-20px_rgba(0,0,0,0.75)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  )}
                >
                  <div className="relative shrink-0 overflow-hidden">
                    <FeaturedCourseCardHeader course={course} index={index} variant="catalog" />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-brand-navy/45 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100">
                      <span className="flex h-12 w-12 scale-90 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg ring-4 ring-white/25 transition-transform duration-300 group-hover/card:scale-100">
                        <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
                      </span>
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
                    <h2 className="line-clamp-2 min-h-[2.7em] text-[15.5px] font-bold leading-snug tracking-tight text-foreground transition-colors group-hover/card:text-brand">
                      {course.title}
                    </h2>

                    <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                      <InstructorFace name={instructorLine} src={course.instructor_avatar_url} />
                      <span className="truncate">{instructorLine}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted-foreground">
                      {course.rating && course.rating.count > 0 ? (
                        <span className="inline-flex items-center gap-1" title={`${course.rating.count} ratings`}>
                          <Star className="h-3.5 w-3.5 fill-brand text-brand" aria-hidden />
                          <span className="font-semibold text-foreground">{course.rating.average.toFixed(1)}</span>
                          <span>({course.rating.count.toLocaleString()})</span>
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {enrolled.toLocaleString()} {enrolled === 1 ? "learner" : "learners"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {lessons} {lessons === 1 ? "lesson" : "lessons"}
                      </span>
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
                      <p className="truncate text-lg font-extrabold tabular-nums tracking-tight text-foreground">
                        {formatCatalogPrice(course)}
                      </p>
                      <span
                        className={cn(
                          "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-bold transition-colors",
                          "bg-brand-navy text-white group-hover/card:bg-brand",
                          "dark:bg-white/10 dark:text-white dark:group-hover/card:bg-brand",
                        )}
                      >
                        View
                        <ArrowRight className="h-4 w-4 transition-transform group-hover/card:translate-x-0.5" aria-hidden />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
