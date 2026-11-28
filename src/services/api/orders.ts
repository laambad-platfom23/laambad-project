/** A11 — one list of orders (courses + books), coupons for admins. */
import apiClient from "./client";

export type OrderKind = "course" | "book";
export type OrderStatusGroup = "pending" | "completed" | "failed" | "refunded" | "all";

export type Order = {
  kind: OrderKind;
  id: string;
  item_id: string;
  item_title: string;
  item_slug: string | null;
  /** cents */
  amount: number;
  currency: string;
  status: string;
  status_group: Exclude<OrderStatusGroup, "all">;
  provider: string;
  payer_phone: string | null;
  transaction_id: string | null;
  coupon_code: string | null;
  note: string | null;
  created_at: string | null;
  paid_at: string | null;
  // admin only
  user_id?: string | null;
  student_name?: string | null;
  student_email?: string | null;
  student_phone?: string | null;
};

export type OrderList = {
  data: Order[];
  total: number;
  page: number;
  page_size: number;
  counts: Record<OrderStatusGroup, number>;
  /** money received (completed orders) in the current view */
  received: { currency: string; amount: number }[];
};

export type OrderQuery = { status?: OrderStatusGroup; type?: OrderKind | "all"; q?: string; page?: number };

const params = (q: OrderQuery) => ({
  status: q.status && q.status !== "all" ? q.status : undefined,
  type: q.type && q.type !== "all" ? q.type : undefined,
  q: q.q?.trim() || undefined,
  page: q.page ?? 1,
});

export const ordersApi = {
  admin: (q: OrderQuery) => apiClient.get<OrderList>("/api/v1/admin/orders", { params: params(q) }),
  mine: (q: OrderQuery) => apiClient.get<OrderList>("/api/v1/my/orders", { params: params(q) }),
  approve: (o: Pick<Order, "kind" | "id">, reference?: string) =>
    apiClient.post(`/api/v1/admin/orders/${o.kind}/${o.id}/approve`, reference ? { reference } : {}),
  reject: (o: Pick<Order, "kind" | "id">, reason?: string) =>
    apiClient.post(`/api/v1/admin/orders/${o.kind}/${o.id}/reject`, reason ? { reason } : {}),
  coupon: (o: Pick<Order, "kind" | "id">, code: string) =>
    apiClient.post<{ ok: boolean; status: string; amount: number }>(`/api/v1/admin/orders/${o.kind}/${o.id}/coupon`, { code }),
};

export type CouponScope = "all" | "courses" | "books";
export type Coupon = {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_percent: number | null;
  /** cents */
  discount_amount: number | null;
  applies_to: CouponScope;
  expires_at: string | null;
  usage_limit: number | null;
  usage_count: number;
  is_active: boolean;
  expired: boolean;
  used_up: boolean;
  created_at: string | null;
};
export type CouponInput = {
  code: string;
  discount_type: "percent" | "fixed";
  /** percent 1–100, or cents for a fixed amount */
  value: number;
  applies_to: CouponScope;
  expires_at: string | null;
  usage_limit: number | null;
  is_active: boolean;
};

export const couponsApi = {
  list: (q: { q?: string; status?: "active" | "inactive" | "all"; page?: number }) =>
    apiClient.get<{ data: Coupon[]; total: number; page: number }>("/api/v1/admin/coupons", {
      params: { q: q.q?.trim() || undefined, status: q.status && q.status !== "all" ? q.status : undefined, page: q.page ?? 1 },
    }),
  create: (data: CouponInput) => apiClient.post<Coupon>("/api/v1/admin/coupons", data),
  update: (id: string, data: Partial<CouponInput>) => apiClient.patch<Coupon>(`/api/v1/admin/coupons/${id}`, data),
  remove: (id: string) => apiClient.delete(`/api/v1/admin/coupons/${id}`),
};
