"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Play, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  priceLabel: string;
  live: boolean;
  isFree: boolean;
  /** Not signed in — adjust free-course primary label */
  guest?: boolean;
  enrollPending?: boolean;
  onBuy: () => void;
  onCart: () => void;
  /** When set, user is enrolled — single CTA to the learning player. */
  learnHref?: string | null;
};

/**
 * Conversion-focused sticky actions on small screens once the user scrolls past the hero.
 */
export function CourseMobileCtaBar({
  priceLabel,
  live,
  isFree,
  guest,
  enrollPending,
  onBuy,
  onCart,
  learnHref,
}: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 280);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 border-t border-[#E84A27]/20 bg-[#0B1F3A]/95 px-4 py-3 shadow-[0_-8px_32px_-8px_rgba(0,0,0,0.35)] backdrop-blur-md dark:bg-[hsl(214_58%_22%)]/95 lg:hidden",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
      )}
    >
      {learnHref ? (
        <div className="mx-auto max-w-lg">
          <Button
            asChild
            size="sm"
            className="h-11 w-full bg-white font-semibold text-[#0B1F3A] shadow-lg transition hover:bg-white/90"
          >
            <Link href={learnHref}>
              <Play className="mr-2 h-4 w-4 shrink-0 fill-current" aria-hidden />
              Continue learning
            </Link>
          </Button>
        </div>
      ) : (
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/60">Your price</p>
            <p className="truncate text-lg font-bold tabular-nums text-white">{isFree ? "Free" : priceLabel}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!live}
            onClick={onCart}
            className="h-10 shrink-0 border-white/25 bg-white/10 text-white hover:bg-white/20"
          >
            <ShoppingCart className="mr-1.5 h-4 w-4" />
            Cart
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!live || (isFree && !!enrollPending)}
            onClick={onBuy}
            className="h-10 shrink-0 bg-white px-5 font-semibold text-[#0B1F3A] shadow-lg transition hover:bg-white/90"
          >
            {enrollPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isFree ? (guest ? "Sign in" : "Start") : "Buy"}
          </Button>
        </div>
      )}
    </div>
  );
}
