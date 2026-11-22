"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/ui/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicCategories } from "@/hooks/use-public-categories";
import { categoryIcon, subjectCategories } from "@/lib/category-display";

/** How many categories the home page shows; the rest are on /courses. */
const HOME_CATEGORY_LIMIT = 9;

export function CategoryPillarsSection() {
  const { data, isLoading } = usePublicCategories();
  const all = subjectCategories(data);
  const pillars = all.slice(0, HOME_CATEGORY_LIMIT).map((c) => ({ ...c, icon: categoryIcon(c.name) }));

  if (!isLoading && pillars.length === 0) return null;

  return (
    <section
      id="categories"
      className={cn(
        "relative scroll-mt-20 overflow-hidden border-t py-16 sm:py-20",
        "border-[#0B1F3A]/15 bg-[#F5F8FD]",
        "dark:border-white/10 dark:bg-[#061528]",
      )}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[3px] w-32 -translate-x-1/2 bg-[#0B1F3A] dark:bg-white/80 sm:w-40"
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mb-10 flex flex-col gap-6 sm:mb-12 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0B1F3A] dark:text-white/80">
              Course categories
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#0B1F3A] dark:text-white sm:text-3xl">
              Explore by category
            </h2>
            <p className="mt-2 text-base leading-relaxed text-[#0A1830]/90 dark:text-white/90">
              {all.length > 0
                ? `${all.length} qaybood oo koorsooyin ah — dooro halka aad ku korayso oo bilow waxbarasho.`
                : "Dooro qaybta aad xiisaynayso oo bilow waxbarasho."}
            </p>
          </div>
          <Link
            href="/courses"
            className="group inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-full border-2 border-[#0B1F3A] bg-white px-5 py-2.5 text-sm font-semibold text-[#0B1F3A] shadow-sm transition duration-300 hover:-translate-y-0.5 hover:bg-[#0B1F3A] hover:text-white dark:border-white dark:bg-white dark:text-[#0B1F3A] dark:hover:bg-white/90 md:self-auto"
          >
            All categories
            <ChevronRight className="h-4 w-4 transition duration-300 group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </Reveal>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {isLoading &&
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[84px] rounded-2xl" />)}
          {pillars.map((cat, i) => (
            <Reveal key={cat.slug} delay={i * 60}>
              <Link
                href={`/courses?category=${cat.slug}`}
                title={cat.name}
                className={cn(
                  "group relative flex h-full items-center gap-4 overflow-hidden rounded-2xl border border-border bg-card p-4 pr-3",
                  "transition-all duration-300 ease-out will-change-transform",
                  "shadow-[0_6px_24px_-16px_rgba(11,31,58,0.35)] dark:shadow-[0_6px_24px_-16px_rgba(0,0,0,0.6)]",
                  // hover: lift, brand border, warm tint and an orange glow
                  "hover:-translate-y-1 hover:border-brand/60 hover:bg-brand-soft/60",
                  "hover:shadow-[0_22px_44px_-20px_rgba(232,74,39,0.45)] dark:hover:shadow-[0_22px_44px_-20px_rgba(255,107,69,0.35)]",
                  "active:translate-y-0 active:scale-[0.99]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                )}
              >
                {/* orange accent bar that grows in from the left */}
                <span
                  className="pointer-events-none absolute inset-y-3 left-0 w-1 origin-center scale-y-0 rounded-r-full bg-brand transition-transform duration-300 group-hover:scale-y-100"
                  aria-hidden
                />
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand transition-all duration-300 group-hover:scale-105 group-hover:rotate-[-4deg] group-hover:bg-brand group-hover:text-brand-foreground group-hover:shadow-[0_8px_18px_-6px_rgba(232,74,39,0.6)]">
                  <cat.icon className="h-[22px] w-[22px]" strokeWidth={2.1} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-foreground transition-colors duration-300 group-hover:text-brand">
                    {cat.name}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">
                    {cat.course_count} {cat.course_count === 1 ? "course" : "courses"}
                  </span>
                </span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-all duration-300 group-hover:translate-x-0.5 group-hover:bg-brand group-hover:text-brand-foreground">
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
