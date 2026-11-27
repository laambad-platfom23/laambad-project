import apiClient from "./client";
import type {
  Course,
  CoursePricing,
  CreateCourseInput,
  PaginatedResponse,
  PublicCourseCategory,
  Section,
  Lesson,
  LessonAttachment,
} from "@/types";

export type UpdateCoursePricingInput = {
  is_free: boolean;
  /** Minor currency units (e.g. cents) */
  price: number;
  currency: string;
  discount_price?: number | null;
  start_date?: string | null;
  end_date?: string | null;
};

/** POST /api/v1/courses/:courseId/coupon-preview */
export type CouponPreviewResponse = {
  valid: boolean;
  code?: string;
  discount_percent?: number;
  currency: string;
  amount_minor: number;
  original_amount_minor: number;
  saved_minor: number;
  message?: string;
};

export type LessonWritePayload = {
  title: string;
  description?: string;
  content?: string;
  video_provider?: string;
  video_url?: string;
  attachments?: LessonAttachment[];
  sort_order?: number;
  /** Migrated lessons play through VdoCipher (32-hex video id). */
  vdocipher_video_id?: string | null;
  duration_seconds?: number | null;
  is_preview?: boolean;
};

export type CourseStatusValue = "published" | "draft" | "pending" | "private" | "suspended";

/** Course Builder → Basics / Additional fields. */
export type CourseDetailsInput = {
  excerpt?: string | null;
  level?: string | null;
  /** A8: cover image (uploaded) */
  cover_url?: string | null;
  benefits?: string | null;
  requirements?: string | null;
  target_audience?: string | null;
  materials?: string | null;
  is_public?: boolean;
};

export const coursesApi = {
  // Public
  publicList: (page = 1, pageSize = 20) =>
    apiClient.get<PaginatedResponse<Course>>("/api/courses", {
      params: { page, page_size: pageSize },
    }),

  /** Categories with at least one published course (no auth). */
  publicCategories: () => apiClient.get<PublicCourseCategory[]>("/api/course-categories"),

  /** Published course for marketing / course detail page (no auth). */
  publicGetBySlug: (slug: string) =>
    apiClient.get<Course>(`/api/courses/by-slug/${encodeURIComponent(slug)}`),

  // Authenticated — pass published_only for catalog (published courses only); omit for full staff list when mine is false.
  list: (
    page = 1,
    pageSize = 20,
    mine = false,
    opts?: { published_only?: boolean; q?: string; status?: string }
  ) =>
    apiClient.get<PaginatedResponse<Course>>("/api/v1/courses", {
      params: {
        page,
        page_size: pageSize,
        ...(mine ? { mine: "1" } : {}),
        ...(opts?.published_only ? { published_only: "1" } : {}),
        ...(opts?.q?.trim() ? { q: opts.q.trim() } : {}),
        ...(opts?.status && opts.status !== "all" ? { status: opts.status } : {}),
      },
    }),

  get: (courseId: string) =>
    apiClient.get<Course>(`/api/v1/courses/${courseId}`),

  /** Authenticated; same shape as get() but resolves by public URL slug */
  getBySlug: (slug: string) =>
    apiClient.get<Course>(`/api/v1/courses/slug/${encodeURIComponent(slug)}`),

  getPricing: (courseId: string) =>
    apiClient.get<CoursePricing>(`/api/v1/courses/${courseId}/pricing`),

  /** Auth — preview total after coupon (checkout). */
  previewCoupon: (courseId: string, code: string) =>
    apiClient.post<CouponPreviewResponse>(`/api/v1/courses/${courseId}/coupon-preview`, {
      code: code.trim(),
    }),

  updatePricing: (courseId: string, data: UpdateCoursePricingInput) =>
    apiClient.patch<CoursePricing>(`/api/v1/courses/${courseId}/pricing`, data),

  create: (data: CreateCourseInput & CourseDetailsInput) =>
    apiClient.post<Course>("/api/v1/courses", data),

  update: (courseId: string, data: Partial<CreateCourseInput> & CourseDetailsInput) =>
    apiClient.patch<Course>(`/api/v1/courses/${courseId}`, data),

  /** Tutor-style status: published | draft | pending | private | suspended (suspend replaces delete). */
  setStatus: (courseId: string, status: CourseStatusValue) =>
    apiClient.post<Course>(`/api/v1/courses/${courseId}/status`, { status }),

  /** After modules, lessons, and pricing are set. Admin -> live; instructor -> pending review. */
  publish: (courseId: string) =>
    apiClient.post<Course>(`/api/v1/courses/${courseId}/publish`),

  unpublish: (courseId: string) =>
    apiClient.post<Course>(`/api/v1/courses/${courseId}/unpublish`),

  /** Admin approves a course submitted for review (-> published). */
  approve: (courseId: string) =>
    apiClient.post<Course>(`/api/v1/courses/${courseId}/approve`),

  /** Admin rejects a submitted course (-> draft, back to instructor). */
  reject: (courseId: string) =>
    apiClient.post<Course>(`/api/v1/courses/${courseId}/reject`),

  delete: (courseId: string) =>
    apiClient.delete(`/api/v1/courses/${courseId}`),

  addSection: (courseId: string, data: { title: string; sort_order?: number }) =>
    apiClient.post<Section>(`/api/v1/courses/${courseId}/sections`, data),

  updateSection: (sectionId: string, data: { title?: string; sort_order?: number }) =>
    apiClient.patch<Section>(`/api/v1/sections/${sectionId}`, data),

  deleteSection: (sectionId: string) =>
    apiClient.delete(`/api/v1/sections/${sectionId}`),

  addLesson: (sectionId: string, data: LessonWritePayload) =>
    apiClient.post<Lesson>(`/api/v1/sections/${sectionId}/lessons`, data),

  updateLesson: (lessonId: string, data: LessonWritePayload) =>
    apiClient.patch<Lesson>(`/api/v1/lessons/${lessonId}`, data),

  deleteLesson: (lessonId: string) =>
    apiClient.delete(`/api/v1/lessons/${lessonId}`),
};
