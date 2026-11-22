import apiClient from "./client";
import type { Payment, DataResponse } from "@/types";

export type InitiatePaymentBody = {
  coupon_code?: string;
  idempotency_key?: string;
  provider?: string;
  /** manual (EVC) request: the number the money was sent from */
  sender_phone?: string;
  /** manual (EVC) request: transaction id from the SMS */
  reference?: string;
};

export type WaafiPayResult = Payment & {
  outcome: "approved" | "declined" | "unknown";
  course_slug: string;
  message: string;
};

export const paymentsApi = {
  initiate: (courseId: string, body?: InitiatePaymentBody) =>
    apiClient.post<Payment>(`/api/v1/courses/${courseId}/payments`, body ?? {}),

  /** WaafiPay USSD purchase: resolves after the payer confirmed (or refused) with the PIN on the phone. */
  payWaafi: (courseId: string, body: { phone: string; coupon_code?: string }) =>
    apiClient.post<WaafiPayResult>(`/api/v1/courses/${courseId}/payments/waafi`, body, { timeout: 170_000 }),

  /** Admin: money received → mark paid and open the course. */
  approve: (paymentId: string, reference?: string) =>
    apiClient.post<{ ok: boolean }>(`/api/v1/payments/${paymentId}/complete`, reference ? { reference } : {}),

  /** Admin: money not received → mark the request failed. */
  reject: (paymentId: string, reason?: string) =>
    apiClient.post<{ ok: boolean }>(`/api/v1/payments/${paymentId}/reject`, reason ? { reason } : {}),

  /** Confirm a pending offline request: payment verified, or grant free (waiver) — see `mode`. */
  approveOfflineAdmin: (
    enrollmentId: string,
    body?: { mode?: "offline_paid" | "grant_free" }
  ) =>
    apiClient.post<{ status: string }>(
      `/api/v1/admin/enrollments/${enrollmentId}/approve-offline`,
      body ?? {}
    ),

  complete: (paymentId: string, providerPayId: string) =>
    apiClient.post<Payment>(`/api/v1/payments/${paymentId}/complete`, {
      provider_pay_id: providerPayId,
    }),

  refund: (paymentId: string, reason?: string) =>
    apiClient.post<Payment>(`/api/v1/payments/${paymentId}/refund`, { reason }),

  list: () => apiClient.get<DataResponse<Payment[]>>("/api/v1/payments"),

  /** Admin: all institute payments (optional server filters). */
  listAdmin: (params?: {
    user_id?: string;
    course_id?: string;
    status?: string;
    provider?: string;
  }) => {
    const sp = new URLSearchParams();
    if (params?.user_id) sp.set("user_id", params.user_id);
    if (params?.course_id) sp.set("course_id", params.course_id);
    if (params?.status) sp.set("status", params.status);
    if (params?.provider) sp.set("provider", params.provider);
    const q = sp.toString();
    return apiClient.get<DataResponse<Payment[]>>(
      `/api/v1/admin/payments${q ? `?${q}` : ""}`
    );
  },
};
