"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, TrendingUp, ArrowRight, ChevronDown, LayoutGrid } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { usePublicCategories } from "@/hooks/use-public-categories";
import { categoryIcon, subjectCategories } from "@/lib/category-display";

type SmartSearchProps = {
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  /** Smaller padding on mobile strip */
  compact?: boolean;
  /** Taller pill + stronger border (Udemy-style header bar) */
  variant?: "default" | "header";
  /**
   * `nav` — main marketing nav: white field in light mode; inset field on navy in dark mode.
   * Omit for generic header (gray-900 dark field).
   */
  headerTone?: "default" | "nav";
  /** Single pill: Categories dropdown + search (marketing header) */
  embedCategories?: boolean;
};

export function SmartSearch({
  className,
  inputClassName,
  placeholder = "Search courses…",
  compact,
  variant = "default",
  headerTone = "default",
  embedCategories = false,
}: SmartSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { data: categories } = usePublicCategories();
  /** Suggestions: subject categories with the most courses. */
  const TRENDING = useMemo(() => subjectCategories(categories).map((c) => c.name), [categories]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TRENDING.slice(0, 6);
    return TRENDING.filter((t) => t.toLowerCase().includes(q)).slice(0, 8);
  }, [query, TRENDING]);

  const goSearch = useCallback(
    (q: string) => {
      const t = q.trim();
      if (!t) {
        router.push("/courses");
        return;
      }
      router.push(`/courses?q=${encodeURIComponent(t)}`);
      setOpen(false);
    },
    [router]
  );

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        wrapRef.current?.querySelector("input")?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const navMerged =
    embedCategories && variant === "header" && headerTone === "nav";


  return (
    <div ref={wrapRef} className={cn("relative w-full", className)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          goSearch(query);
        }}
        className={cn(
          navMerged
            ? "flex h-12 w-full max-w-full items-stretch overflow-hidden rounded-full border border-gray-200/90 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-shadow duration-200 focus-within:border-gray-300 focus-within:shadow-[0_4px_20px_rgba(15,23,42,0.12)] dark:border-2 dark:border-white/40 dark:bg-[#061528] dark:shadow-lg dark:focus-within:border-white dark:focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.2)]"
            : "relative"
        )}
      >
        {navMerged ? (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Browse categories"
                  className="flex h-12 w-[8.5rem] shrink-0 items-center gap-1.5 border-r border-slate-200 bg-slate-50 px-3 text-left text-[13px] font-semibold text-[#0B1F3A] transition hover:bg-slate-100 dark:border-white/20 dark:bg-[#123252] dark:text-white dark:hover:bg-[#1E4A8A] sm:w-[10rem] sm:gap-2 sm:pl-4"
                >
                  <LayoutGrid className="h-4 w-4 shrink-0 text-[#0B1F3A] dark:text-white" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">Categories</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-[#0B1F3A]/70 dark:text-white/70" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={8}
                className="w-[min(40rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-popover p-0 shadow-[0_24px_60px_-20px_rgba(11,31,58,0.35)] dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]"
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                    Browse categories
                  </p>
                  <span className="text-xs text-muted-foreground">{(categories ?? []).length} categories</span>
                </div>
                <div className="grid max-h-[min(26rem,60vh)] grid-cols-1 gap-1 overflow-y-auto p-2 sm:grid-cols-2">
                  {(categories ?? []).map((cat) => {
                    const Icon = categoryIcon(cat.name);
                    return (
                      <DropdownMenuItem
                        key={cat.slug}
                        asChild
                        className="cursor-pointer rounded-xl p-0 focus:bg-accent data-[highlighted]:bg-accent"
                      >
                        <Link
                          href={`/courses?category=${encodeURIComponent(cat.slug)}`}
                          title={cat.name}
                          className="group flex items-center gap-3 px-2.5 py-2"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand transition group-hover:bg-brand group-hover:text-brand-foreground">
                            <Icon className="h-[18px] w-[18px]" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-semibold text-foreground">{cat.name}</span>
                            <span className="block text-[11.5px] text-muted-foreground">
                              {cat.course_count} {cat.course_count === 1 ? "course" : "courses"}
                            </span>
                          </span>
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </div>
                <div className="border-t border-border bg-muted/40 p-2">
                  <DropdownMenuItem asChild className="cursor-pointer rounded-xl p-0 focus:bg-accent">
                    <Link
                      href="/courses"
                      className="flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold text-brand"
                    >
                      All courses <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="relative flex min-h-0 min-w-0 flex-1 basis-0 items-center bg-white dark:bg-[#061528]">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-white/70"
                aria-hidden
              />
              <Input
                type="search"
                autoComplete="off"
                placeholder={placeholder}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                aria-expanded={open}
                aria-controls="search-suggestions"
                className={cn(
                  "h-12 w-full rounded-none border-0 bg-transparent pl-10 pr-4 text-[15px] text-gray-900 shadow-none placeholder:text-gray-400 focus-visible:ring-0 dark:text-white dark:placeholder:text-white/55 sm:text-[15px]",
                  compact && "h-11",
                  inputClassName
                )}
              />
            </div>
          </>
        ) : (
          <>
            <Search
              className={cn(
                "pointer-events-none absolute left-3.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2",
                variant === "header" && headerTone === "nav"
                  ? "text-muted-foreground dark:text-white/55"
                  : "text-muted-foreground"
              )}
            />
            <Input
              type="search"
              autoComplete="off"
              placeholder={placeholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              aria-expanded={open}
              aria-controls="search-suggestions"
              className={cn(
                "w-full rounded-full border pl-10 transition-all placeholder:text-muted-foreground/70",
                variant === "header"
                  ? headerTone === "nav"
                    ? "h-11 border-gray-300 bg-white pr-24 text-[15px] text-gray-900 shadow-sm focus-visible:border-[#64d88c]/50 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[#64d88c]/20 dark:border-white/20 dark:bg-[#0A1830] dark:text-white dark:placeholder:text-white/45 dark:focus-visible:border-white/30 dark:focus-visible:bg-[#C44D00] dark:focus-visible:ring-[#E84A27]/30"
                    : "h-11 border-gray-300 bg-white pr-24 text-[15px] shadow-sm focus-visible:border-[#64d88c]/50 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[#64d88c]/25 dark:border-gray-600 dark:bg-gray-900 dark:focus:bg-gray-900"
                  : "h-10 border-gray-200/80 bg-gray-50/90 pr-4 shadow-inner dark:border-gray-700/80 dark:bg-gray-900/90 dark:focus:bg-gray-900",
                compact && "h-10",
                inputClassName
              )}
            />
          </>
        )}
      </form>

      {open && (
        <div
          id="search-suggestions"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl ring-1 ring-black/[0.04] dark:border-white/25 dark:bg-[#0A1830] dark:ring-[#E84A27]/10"
        >
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 text-xs font-medium text-muted-foreground dark:border-white/20">
            {query.trim() ? (
              <Search className="h-3.5 w-3.5 text-[#0B1F3A] dark:text-[#FF8A66]" />
            ) : (
              <TrendingUp className="h-3.5 w-3.5 text-[#0B1F3A] dark:text-[#FF8A66]" />
            )}
            {query.trim() ? "Matching suggestions" : "Trending searches"}
          </div>
          <ul className="max-h-72 overflow-auto py-1">
            {suggestions.length === 0 ? (
              <li className="px-3 py-3 text-sm text-muted-foreground">No matches — press Enter to search anyway</li>
            ) : (
              suggestions.map((label) => (
                <li key={label}>
                  <button
                    type="button"
                    role="option"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-[#64d88c]/10 dark:hover:bg-[#123252]/15"
                    onClick={() => {
                      setQuery(label);
                      goSearch(label);
                    }}
                  >
                    <span className="truncate">{label}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 opacity-40" />
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="border-t border-gray-100 bg-gray-50/80 px-3 py-2 text-[11px] text-muted-foreground dark:border-white/15 dark:bg-[#0B1F3A]/90">
            <span className="font-medium text-foreground/80 dark:text-[#EEF2F9]/85">Pro tip:</span> press{" "}
            <kbd className="rounded bg-white px-1 font-mono text-[10px] shadow dark:border dark:border-white/30 dark:bg-[#061528] dark:text-[#FF8A66]">Enter</kbd> to search the catalog
          </div>
        </div>
      )}
    </div>
  );
}
