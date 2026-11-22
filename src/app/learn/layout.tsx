import Link from "next/link";
import { GraduationCap, Home, Library } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { LearnHeaderActions } from "./learn-header-actions";
import { cn } from "@/lib/utils";

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex min-h-0 min-h-svh flex-col text-foreground",
        "bg-[#eef2f9]",
        "dark:bg-[#0a1628]",
      )}
    >
      <header
        className={cn(
          "sticky top-0 z-50 shrink-0 border-b backdrop-blur-xl",
          "border-[#0B1F3A]/10 bg-white/80 shadow-[0_1px_0_0_rgba(255,255,255,0.7)_inset,0_8px_32px_-12px_rgba(232,93,4,0.12)] supports-[backdrop-filter]:bg-white/70",
          "dark:border-white/25 dark:bg-[#0B1F3A]",
          "dark:shadow-[0_4px_32px_-8px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.06)]",
        )}
      >
        <div className="flex h-[3.75rem] w-full items-center justify-between gap-2 px-3 sm:gap-4 sm:px-5 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-6">
            <Logo size="sm" href="/dashboard/my-learning" />
            <nav
              className="hidden min-w-0 items-center gap-1 text-sm font-medium text-[#0B1F3A]/80 dark:text-white/90 sm:flex sm:gap-1"
              aria-label="Learn navigation"
            >
              <Link
                href="/dashboard/my-learning"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all",
                  "hover:bg-[#0B1F3A]/10 hover:text-[#0B1F3A]",
                  "dark:text-white/90 dark:hover:bg-white/10 dark:hover:text-[#FF8A66]",
                )}
              >
                <Home className="h-4 w-4 shrink-0 opacity-80 dark:text-[#FF8A66]/90" aria-hidden />
                Home
              </Link>
              <Link
                href="/dashboard/my-courses"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all",
                  "hover:bg-[#0B1F3A]/10 hover:text-[#0B1F3A]",
                  "dark:text-white/90 dark:hover:bg-white/10 dark:hover:text-[#FF8A66]",
                )}
              >
                <Library className="h-4 w-4 shrink-0 opacity-80 dark:text-[#FF8A66]/90" aria-hidden />
                My courses
              </Link>
              <Link
                href="/courses"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all",
                  "hover:bg-[#0B1F3A]/10 hover:text-[#0B1F3A]",
                  "dark:text-white/90 dark:hover:bg-white/10 dark:hover:text-[#FF8A66]",
                )}
              >
                <GraduationCap className="h-4 w-4 shrink-0 opacity-80 dark:text-[#FF8A66]/90" aria-hidden />
                Catalog
              </Link>
            </nav>
          </div>
          <LearnHeaderActions />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
