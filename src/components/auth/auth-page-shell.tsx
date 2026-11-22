"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { ArrowLeft, Moon, Sun } from "lucide-react";
import { HeroEconomicBackdrop } from "@/components/landing/hero-economic-backdrop";
import { Button } from "@/components/ui/button";

export function AuthPageShell({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-gray-50 dark:bg-[#030A14]">
      <div className="pointer-events-none absolute inset-0 hidden dark:block">
        <HeroEconomicBackdrop />
      </div>

      <header className="relative z-20 flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B1F3A] transition hover:text-[#0B1F3A] dark:text-white dark:hover:text-white/80"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Home
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="rounded-full text-[#0B1F3A] hover:bg-black/5 dark:text-white dark:hover:bg-white/15"
          aria-label="Toggle theme"
        >
          <Sun className="h-5 w-5 dark:hidden" />
          <Moon className="hidden h-5 w-5 dark:block" />
        </Button>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 sm:px-6 sm:pb-10">
        {children}
      </main>
    </div>
  );
}
