"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { authApi } from "@/services/api/auth";
import { defaultDashboardPathForUser } from "@/lib/auth-routing";

type LandingHeaderAuthProps = {
  /** `gold` — on gold promo strip. `navBlue` — strong navy header (light + dark). */
  variant?: "default" | "gold" | "navBlue";
};

/** Log in / Sign up vs profile (avatar + Settings + Log out) on the marketing header */
export function LandingHeaderAuth({ variant = "default" }: LandingHeaderAuthProps) {
  const user = useAuthStore((s) => s.user);
  const logoutStore = useAuthStore((s) => s.logout);
  const setUser = useAuthStore((s) => s.setUser);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) {
      setAuthReady(true);
      return;
    }
    authApi
      .me()
      .then((res) => setUser(res.data))
      .catch(() => {
        logoutStore();
      })
      .finally(() => setAuthReady(true));
  }, [setUser, logoutStore]);

  const gold = variant === "gold";
  const navBlue = variant === "navBlue";

  if (!authReady) {
    return (
      <div
        className={cn(
          "h-9 w-[7.25rem] shrink-0 animate-pulse rounded-full",
          gold ? "bg-[#0B1F3A]/15" : navBlue ? "bg-white/15" : "bg-gray-200/80 dark:bg-gray-800"
        )}
        aria-hidden
      />
    );
  }

  if (user) {
    // logged in: the profile chip goes straight to the user's own dashboard
    const dashboardHref = defaultDashboardPathForUser(user);
    const firstName = user.name?.trim()?.split(/\s+/)[0] || user.username || "Account";
    return (
      <Link
        href={dashboardHref}
        title="Go to my dashboard"
        aria-label="Go to my dashboard"
        className={cn(
          "group inline-flex h-9 shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-semibold transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
          gold && "text-[#0B1F3A] hover:bg-[#0B1F3A]/10",
          navBlue && "text-white hover:bg-white/15",
          !gold && !navBlue && "text-foreground hover:bg-accent"
        )}
      >
        <Avatar
          className={cn(
            "h-8 w-8 border transition-colors group-hover:border-brand",
            gold && "border-[#0B1F3A]/30",
            navBlue && "border-white/35",
            !gold && !navBlue && "border-border"
          )}
        >
          {user.avatar_url ? <AvatarImage src={user.avatar_url} alt="" className="object-cover" /> : null}
          <AvatarFallback
            className={cn(
              "text-xs font-semibold",
              gold ? "bg-[#0B1F3A]/15 text-[#0B1F3A]" : navBlue ? "bg-white/15 text-white" : "bg-brand-soft text-brand"
            )}
          >
            {getInitials(user.name || "?")}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-[140px] truncate sm:inline">{firstName}</span>
      </Link>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "hidden px-2 font-medium md:inline-flex",
          gold && "text-[#0B1F3A] hover:bg-[#0B1F3A]/10 hover:text-[#0B1F3A]",
          navBlue &&
            "text-white/90 hover:bg-white/15 hover:text-white dark:hover:text-[#FF8A66]",
          !gold && !navBlue && "text-gray-800 dark:text-gray-100"
        )}
        asChild
      >
        <Link href="/login">Log in</Link>
      </Button>
      <Button
        size="sm"
        className={cn(
          "rounded-full border px-4 font-semibold shadow-sm transition sm:px-5",
          gold && "border-[#0B1F3A] bg-[#0B1F3A] text-white hover:bg-[#0B1F3A]/90",
          navBlue &&
            "border-white bg-white text-[#0B1F3A] hover:bg-white/90 dark:border-white dark:bg-white dark:text-[#0B1F3A] dark:hover:bg-white/90",
          !gold && !navBlue && "border-[#0B1F3A] bg-[#0B1F3A] text-white hover:bg-[#0B1F3A]/90"
        )}
        asChild
      >
        <Link href="/register">Sign up</Link>
      </Button>
    </>
  );
}
