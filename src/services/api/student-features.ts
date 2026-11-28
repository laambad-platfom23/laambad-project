/** A2 student features: streak, retake, group discussion, learning paths, books, WhatsApp consent, passkeys. */
import apiClient, { personalGet } from "./client";

// ── Streak / retake ──
export type Streak = {
  current_streak: number;
  longest_streak: number;
  active_today: boolean;
  total_active_days: number;
  today: string;
  last_28_days: { day: string; active: boolean }[];
};

export const learningApi = {
  streak: () => apiClient.get<Streak>("/api/v1/me/streak"),
  retake: (courseId: string) =>
    apiClient.post<{ ok: boolean; retake_count: number; lessons_reset: number }>(`/api/v1/courses/${courseId}/retake`),
  /** automatic progress from the video player (the server completes the lesson at 80 %) */
  watched: (lessonId: string, watchedPercent: number) =>
    apiClient.patch<{ course_completed?: boolean; certificate_id?: string | null; completed?: boolean; completed_percent?: number }>(
      `/api/v1/lessons/${lessonId}/progress`,
      { watched_percent: watchedPercent }
    ),
};

// ── Group discussion (chat) ──
export type DiscussionMessage = {
  id: string;
  body: string;
  image_url: string | null;
  deleted: boolean;
  is_pinned: boolean;
  created_at: string;
  mine: boolean;
  author: { id: string; name: string; avatar_url: string | null; badge: "Instructor" | "Admin" | null };
  reply_to: { id: string; author_name: string; mine: boolean; body: string; has_image: boolean; deleted: boolean } | null;
  can_delete: boolean;
};
export type DiscussionRoom = {
  course: { id: string; slug: string; title: string };
  member_count: number;
  is_moderator: boolean;
  pinned: DiscussionMessage[];
  data: DiscussionMessage[];
  has_more_before: boolean;
};
export type DiscussionRoomSummary = {
  course_id: string;
  course_slug: string;
  course_title: string;
  message_count: number;
  last_message_at: string | null;
};

export const discussionsApi = {
  rooms: () => apiClient.get<DiscussionRoomSummary[]>("/api/v1/discussions"),
  list: (course: string, opts?: { before?: string; around?: string }) =>
    apiClient.get<DiscussionRoom>(`/api/v1/courses/${encodeURIComponent(course)}/discussion`, { params: opts }),
  search: (course: string, q: string) =>
    apiClient.get<{ q: string; data: DiscussionMessage[] }>(`/api/v1/courses/${encodeURIComponent(course)}/discussion`, {
      params: { q },
    }),
  uploadImage: (course: string, file: Blob, name: string) => {
    const form = new FormData();
    form.append("file", file, name);
    return apiClient.post<{ url: string }>(`/api/v1/courses/${encodeURIComponent(course)}/discussion/images`, form, {
      timeout: 120_000,
    });
  },
  post: (course: string, body: string, parentId?: string | null, imageUrl?: string | null) =>
    apiClient.post<DiscussionMessage>(`/api/v1/courses/${encodeURIComponent(course)}/discussion`, {
      body,
      parent_id: parentId ?? null,
      image_url: imageUrl ?? null,
    }),
  remove: (id: string) => apiClient.delete(`/api/v1/discussion-messages/${id}`),
  pin: (id: string, pinned: boolean) => apiClient.patch(`/api/v1/discussion-messages/${id}/pin`, { pinned }),
};

// ── Learning paths ──
export type LearningPathCourse = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  level: string | null;
  status: string;
  instructor_name: string | null;
  cover_url: string | null;
  sort_order: number;
  enrolled?: boolean;
  finished?: boolean;
  lessons_done?: number;
  lessons_total?: number;
};
export type LearningPath = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_url: string | null;
  level: string | null;
  status: string;
  sort_order: number;
  course_count: number;
  courses: LearningPathCourse[];
  finished_courses?: number;
  progress_percent?: number;
  next_course_slug?: string | null;
};
export type LearningPathInput = {
  title?: string;
  description?: string | null;
  cover_url?: string | null;
  level?: string | null;
  status?: "draft" | "published";
  sort_order?: number;
  course_ids?: string[];
};

export const learningPathsApi = {
  list: () => personalGet<LearningPath[]>("/api/v1/learning-paths", "/api/learning-paths"),
  get: (slug: string) => personalGet<LearningPath>(`/api/v1/learning-paths/${encodeURIComponent(slug)}`, `/api/learning-paths/${encodeURIComponent(slug)}`),
  create: (data: LearningPathInput) => apiClient.post<LearningPath>("/api/v1/learning-paths", data),
  update: (id: string, data: LearningPathInput) => apiClient.patch<LearningPath>(`/api/v1/learning-paths/${id}`, data),
  remove: (id: string) => apiClient.delete(`/api/v1/learning-paths/${id}`),
};

// ── Books ──
export type Book = {
  id: string;
  title: string;
  slug: string;
  author: string | null;
  description: string | null;
  cover_url: string | null;
  is_free: boolean;
  price: number; // cents
  currency: string;
  status: string;
  has_file: boolean;
  file_size: number | null;
  file_name?: string | null;
  owned?: boolean;
  payment_pending?: boolean;
  created_at: string;
  /** A12 */
  page_count?: number | null;
  rating?: { average: number; count: number };
  course?: { id: string; title: string; slug: string } | null;
  progress?: { last_page: number; percent: number } | null;
  course_id?: string | null;
};
export type BookProgress = { last_page: number; page_count: number | null; percent: number; bookmarks: number[]; updated_at: string | null };
export type BookReviewList = {
  average: number;
  count: number;
  distribution: { stars: number; count: number }[];
  page: number;
  has_more: boolean;
  reviews: { id: string; rating: number; comment: string | null; user: { name: string; avatar_url: string | null }; created_at: string | null }[];
};
export type MyBookReview = { id: string; rating: number; comment: string | null; created_at: string; updated_at: string };
export type BookInput = {
  title?: string;
  author?: string | null;
  description?: string | null;
  cover_url?: string | null;
  is_free?: boolean;
  price?: number;
  status?: "draft" | "published";
  /** A12: related course, page count */
  course_id?: string | null;
  page_count?: number | null;
};
export type BookOrder = {
  id: string;
  book_id: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  book_title?: string;
  student_name?: string;
  student_email?: string;
  student_phone?: string;
  payer_phone?: string;
  transaction_id?: string;
  note?: string;
  paid_at?: string | null;
  created_at: string;
};
export type UploadTicket =
  | { mode: "server"; max_bytes: number }
  | { mode: "blob"; pathname: string; token: string; max_bytes: number };

export const booksApi = {
  list: () => personalGet<Book[]>("/api/v1/books", "/api/books"),
  get: (slug: string) => personalGet<Book>(`/api/v1/books/${encodeURIComponent(slug)}`, `/api/books/${encodeURIComponent(slug)}`),
  mine: () => apiClient.get<Book[]>("/api/v1/my-books"),
  /** the PDF as a Blob (the request carries the sign-in token; the storage URL is never exposed) */
  /** A12: the PDF address for the in-app reader (pdf.js loads it in parts with the sign-in token) */
  fileUrl: (id: string) => `/api/v1/books/${id}/file`,
  progress: (id: string) => apiClient.get<BookProgress>(`/api/v1/books/${id}/progress`),
  saveProgress: (id: string, data: { last_page?: number; page_count?: number; bookmarks?: number[] }) =>
    apiClient.put<BookProgress>(`/api/v1/books/${id}/progress`, data),
  reviews: (id: string, page = 1) => apiClient.get<BookReviewList>(`/api/books/${id}/reviews`, { params: { page } }),
  myReview: (id: string) => apiClient.get<{ can_review: boolean; mine: MyBookReview | null }>(`/api/v1/books/${id}/reviews/mine`),
  saveReview: (id: string, data: { rating: number; comment: string }) => apiClient.post<MyBookReview>(`/api/v1/books/${id}/reviews`, data),
  deleteReview: (reviewId: string) => apiClient.delete(`/api/v1/book-reviews/${reviewId}`),
  payWaafi: (id: string, phone: string, couponCode?: string) =>
    apiClient.post<{ outcome: "approved" | "declined" | "unknown"; message: string; status: string }>(
      `/api/v1/books/${id}/pay/waafi`,
      { phone, coupon_code: couponCode || undefined },
      { timeout: 160_000 }
    ),
  payManual: (id: string, senderPhone: string, reference?: string, couponCode?: string) =>
    apiClient.post<{ id: string; status: string }>(`/api/v1/books/${id}/pay/manual`, {
      sender_phone: senderPhone || undefined,
      reference,
      coupon_code: couponCode || undefined,
    }),
  /** A11: what the book costs with a coupon (same shape as the course preview) */
  previewCoupon: (id: string, code: string) =>
    apiClient.post<{
      valid: boolean;
      code?: string;
      discount_percent?: number;
      currency: string;
      amount_minor: number;
      original_amount_minor: number;
      saved_minor: number;
      message?: string;
    }>(`/api/v1/books/${id}/coupon-preview`, { code }),
  // admin
  create: (data: BookInput) => apiClient.post<Book>("/api/v1/admin/books", data),
  update: (id: string, data: BookInput) => apiClient.patch<Book>(`/api/v1/admin/books/${id}`, data),
  remove: (id: string) => apiClient.delete(`/api/v1/admin/books/${id}`),
  uploadTicket: (id: string) => apiClient.post<UploadTicket>(`/api/v1/admin/books/${id}/upload-ticket`),
  attachBlob: (id: string, url: string, fileName: string, size: number) =>
    apiClient.post<Book>(`/api/v1/admin/books/${id}/file`, { url, file_name: fileName, size }),
  uploadServer: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient.post<Book>(`/api/v1/admin/books/${id}/file`, form, { timeout: 300_000 });
  },
  orders: (status?: string) =>
    apiClient.get<BookOrder[]>("/api/v1/admin/book-orders", { params: status ? { status } : undefined }),
  approveOrder: (id: string, reference?: string) => apiClient.post(`/api/v1/admin/book-orders/${id}/approve`, { reference }),
  rejectOrder: (id: string, reason?: string) => apiClient.post(`/api/v1/admin/book-orders/${id}/reject`, { reason }),
};

// ── WhatsApp (consent) ──
export type WhatsappSettings = {
  consent: boolean;
  consent_at: string | null;
  whatsapp_phone: string | null;
  suggested_phone: string | null;
};
export type WhatsappContact = {
  user_id: string;
  name: string;
  email: string;
  whatsapp_phone: string;
  consent_at: string | null;
  last_active_day: string | null;
  active_courses: number;
  pending_payments: number;
  message: string;
  wa_link: string;
};

export const whatsappApi = {
  get: () => apiClient.get<WhatsappSettings>("/api/v1/me/whatsapp"),
  set: (consent: boolean, phone?: string) =>
    apiClient.put<WhatsappSettings>("/api/v1/me/whatsapp", { consent, whatsapp_phone: phone }),
  contacts: (segment: string, days = 7, q?: string) =>
    apiClient.get<{ segment: string; days: number; total: number; data: WhatsappContact[] }>(
      "/api/v1/admin/whatsapp/contacts",
      { params: { segment, days, q: q || undefined } }
    ),
};

// ── Passkeys ──
export type Passkey = { id: string; name: string | null; created_at: string; last_used_at: string | null; synced: boolean };

export const passkeysApi = {
  list: () => apiClient.get<Passkey[]>("/api/v1/me/passkeys"),
  registerOptions: () =>
    apiClient.post<{ challenge_id: string; options: Record<string, unknown> }>("/api/v1/me/passkeys/options"),
  register: (challengeId: string, response: unknown, name: string) =>
    apiClient.post<Passkey>("/api/v1/me/passkeys", { challenge_id: challengeId, response, name }),
  remove: (id: string) => apiClient.delete(`/api/v1/me/passkeys/${id}`),
  loginOptions: () =>
    apiClient.post<{ challenge_id: string; options: Record<string, unknown> }>("/api/auth/passkey/login-options"),
  login: (challengeId: string, response: unknown) =>
    apiClient.post<{ access_token: string; token: string; refresh_token: string }>("/api/auth/passkey/login", {
      challenge_id: challengeId,
      response,
    }),
};
