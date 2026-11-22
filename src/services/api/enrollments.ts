import apiClient from "./client";
import type { AdminEnrollmentRow, Enrollment, CourseProgress } from "@/types";

export const enrollmentsApi = {
  enroll: (courseId: string) =>
    apiClient.post<Enrollment>(`/api/v1/courses/${courseId}/enroll`),

  /** Admin: all enrollments with payment method and statuses. */
  /** Paginated: 14k+ migrated enrollments. */
  listAdmin: (page = 1, pageSize = 50) =>
    apiClient.get<{ data: AdminEnrollmentRow[]; total: number; page: number }>("/api/v1/admin/enrollments", {
      params: { page, page_size: pageSize },
    }),

  adminCancel: (enrollmentId: string) =>
    apiClient.post<{ status: string }>(`/api/v1/admin/enrollments/${enrollmentId}/cancel`),

  adminDelete: (enrollmentId: string) =>
    apiClient.delete<{ status: string }>(`/api/v1/admin/enrollments/${enrollmentId}`),

  adminReactivate: (enrollmentId: string) =>
    apiClient.post<{ status: string }>(`/api/v1/admin/enrollments/${enrollmentId}/reactivate`),

  getProgress: (courseId: string) =>
    apiClient.get<CourseProgress>(`/api/v1/courses/${courseId}/progress`),

  updateLessonProgress: (
    lessonId: string,
    data: { completed?: boolean; completed_percent?: number }
  ) => apiClient.patch(`/api/v1/lessons/${lessonId}/progress`, data),
};
