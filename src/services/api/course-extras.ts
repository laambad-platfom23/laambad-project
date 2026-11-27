/** A7 — the student's notebook, course announcements and course reviews. */
import apiClient from "./client";

// ── notes ──
export type Note = {
  id: string;
  course: { id: string; title: string; slug: string };
  lesson: { id: string; title: string; section_title: string; deleted: boolean };
  body: string;
  /** video position when written (seconds) */
  position_secs: number | null;
  created_at: string;
  updated_at: string;
};

export const notesApi = {
  list: (filter: { course_id?: string; lesson_id?: string; q?: string } = {}) =>
    apiClient.get<{ data: Note[] }>("/api/v1/notes", { params: filter }),
  create: (data: { lesson_id: string; body: string; position_secs?: number | null }) => apiClient.post<Note>("/api/v1/notes", data),
  update: (id: string, body: string) => apiClient.patch<Note>(`/api/v1/notes/${id}`, { body }),
  remove: (id: string) => apiClient.delete(`/api/v1/notes/${id}`),
};

// ── announcements ──
export type Announcement = {
  id: string;
  course: { id: string; title: string; slug: string };
  title: string;
  body: string;
  author: { id: string; name: string; avatar_url: string | null } | null;
  created_at: string;
  updated_at: string;
  edited: boolean;
};

export const announcementsApi = {
  forCourse: (courseId: string) =>
    apiClient.get<{ data: Announcement[]; can_post: boolean }>(`/api/v1/courses/${courseId}/announcements`),
  /** dashboard: staff → the courses they teach; students → their courses */
  dashboard: () => apiClient.get<{ data: Announcement[]; staff: boolean }>("/api/v1/announcements"),
  create: (courseId: string, data: { title: string; body: string }) =>
    apiClient.post<Announcement & { notified: number }>(`/api/v1/courses/${courseId}/announcements`, data),
  update: (id: string, data: { title?: string; body?: string }) => apiClient.patch<Announcement>(`/api/v1/announcements/${id}`, data),
  remove: (id: string) => apiClient.delete(`/api/v1/announcements/${id}`),
};

// ── reviews ──
export type MyReview = {
  id: string;
  rating: number;
  comment: string | null;
  approved: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type ReviewSummary = {
  average: number;
  count: number;
  distribution: { stars: number; count: number }[];
  can_review: boolean;
  mine: MyReview | null;
  reviews: {
    id: string;
    rating: number;
    comment: string | null;
    user: { id: string; name: string; avatar_url: string | null };
    mine: boolean;
    created_at: string | null;
  }[];
};

export type MyCourseReview = {
  course: { id: string; title: string; slug: string; cover_image_url: string | null };
  rating: { average: number; count: number };
  mine: MyReview | null;
};

export const courseReviewsApi = {
  summary: (courseId: string) => apiClient.get<ReviewSummary>(`/api/v1/courses/${courseId}/reviews/summary`),
  /** write or update MY review (one per course) */
  save: (courseId: string, data: { rating: number; comment: string }) => apiClient.post<MyReview>(`/api/v1/courses/${courseId}/reviews`, data),
  remove: (reviewId: string) => apiClient.delete(`/api/v1/reviews/${reviewId}`),
  myCourses: () => apiClient.get<{ data: MyCourseReview[] }>("/api/v1/my/reviews"),
};
