"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { usePublicCategories } from "@/hooks/use-public-categories";
import { shortCategoryLabel, subjectCategories } from "@/lib/category-display";

/** Shown until the real categories load (or if there are none). */
const FALLBACK_WORDS = ["Online courses"];

export function HeroRotatingTitle() {
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
    <span className="block text-pretty">
      <span className="block font-extrabold tracking-[-0.02em] text-[#0B1F3A] drop-shadow-[0_1px_0_rgba(255,255,255,0.8)] dark:text-white dark:drop-shadow-none">
        <span className="sm:hidden">Laambad</span>
        <span className="hidden sm:inline">Laambad E-learning platform</span>
      </span>

      <span className="mt-1 block font-extrabold tracking-[-0.015em] text-[#E84A27] dark:text-[#FF6B45] sm:mt-1.5">
        <span className="relative inline-block min-h-[1.15em] min-w-[14ch] align-baseline">
          {WORDS.map((w, i) => (
            <span
              key={w}
              className={cn(
                "absolute left-0 top-0 whitespace-nowrap font-extrabold text-[#E84A27] dark:text-[#FF6B45]",
                "transition-all duration-500 ease-out",
                i === active
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-2 opacity-0",
              )}
              aria-hidden={i !== active}
            >
              {w}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}
