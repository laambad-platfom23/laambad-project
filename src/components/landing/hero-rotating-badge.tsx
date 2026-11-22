"use client";

import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePublicCategories } from "@/hooks/use-public-categories";
import { shortCategoryLabel, subjectCategories } from "@/lib/category-display";

/** Shown until the real categories load (or if there are none). */
const FALLBACK_WORDS = ["Online courses"];

export function HeroRotatingBadge() {
  const { data } = usePublicCategories();
  const loaded = subjectCategories(data, 6).map((c) => shortCategoryLabel(c.name));
  const WORDS = loaded.length > 0 ? loaded : FALLBACK_WORDS;
  const [active, setActive] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % WORDS.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, [WORDS.length]);

  return (
    <div className="relative mb-2 inline-flex max-w-full sm:mb-3 motion-safe:animate-fade-in motion-reduce:animate-none">
      <p
        className={cn(
          "relative z-10 inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1.5 rounded-full border px-3.5 py-2 text-[11px] font-medium leading-snug sm:gap-x-2.5 sm:px-5 sm:py-2.5 sm:text-[13px]",
          "border-[#0B1F3A]/12 bg-white text-[#0B1F3A] shadow-sm",
          "dark:border-white/35 dark:bg-white/15 dark:text-white dark:shadow-lg dark:backdrop-blur-md",
        )}
      >
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0B1F3A] text-white dark:bg-[#E84A27] dark:text-white sm:h-8 sm:w-8"
          aria-hidden
        >
          <GraduationCap className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </span>

        {WORDS.slice(0, 4).map((w, idx) => (
          <span key={w} className="inline-flex items-center gap-x-2">
            {idx > 0 && (
              <span className="select-none text-[#0B1F3A]/35 dark:text-white/45" aria-hidden>
                ·
              </span>
            )}
            <span
              className={cn(
                "rounded-md px-0.5 transition-all duration-500 ease-out",
                idx === active % 4
                  ? "scale-[1.03] font-bold text-[#E84A27] motion-safe:animate-hero-badge-glow dark:text-[#FF6B45]"
                  : "text-[#0B1F3A]/55 dark:text-white/70",
              )}
            >
              {w}
            </span>
          </span>
        ))}
      </p>
    </div>
  );
}
