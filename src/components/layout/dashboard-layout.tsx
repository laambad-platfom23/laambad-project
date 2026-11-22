"use client";

import { Suspense, useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Navbar } from "./navbar";
import { AdminLoginForm } from "@/components/auth/admin-login-form";
import { useAuthStore } from "@/store/auth-store";
import { authApi } from "@/services/api/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { isStaffUser } from "@/lib/auth-routing";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading, setUser, setLoading, logout } =
    useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // close the mobile drawer after navigating
  useEffect(() => setMobileNavOpen(false), [pathname]);

  const isStaffLoginRoute = pathname === "/dashboard";

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      logout();
      setLoading(false);
      if (isStaffLoginRoute) return;
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (user) {
      setLoading(false);
      return;
    }
    // Token present but profile not loaded yet (e.g. after register/login) — wait for /me.
    setLoading(true);
    authApi
      .me()
      .then((res) => setUser(res.data))
      .catch(() => {
        logout();
        if (pathname === "/dashboard") return;
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      });
  }, [user, pathname, isStaffLoginRoute, setUser, setLoading, logout, router]);

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    const staff = user ? isStaffUser(user) : false;
    logout();
    router.push(staff ? "/dashboard" : "/login");
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (isStaffLoginRoute) {
      return (
        <Suspense
          fallback={
            <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 dark:bg-[#0d2848]">
              <div className="space-y-4 w-full max-w-md px-4">
                <Skeleton className="mx-auto h-8 w-48" />
                <Skeleton className="h-32 w-full rounded-xl dark:bg-white/10" />
              </div>
            </div>
          }
        >
          <AdminLoginForm />
        </Suspense>
      );
    }
    return null;
  }

  return (
    <div
      className={cn(
        "min-h-screen bg-background",
      )}
    >
      <Sidebar
        onLogout={handleLogout}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />
      <div
        className={cn(
          "min-w-0 transition-all duration-300 ease-in-out",
          sidebarCollapsed ? "lg:ml-[70px]" : "lg:ml-[268px]",
        )}
      >
        <Navbar user={user} onLogout={handleLogout} onOpenMenu={() => setMobileNavOpen(true)} />
        <main className="min-h-[calc(100dvh-4rem)] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
