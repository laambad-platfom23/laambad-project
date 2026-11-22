import apiClient from "./client";
import type {
  Certificate,
  CertificateVerifyResponse,
  DataResponse,
} from "@/types";

export const certificatesApi = {
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
