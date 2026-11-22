"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  ChevronRight,
  FileText,
  GraduationCap,
  User,
} from "lucide-react";
import { researchApi } from "@/services/api/research";
import type { ResearchPaper } from "@/types";
import { cn, formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const GOLD_CARD_INDEX = 1;

function abstractExcerpt(abstract: string | undefined, max = 140): string {
  const t = (abstract ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "Work from the Laambad community.";
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

export function PublishedPapersShowcase() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["landing-published-papers"],
    queryFn: () => researchApi.publicList(1, 4).then((r) => r.data),
    staleTime: 60 * 1000,
  });

  const papers: ResearchPaper[] = data?.data ?? [];

  return (
    <section
      id="publications"
      className={cn(
        "relative scroll-mt-20 overflow-hidden border-t py-16 sm:py-20",
        "border-[#0B1F3A]/12 bg-[#F5F8FD]",
        "dark:border-white/15 dark:bg-[#0B1F3A]",
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[#0B1F3A]/15 dark:bg-[#E84A27]/30"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 top-20 h-72 w-72 rounded-full bg-[#0B1F3A]/[0.1] hidden dark:bg-[#E84A27]/[0.08]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-10 flex flex-col gap-6 text-center sm:mb-12">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0B1F3A] dark:text-[#FF8A66]">
              Publications
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#0B1F3A] dark:text-white sm:text-3xl">
              Published papers
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-[#0B1F3A]/85 dark:text-white/85">
              Recent work from our scholars — browse abstracts and download PDFs from the research library.
            </p>
          </div>
          <div className="flex justify-center">
            <Link
              href="/research"
              className="group inline-flex items-center gap-2 rounded-full border-2 border-[#0B1F3A] bg-white px-5 py-2.5 text-sm font-semibold text-[#0B1F3A] shadow-sm transition hover:bg-[#0B1F3A] hover:text-white dark:border-[#FF6B45] dark:bg-[#061528] dark:text-[#FF8A66] dark:hover:bg-[#0B1F3A] dark:hover:text-white"
            >
              <GraduationCap className="h-4 w-4 shrink-0" aria-hidden />
              Research library
              <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-[#0B1F3A]/15 bg-transparent p-5 dark:border-white/10"
              >
                <Skeleton className="mb-4 h-10 w-10 rounded-xl dark:bg-white/10" />
                <Skeleton className="mb-2 h-5 w-full dark:bg-white/10" />
                <Skeleton className="mb-3 h-3 w-2/3 dark:bg-white/10" />
                <Skeleton className="mb-2 h-3 w-full dark:bg-white/10" />
                <Skeleton className="h-3 w-4/5 dark:bg-white/10" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <p className="rounded-2xl border border-dashed border-[#0B1F3A]/25 bg-[#0B1F3A]/[0.04] px-4 py-10 text-center text-sm text-[#0B1F3A]/80 dark:border-white/30 dark:bg-white/5 dark:text-white/80">
            Could not load publications.{" "}
            <Link href="/research" className="font-semibold underline underline-offset-2">
              Open the research library
            </Link>
          </p>
        ) : papers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#0B1F3A]/20 bg-[#0B1F3A]/[0.03] px-6 py-14 text-center dark:border-white/15 dark:bg-white/[0.04]">
            <FileText className="mx-auto h-12 w-12 text-[#0B1F3A]/35 dark:text-[#FF8A66]/40" aria-hidden />
            <p className="mt-4 text-base font-semibold text-[#0B1F3A] dark:text-white">
              No published papers yet
            </p>
            <p className="mt-2 text-sm text-[#0B1F3A]/75 dark:text-white/70">
              When teachers publish through Laambad, they will appear here and in the research library.
            </p>
            <Link
              href="/research"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#0B1F3A] underline-offset-4 hover:underline dark:text-[#FF8A66]"
            >
              Visit research library
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {papers.map((paper, index) => {
              const isGold = index === GOLD_CARD_INDEX;
              const primaryCategory = paper.categories?.[0]?.name;

              return (
                <article
                  key={paper.id}
                  className={cn(
                    "flex h-full flex-col rounded-2xl border p-5 text-left transition-all duration-300",
                    "bg-transparent backdrop-blur-[2px]",
                    isGold
                      ? cn(
                          "border-2 border-[#E84A27]/55 shadow-md shadow-[#0B1F3A]/10",
                          "hover:-translate-y-1 hover:border-[#E84A27] hover:shadow-lg hover:shadow-[#0B1F3A]/20",
                          "bg-[#E84A27]/[0.12] dark:bg-[#E84A27]/[0.10]",
                        )
                      : cn(
                          "border border-[#0B1F3A]/22",
                          "hover:-translate-y-1 hover:border-[#0B1F3A]/45 hover:bg-[#0B1F3A]/[0.06] hover:shadow-lg hover:shadow-[#0B1F3A]/8",
                          "dark:border-white/[0.12] dark:hover:border-[#0B1F3A]/50 dark:hover:bg-[#0B1F3A]/25",
                        ),
                  )}
                >
                  <span
                    className={cn(
                      "mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
                      isGold
                        ? "bg-[#0B1F3A] text-white ring-2 ring-[#E84A27]/45 shadow-sm"
                        : "bg-[#0B1F3A]/12 text-[#0B1F3A] ring-1 ring-[#0B1F3A]/20 dark:bg-[#061528] dark:text-[#FF8A66] dark:ring-[#E84A27]/30",
                    )}
                    aria-hidden
                  >
                    <FileText className="h-5 w-5" strokeWidth={2} />
                  </span>

                  {primaryCategory ? (
                    <span
                      className={cn(
                        "mb-2 inline-block w-fit rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        isGold
                          ? "border-[#0B1F3A]/25 bg-[#0B1F3A]/90 text-white dark:bg-[#0B1F3A]"
                          : "border-[#0B1F3A]/25 bg-[#0B1F3A]/[0.08] text-[#0B1F3A] dark:border-white/40 dark:bg-transparent dark:text-[#FF8A66]",
                      )}
                    >
                      {primaryCategory}
                    </span>
                  ) : null}

                  <h3
                    className={cn(
                      "line-clamp-2 min-h-[2.5rem] text-base font-bold leading-snug",
                      "text-[#0B1F3A] dark:text-white",
                    )}
                  >
                    {paper.title}
                  </h3>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#64748b] dark:text-[#cbd5e1]">
                    {paper.author_name ? (
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3.5 w-3.5 shrink-0 text-[#0B1F3A]/70 dark:text-white/80" />
                        {paper.author_name}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Calendar className="h-3.5 w-3.5 shrink-0 text-[#0B1F3A]/70 dark:text-white/80" />
                      {formatDate(paper.created_at)}
                    </span>
                  </div>

                  <p className="mt-3 flex-1 text-sm leading-relaxed text-[#475569] dark:text-[#e2e8f0]/90">
                    {abstractExcerpt(paper.abstract)}
                  </p>

                  <div className="mt-4 pt-3">
                    <Link
                      href="/research"
                      className={cn(
                        "inline-flex items-center gap-1 text-sm font-semibold transition-colors",
                        isGold
                          ? "text-[#0B1F3A] hover:text-[#0A1830] dark:text-white dark:hover:text-[#FF8A66]"
                          : "text-[#0B1F3A] hover:underline dark:text-[#FF8A66] dark:hover:text-white",
                      )}
                    >
                      Read in library
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
