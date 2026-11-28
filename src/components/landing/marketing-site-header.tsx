"use client";

import Link from "next/link";
import { Bell, Sun, Moon } from "lucide-react";
import { ShoppingCartSheet } from "@/components/cart/shopping-cart-sheet";
import { useTheme } from "next-themes";
import { Logo } from "@/components/ui/logo";
import { SmartSearch } from "@/components/landing/smart-search";
import { LandingHeaderAuth } from "@/components/landing/landing-header-auth";
import { cn } from "@/lib/utils";

type Props = {
  /** @deprecated Promo strip removed — kept for call-site compat */
  showPromo?: boolean;
};

export function MarketingSiteHeader(_props: Props = {}) {
  const { theme, setTheme } = useTheme();

  /** Logo navy (#0B1F3A): white links */
  const navLink =
    "whitespace-nowrap text-sm font-semibold text-white/90 transition-colors duration-200 hover:text-white dark:hover:text-[#FF8A66]";

  const iconBtn =
    "rounded-full p-2 text-white/90 transition-colors hover:bg-white/15 hover:text-white";

  return (
    <header className="sticky top-0 z-50 shadow-none">
      <div className="border-b border-white/10 bg-[#0B1F3A] dark:border-b-0 dark:bg-[#030A14]">
        <div className="mx-auto min-h-[72px] max-w-[1440px] px-4 py-2.5 sm:px-6 lg:px-8 lg:py-3">
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center lg:gap-4">
            <div className="flex items-center justify-between gap-3 lg:contents">
              <div className="flex min-w-0 shrink-0 items-center gap-4 lg:gap-6">
                <Logo size="md" href="/" variant="dark" className="opacity-100" />
              </div>
              <div className="flex shrink-0 items-center justify-end gap-0.5 sm:gap-1 md:gap-2">
                <div className="hidden items-center gap-3 lg:flex xl:gap-4">
                  <Link href="/courses" className={navLink}>
                    Courses
                  </Link>
                  <Link href="/books" className={navLink}>
                    Books
                  </Link>
                  <Link href="/about" className={navLink}>
                    About
                  </Link>
                  <Link href="/dashboard" className={navLink}>
                    My learning
                  </Link>
                  <Link
                    href="/instructor"
                    className="whitespace-nowrap rounded-full border-2 border-[#E84A27] bg-[#E84A27] px-3.5 py-1.5 text-sm font-semibold !text-white shadow-sm shadow-[#E84A27]/30 transition duration-300 hover:-translate-y-0.5 hover:bg-[#D03F1F] hover:!text-white hover:shadow-md dark:border-[#FF6B45] dark:bg-[#E84A27] dark:!text-white dark:hover:bg-[#FF6B45] dark:hover:!text-white"
                  >
                    Be Instructor
                  </Link>
                </div>
                <ShoppingCartSheet className="text-white/90 hover:bg-white/15 hover:text-white dark:text-white/90 dark:hover:bg-white/15" />
                <button
                  type="button"
                  className={cn(iconBtn, "hidden md:flex")}
                  aria-label="Notifications"
                >
                  <Bell className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className={iconBtn}
                  aria-label="Toggle theme"
                >
                  <Sun className="h-5 w-5 dark:hidden" />
                  <Moon className="hidden h-5 w-5 dark:block" />
                </button>
                <LandingHeaderAuth variant="navBlue" />
              </div>
            </div>
            <div className="mx-auto flex w-full min-w-0 justify-center lg:col-start-2 lg:row-start-1 lg:justify-center">
              <SmartSearch
                variant="header"
                headerTone="nav"
                embedCategories
                placeholder="Search course"
                className="w-full max-w-md sm:max-w-xl"
              />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
