"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronLeft, ChevronRight, Users } from "lucide-react";
import apiClient from "@/services/api/client";
import { Reveal } from "@/components/ui/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, getInitials } from "@/lib/utils";

type PublicInstructor = {
  id: string;
  name: string;
  avatar_url: string | null;
  course_count: number;
  student_count: number;
};
type InstructorsPage = { data: PublicInstructor[]; total: number; page: number; pages: number };

const PAGE_SIZE = 6;

/** Page numbers with gaps: 1 2 3 … 9 */
function pageList(page: number, pages: number): (number | "…")[] {
  if (pages <= 5) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - (sorted[i - 1] as number) > 1) out.push("…");
    out.push(p);
  });
  return out;
}

function InstructorAvatar({ name, src }: { name: string; src: string | null }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="relative flex h-[84px] w-[84px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-navy text-xl font-extrabold text-white ring-4 ring-brand-soft transition-[box-shadow] duration-300 group-hover:ring-brand/40">
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element -- migrated photos of unknown size
        <img src={src} alt={name} className="h-full w-full object-cover" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}

/** Real instructors (with published courses) from the database, 6 per page. */
export function InstructorsSection() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["public-instructors", page],
    queryFn: () =>
      apiClient
        .get<InstructorsPage>("/api/public/instructors", { params: { page, page_size: PAGE_SIZE } })
        .then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  if (!isLoading && (!data || data.total === 0)) return null;

  return (
    <section id="instructors" className="scroll-mt-20 border-t border-border bg-muted/30 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Our instructors</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              Learn from experienced instructors
            </h2>
            <p className="mt-2 max-w-2xl text-[15px] text-muted-foreground">
              {data ? `${data.total} macallin oo leh koorsooyin la daabacay.` : "Macallimiinta Laambad."}
            </p>
          </div>
        </Reveal>

        <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5", isFetching && "opacity-70")}>
          {isLoading &&
            Array.from({ length: PAGE_SIZE }).map((_, i) => <Skeleton key={i} className="h-[124px] rounded-2xl" />)}
          {data?.data.map((ins, i) => (
            <Reveal key={ins.id} delay={i * 50}>
              <Link
                href={`/courses?q=${encodeURIComponent(ins.name)}`}
                className={cn(
                  "group flex h-full items-center gap-5 rounded-2xl border border-border bg-card p-5 transition-all duration-300",
                  "shadow-[0_8px_28px_-20px_rgba(11,31,58,0.4)] hover:-translate-y-0.5 hover:border-brand/40",
                  "dark:shadow-[0_8px_28px_-20px_rgba(0,0,0,0.7)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                )}
              >
                <InstructorAvatar name={ins.name} src={ins.avatar_url} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[16px] font-bold leading-snug text-foreground transition-colors group-hover:text-brand">
                    {ins.name}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" aria-hidden />
                      <b className="font-semibold text-foreground">{ins.course_count}</b>{" "}
                      {ins.course_count === 1 ? "course" : "courses"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" aria-hidden />
                      <b className="font-semibold text-foreground">{ins.student_count.toLocaleString()}</b> students
                    </span>
                  </span>
                </span>
              </Link>
            </Reveal>
          ))}
        </div>

        {data && data.pages > 1 ? (
          <nav
            className="mt-8 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3"
            aria-label="Instructors pages"
          >
            <p className="text-sm text-muted-foreground">
              Page <b className="text-foreground">{data.page}</b> of <b className="text-foreground">{data.pages}</b>
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={data.page <= 1}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground transition hover:bg-accent disabled:pointer-events-none disabled:opacity-35"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {pageList(data.page, data.pages).map((p, i) =>
                p === "…" ? (
                  <span key={`gap-${i}`} className="px-1.5 text-sm text-muted-foreground">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    aria-current={p === data.page ? "page" : undefined}
                    className={cn(
                      "flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold transition",
                      p === data.page ? "bg-brand text-brand-foreground" : "text-foreground hover:bg-accent",
                    )}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                disabled={data.page >= data.pages}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground transition hover:bg-accent disabled:pointer-events-none disabled:opacity-35"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </nav>
        ) : null}
      </div>
    </section>
  );
}
