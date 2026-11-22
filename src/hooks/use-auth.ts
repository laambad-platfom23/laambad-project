"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { authApi } from "@/services/api/auth";

export function useAuth() {
  const { user, isAuthenticated, isLoading, setUser, setLoading, logout } =
    useAuthStore();
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token && !user) {
      authApi
        .me()
        .then((res) => setUser(res.data))
        .catch(() => {
          logout();
        });
    } else {
      setLoading(false);
    }
  }, [user, setUser, setLoading, logout]);

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    logout();
    router.push("/login");
  };

  return { user, isAuthenticated, isLoading, logout: handleLogout };
}

export function useRequireAuth() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  return { isAuthenticated, isLoading };
}
