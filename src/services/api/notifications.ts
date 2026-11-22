import apiClient from "./client";
import type { Notification, PaginatedResponse } from "@/types";

export const notificationsApi = {
  list: (page = 1, pageSize = 20, unread = false) =>
    apiClient.get<PaginatedResponse<Notification>>("/api/v1/notifications", {
      params: { page, page_size: pageSize, unread: unread ? "1" : undefined },
    }),

  markRead: (id: string) =>
    apiClient.patch(`/api/v1/notifications/${id}/read`),

  markAllRead: () =>
    apiClient.post("/api/v1/notifications/read-all"),
};
