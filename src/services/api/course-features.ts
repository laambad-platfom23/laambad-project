/** A5: course approval, prerequisites, certificate templates, bundles, live sessions (Google Meet). */
import apiClient, { personalGet } from "./client";
import type { CertificateDesign } from "@/lib/certificate-render";

// ── course review ──
export type ReviewItem = {
  id: string;
  title: string;
  slug: string;
  status: string;
  submitted_at: string | null;
  instructor: { id: string; name: string; email: string };
  sections: number;
  lessons: number;
  price: number | null;
};
export const reviewApi = {
  queue: () => apiClient.get<ReviewItem[]>("/api/v1/admin/course-reviews"),
  count: () => apiClient.get<{ total: number }>("/api/v1/admin/course-reviews/count"),
  approve: (id: string, note?: string) => apiClient.post(`/api/v1/courses/${id}/approve`, { note }),
  reject: (id: string, note: string) => apiClient.post(`/api/v1/courses/${id}/reject`, { note }),
};

// ── prerequisites ──
export type PrereqCourse = { id: string; title: string; slug: string; status: string };
export const prereqApi = {
  get: (courseId: string) => apiClient.get<{ data: PrereqCourse[]; missing: PrereqCourse[] }>(`/api/v1/courses/${courseId}/prerequisites`),
  set: (courseId: string, ids: string[]) => apiClient.put<{ data: PrereqCourse[] }>(`/api/v1/courses/${courseId}/prerequisites`, { course_ids: ids }),
};

// ── certificate templates ──
export type CertTemplate = {
  id: string;
  name: string;
  design: Partial<CertificateDesign>;
  is_default: boolean;
  course_count?: number;
  created_at: string;
  updated_at: string;
};
export const certTemplateApi = {
  list: () => apiClient.get<CertTemplate[]>("/api/v1/certificate-templates"),
  create: (name: string, design: Partial<CertificateDesign>) => apiClient.post<CertTemplate>("/api/v1/certificate-templates", { name, design }),
  update: (id: string, name: string, design: Partial<CertificateDesign>) =>
    apiClient.patch<CertTemplate>(`/api/v1/certificate-templates/${id}`, { name, design }),
  remove: (id: string) => apiClient.delete(`/api/v1/certificate-templates/${id}`),
};

// ── bundles ──
export type BundleCourse = { id: string; title: string; slug: string; status: string; instructor_name: string | null; cover_url: string | null; price: number };
export type Bundle = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_url: string | null;
  price: number;
  sale_price: number | null;
  effective_price: number;
  courses_value: number;
  currency: string;
  status: string;
  course_count: number;
  courses: BundleCourse[];
  owned?: boolean;
  pending?: boolean;
  owned_courses?: number;
};
export type BundleInput = {
  title?: string;
  description?: string | null;
  cover_url?: string | null;
  price?: number;
  sale_price?: number | null;
  status?: "draft" | "published";
  course_ids?: string[];
};
export type BundleOrder = {
  id: string;
  bundle_id: string;
  bundle_title: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  student_name: string;
  student_email: string;
  payer_phone?: string;
  transaction_id?: string;
  note?: string;
  created_at: string;
};
export const bundleApi = {
  list: () => personalGet<Bundle[]>("/api/v1/bundles", "/api/bundles"),
  get: (slug: string) => personalGet<Bundle>(`/api/v1/bundles/${encodeURIComponent(slug)}`, `/api/bundles/${encodeURIComponent(slug)}`),
  enrollFree: (id: string) => apiClient.post(`/api/v1/bundles/${id}/enroll`),
  payWaafi: (id: string, phone: string) =>
    apiClient.post<{ outcome: "approved" | "declined" | "unknown"; message: string }>(`/api/v1/bundles/${id}/pay/waafi`, { phone }, { timeout: 160_000 }),
  payManual: (id: string, senderPhone: string, reference?: string) => apiClient.post(`/api/v1/bundles/${id}/pay/manual`, { sender_phone: senderPhone, reference }),
  create: (data: BundleInput) => apiClient.post<Bundle>("/api/v1/admin/bundles", data),
  update: (id: string, data: BundleInput) => apiClient.patch<Bundle>(`/api/v1/admin/bundles/${id}`, data),
  remove: (id: string) => apiClient.delete(`/api/v1/admin/bundles/${id}`),
  orders: (status?: string) => apiClient.get<BundleOrder[]>("/api/v1/admin/bundle-orders", { params: status ? { status } : undefined }),
  approve: (id: string) => apiClient.post(`/api/v1/admin/bundle-orders/${id}/approve`, {}),
  reject: (id: string) => apiClient.post(`/api/v1/admin/bundle-orders/${id}/reject`, {}),
};

// ── live sessions ──
export type LiveSession = {
  id: string;
  course_id: string;
  course_title?: string;
  course_slug?: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  duration_min: number;
  status: string;
  is_live: boolean;
  is_past: boolean;
  meet_url: string | null;
  has_link: boolean;
  google_event: boolean;
};
export type GoogleStatus = { configured: boolean; connected: boolean; email: string | null; connected_at: string | null };
export const liveApi = {
  mine: () => apiClient.get<LiveSession[]>("/api/v1/live-sessions"),
  forCourse: (courseId: string) => apiClient.get<{ is_staff: boolean; data: LiveSession[] }>(`/api/v1/courses/${courseId}/live-sessions`),
  create: (courseId: string, data: { title: string; description?: string; starts_at: string; duration_min: number; meet_url?: string }) =>
    apiClient.post<LiveSession>(`/api/v1/courses/${courseId}/live-sessions`, data, { timeout: 60_000 }),
  cancel: (id: string) => apiClient.delete(`/api/v1/live-sessions/${id}`),
  googleStatus: () => apiClient.get<GoogleStatus>("/api/v1/google/status"),
  googleConnect: () => apiClient.post<{ url: string }>("/api/v1/google/connect"),
  googleDisconnect: () => apiClient.delete("/api/v1/google/connection"),
};

export function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
