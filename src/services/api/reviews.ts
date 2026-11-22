import apiClient from "./client";
import type {
  CourseReview,
  CourseRatingStats,
  PaginatedResponse,
} from "@/types";

export const reviewsApi = {
  create: (courseId: string, data: { rating: number; comment?: string }) =>
    apiClient.post<CourseReview>(`/api/v1/courses/${courseId}/reviews`, data),

  list: (courseId: string, page = 1, pageSize = 20) =>
    apiClient.get<PaginatedResponse<CourseReview>>(
      `/api/v1/courses/${courseId}/reviews`,
      { params: { page, page_size: pageSize } }
    ),

  stats: (courseId: string) =>
    apiClient.get<CourseRatingStats>(
      `/api/v1/courses/${courseId}/reviews/stats`
    ),

  update: (reviewId: string, data: { rating: number; comment?: string }) =>
    apiClient.patch<CourseReview>(`/api/v1/reviews/${reviewId}`, data),

  delete: (reviewId: string) =>
    apiClient.delete(`/api/v1/reviews/${reviewId}`),
};
