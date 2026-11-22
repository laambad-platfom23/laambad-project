"use client";

import Link from "next/link";
import { ArrowLeft, Home, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Icon row for the learn layout header (matches former sub-bar controls). */
export function LearnHeaderActions() {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-full border px-1 py-1 sm:gap-0",
        "border-[#0B1F3A]/10 bg-white/60 shadow-sm backdrop-blur-md",
        "dark:border-white/10 dark:bg-white/10 dark:shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full text-[#0B1F3A] hover:bg-[#0B1F3A]/10 dark:text-white dark:hover:bg-white/15 dark:hover:text-[#FF8A66]"
        asChild
      >
        <Link href="/dashboard/my-learning" aria-label="Home">
          <Home className="h-4 w-4" />
        </Link>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full text-[#0B1F3A] hover:bg-[#0B1F3A]/10 dark:text-white dark:hover:bg-white/15 dark:hover:text-[#FF8A66]"
        asChild
      >
        <Link href="/dashboard/settings" aria-label="Settings">
          <Settings className="h-4 w-4" />
        </Link>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-0.5 hidden h-8 gap-1 rounded-full px-3 text-[#0B1F3A] hover:bg-[#0B1F3A]/10 sm:inline-flex dark:text-[#c4d4f4] dark:hover:bg-white/10 dark:hover:text-[#FF8A66]"
        asChild
      >
        <Link href="/dashboard/my-learning">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </Link>
      </Button>
    </div>
  );
}
