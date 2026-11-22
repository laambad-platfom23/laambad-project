"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { resolveSiteImage, useSiteSettings } from "@/hooks/use-site-settings";
import { usePublicCategories } from "@/hooks/use-public-categories";
import { categoryIcon, shortCategoryLabel, subjectCategories } from "@/lib/category-display";
import { LogoIcon } from "@/components/ui/logo";

/** Hero visual — Laambad skills map with orbiting category chips. */
export function HeroCeoShowcase() {
  const [active, setActive] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const { data: settings } = useSiteSettings();
  const heroSrc = resolveSiteImage(settings, "hero_image");
  const { data: categories } = usePublicCategories();
  const ORBIT_ITEMS = subjectCategories(categories, 6).map((cat) => ({
    name: cat.name,
    slug: cat.slug,
    icon: categoryIcon(cat.name),
    short: shortCategoryLabel(cat.name, 12),
  }));

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      setActive((i) => (ORBIT_ITEMS.length ? (i + 1) % ORBIT_ITEMS.length : 0));
    }, 2400);
    return () => window.clearInterval(id);
  }, [reduceMotion, ORBIT_ITEMS.length]);

  return (
    <div className="relative mx-auto flex w-full max-w-md flex-col justify-center self-stretch sm:max-w-lg lg:mx-0 lg:max-w-none">
      <div className="relative mx-auto w-full max-w-[min(100%,520px)] motion-safe:animate-fade-in-up">
        <div className="relative aspect-square w-full">
          {/* Decorative rings */}
          <div
            className={cn(
              "pointer-events-none absolute inset-[5%] rounded-full border border-dashed border-[#0B1F3A]/30 dark:border-[#FF6B45]/45",
              "motion-safe:animate-orbit-ring",
            )}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-[10%] rounded-full border border-[#E84A27]/35 dark:border-[#FF6B45]/40"
            aria-hidden
          />

          {/* Center: framed photo / logo */}
          <div
            className={cn(
              "absolute inset-[16%] rounded-full sm:inset-[15%]",
              "p-[3px] sm:p-1",
              "bg-[#0B1F3A] dark:bg-[#E84A27]",
              "shadow-[0_12px_28px_-12px_rgba(11,31,58,0.28)] dark:shadow-[0_12px_28px_-12px_rgba(0,0,0,0.5)]",
              "motion-safe:animate-hero-float",
            )}
          >
            <div
              className={cn(
                "relative h-full w-full overflow-hidden rounded-full",
                "border-[3px] border-white dark:border-[#0B1F3A]",
                "ring-1 ring-[#E84A27]/40 dark:ring-white/25",
              )}
            >
              {heroSrc && !heroSrc.includes("sodemy") && !heroSrc.includes("laambad-logo") ? (
                <>
                  <Image
                    src={heroSrc}
                    alt="Laambad — E-learning platform"
                    fill
                    priority
                    sizes="(max-width: 1024px) 90vw, 44vw"
                    className="object-cover"
                    unoptimized={heroSrc.startsWith("http")}
                  />
                  <div
                    className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-black/5"
                    aria-hidden
                  />
                </>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#0B1F3A] px-4 dark:bg-[#061528]">
                  <div className="scale-110 sm:scale-125">
                    <LogoIcon size="lg" onDark />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Orbiting categories */}
          <ul
            className={cn(
              "absolute inset-0 list-none",
              !reduceMotion && "motion-safe:animate-orbit-spin",
            )}
            aria-label="Laambad course categories"
          >
            {ORBIT_ITEMS.map((item, i) => {
              const angle = (360 / ORBIT_ITEMS.length) * i;
              const isActive = i === active;
              const Icon = item.icon;

              return (
                <li
                  key={item.slug}
                  className="absolute inset-0"
                  style={{ transform: `rotate(${angle}deg)` }}
                >
                  {/* Chip sits near the top of this rotated plane ≈ orbit edge */}
                  <div className="absolute left-1/2 top-[5%] z-10 -translate-x-1/2 sm:top-[4.5%]">
                    {/* Counter-spin keeps labels readable while the orbit turns */}
                    <div className={cn(!reduceMotion && "motion-safe:animate-orbit-spin-reverse")}>
                      <div style={{ transform: `rotate(-${angle}deg)` }}>
                        <Link
                          href={`/courses?category=${item.slug}`}
                          title={item.name}
                          className={cn(
                            "group/chip flex items-center gap-1.5 rounded-full border px-2 py-1.5 backdrop-blur-md transition-all duration-500 sm:gap-2 sm:px-2.5",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1F3A] focus-visible:ring-offset-2",
                            "dark:focus-visible:ring-white dark:focus-visible:ring-offset-[#030A14]",
                            isActive
                              ? "scale-105 border-[#E84A27] bg-white text-[#0B1F3A] dark:border-[#FF6B45] dark:bg-white dark:text-[#0B1F3A]"
                              : "border-[#0B1F3A]/20 bg-white/95 text-[#0B1F3A]/80 hover:border-[#E84A27]/50 hover:bg-white dark:border-white/30 dark:bg-[#061528]/90 dark:text-white/90 dark:hover:border-[#FF6B45]/60 dark:hover:bg-[#0B1F3A]",
                          )}
                          aria-label={item.name}
                          aria-current={isActive ? "true" : undefined}
                        >
                          <span
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors duration-500 sm:h-7 sm:w-7",
                              isActive
                                ? "bg-[#E84A27] text-white"
                                : "bg-[#0B1F3A]/12 text-[#0B1F3A] group-hover/chip:bg-[#E84A27] group-hover/chip:text-white dark:bg-white/15 dark:text-white",
                            )}
                          >
                            <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={2.25} />
                          </span>
                          <span className="text-[10px] font-bold leading-none tracking-tight sm:text-[11px]">
                            {item.short}
                          </span>
                        </Link>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
