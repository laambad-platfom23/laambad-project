import apiClient from "./client";
import type { DashboardOverview, InstituteStatsOverview } from "@/types";

export const dashboardApi = {
  /** courseSlug: return only that course's enrollment (fast path for the learn page). */
  overview: (courseSlug?: string) =>
    apiClient.get<DashboardOverview>("/api/v1/dashboard", {
      params: courseSlug ? { course_slug: courseSlug } : undefined,
    }),
  instituteStats: () =>
    apiClient.get<InstituteStatsOverview>("/api/v1/dashboard/institute-stats"),
};
