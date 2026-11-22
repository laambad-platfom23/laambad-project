import apiClient from "./client";
import type { CourseCategory } from "@/types";

export type CreateCourseCategoryInput = {
  name: string;
  slug?: string;
  sort_order?: number;
};

export type UpdateCourseCategoryInput = {
  name?: string;
  slug?: string;
  sort_order?: number;
};

export const courseCategoriesApi = {
  list: () => apiClient.get<CourseCategory[]>("/api/v1/course-categories"),

  create: (data: CreateCourseCategoryInput) =>
    apiClient.post<CourseCategory>("/api/v1/course-categories", data),

  update: (categoryId: string, data: UpdateCourseCategoryInput) =>
    apiClient.patch<CourseCategory>(`/api/v1/course-categories/${categoryId}`, data),

  delete: (categoryId: string) =>
    apiClient.delete(`/api/v1/course-categories/${categoryId}`),
};
