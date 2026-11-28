import apiClient from "./client";
import type {
  Certificate,
  CertificateVerifyResponse,
  DataResponse,
} from "@/types";

/** Phase 2: lessons + quizzes + assignments that stand between the student and the certificate */
export type CertificateRequirements = {
  lessons: { done: number; total: number };
  quizzes: { passed: number; total: number; left: { id: string; title: string }[] };
  assignments: {
    passed: number;
    total: number;
    pending: { id: string; title: string }[];
    left: { id: string; title: string; status: "not_submitted" | "not_passed" }[];
  };
  ready: boolean;
  message: string;
  gives_certificate?: boolean;
  certificate_id?: string | null;
};
export type CertificateProgress = CertificateRequirements & {
  course: { id: string; title: string; slug: string; cover_image_url: string | null };
};

export const certificatesApi = {
  requirements: (courseId: string) => apiClient.get<CertificateRequirements>(`/api/v1/courses/${courseId}/certificate/requirements`),
  /** courses I started, with what is left before their certificate */
  progress: () => apiClient.get<{ data: CertificateProgress[] }>("/api/v1/my/certificate-progress"),

  list: () =>
    apiClient.get<DataResponse<Certificate[]>>("/api/v1/certificates"),

  get: (id: string) =>
    apiClient.get<Certificate>(`/api/v1/certificates/${id}`),

  issue: (courseId: string) =>
    apiClient.post<Certificate>(`/api/v1/courses/${courseId}/certificate`),

  verify: (verificationId: string) =>
    apiClient.get<CertificateVerifyResponse>(
      `/api/certificates/verify/${verificationId}`
    ),
};
