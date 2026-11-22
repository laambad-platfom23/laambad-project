import apiClient from "./client";
import type { PaginatedResponse, User } from "@/types";

export const usersApi = {
  list: (page = 1, pageSize = 20, opts?: { q?: string; role?: string }) =>
    apiClient.get<PaginatedResponse<User>>("/api/users", {
      params: {
        page,
        page_size: pageSize,
        ...(opts?.q?.trim() ? { q: opts.q.trim() } : {}),
        ...(opts?.role && opts.role !== "all" ? { role: opts.role } : {}),
      },
    }),

  get: (id: string) => apiClient.get<User>(`/api/users/${id}`),

  /** Admin: change a user's role (admin | instructor | student). */
  updateRole: (id: string, role: "admin" | "instructor" | "student") =>
    apiClient.patch<User>(`/api/users/${id}/role`, { role }),

  /** Admin: activate or deactivate a user (deactivated users cannot sign in). */
  setActive: (id: string, active: boolean) =>
    apiClient.patch<User>(`/api/users/${id}/active`, { active }),

  /** Admin: set a new password (replaces a migrated WordPress password; signs the user out). */
  setPassword: (id: string, password: string) =>
    apiClient.patch<User>(`/api/users/${id}/password`, { password }),
};
