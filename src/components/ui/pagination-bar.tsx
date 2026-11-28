"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 1 … 4 5 [6] 7 8 … 29 */
function pageList(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);
  if (from > 2) out.push("…");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < pages - 1) out.push("…");
  out.push(pages);
  return out;
}

/**
 * Phase 2: one pager for every dashboard list — "Showing 11–20 of 284" and Previous / pages / Next.
 * Hidden when everything fits on one page.
 */
export function PaginationBar({
  page,
  pageSize,
  total,
  onPage,
  className,
  noun = "items",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  className?: string;
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const go = (p: number) => {
    onPage(Math.min(pages, Math.max(1, p)));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <nav className={cn("flex flex-wrap items-center justify-between gap-3", className)} aria-label="Pages">
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{first.toLocaleString()}</span>–
        <span className="font-medium text-foreground">{last.toLocaleString()}</span> of{" "}
        <span className="font-medium text-foreground">{total.toLocaleString()}</span> {noun}
      </p>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1 px-2.5" disabled={page <= 1} onClick={() => go(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Previous</span>
        </Button>
        {pageList(page, pages).map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="px-1.5 text-sm text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={p === page ? "default" : "ghost"}
              className={cn("h-9 min-w-9 px-2.5", p !== page && "hidden sm:inline-flex")}
              aria-current={p === page ? "page" : undefined}
              onClick={() => go(p)}
            >
              {p}
            </Button>
          )
        )}
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1 px-2.5" disabled={page >= pages} onClick={() => go(page + 1)}>
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
