"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BookOpen, Clock, CreditCard, DollarSign, GraduationCap, Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { OrdersTable, StatusPill, formatMoney } from "@/components/dashboard/orders-table";
import { ordersApi, type OrderList } from "@/services/api/orders";
import { paymentMethodLabel } from "@/lib/payment-labels";
import { useAuthStore } from "@/store/auth-store";
import { isAdminUser } from "@/lib/auth-routing";
import { getApiErrorMessage } from "@/lib/utils";

/**
 * Payments (A11): admins see every course AND book order (same table as Orders, all statuses) with
 * the money received for the current filters; students see their own course and book payments.
 * Both are paged on the server (10 per page).
 */
export default function PaymentsPage() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">Sign in to view payments.</div>;
  return isAdminUser(user) ? <AdminPayments /> : <MyPayments />;
}

function AdminPayments() {
  const [list, setList] = useState<OrderList | undefined>();
  const onData = useCallback((d: OrderList | undefined) => d && setList(d), []);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <CreditCard className="h-7 w-7 text-primary" /> Payments
        </h1>
        <p className="mt-1 text-muted-foreground">Every course and book payment — filter by status, type or search.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard icon={DollarSign} tone="bg-success-soft text-success" label="Received (current filters)">
          {!list ? "…" : list.received.length ? list.received.map((r) => <div key={r.currency}>{formatMoney(r.amount, r.currency)}</div>) : formatMoney(0, "USD")}
        </SummaryCard>
        <SummaryCard icon={Clock} tone="bg-warning-soft text-warning" label="Waiting for approval">
          {list ? list.counts.pending.toLocaleString() : "…"}
        </SummaryCard>
        <SummaryCard icon={Receipt} tone="bg-brand-soft text-brand" label="Orders (current filters)">
          {list ? list.counts.all.toLocaleString() : "…"}
        </SummaryCard>
      </div>
      <OrdersTable defaultStatus="all" onData={onData} />
    </div>
  );
}

function SummaryCard({ icon: Icon, tone, label, children }: { icon: typeof Clock; tone: string; label: string; children: React.ReactNode }) {
  return (
    <Card className="border-none shadow-sm">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`rounded-2xl p-3 ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <div className="space-y-0.5 text-2xl font-bold">{children}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function MyPayments() {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["my-orders", page],
    queryFn: () => ordersApi.mine({ page }).then((r) => r.data),
    placeholderData: keepPreviousData,
    refetchOnMount: "always",
  });
  const data = q.data;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <CreditCard className="h-7 w-7 text-primary" /> My payments
        </h1>
        <p className="mt-1 text-muted-foreground">Your course and book payments.</p>
      </div>
      {q.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : q.isError ? (
        <p className="text-sm text-destructive">{getApiErrorMessage(q.error, "Could not load your payments")}</p>
      ) : !data?.data.length ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            <CreditCard className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            No payments yet.
          </CardContent>
        </Card>
      ) : (
        <>
          {data.received.length ? (
            <p className="text-sm text-muted-foreground">
              Paid in total: <strong className="text-foreground">{data.received.map((r) => formatMoney(r.amount, r.currency)).join(" · ")}</strong>
            </p>
          ) : null}
          <div className="space-y-2">
            {data.data.map((o) => {
              const Icon = o.kind === "book" ? BookOpen : GraduationCap;
              const href = o.item_slug
                ? o.kind === "book"
                  ? `/books/${encodeURIComponent(o.item_slug)}`
                  : `/courses/${encodeURIComponent(o.item_slug)}`
                : null;
              return (
                <div key={`${o.kind}:${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/30">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {href ? (
                      <Link href={href} className="block truncate text-sm font-medium hover:underline">
                        {o.item_title}
                      </Link>
                    ) : (
                      <p className="truncate text-sm font-medium">{o.item_title}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {o.created_at ? new Date(o.paid_at ?? o.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}
                      <span className="ml-2">{paymentMethodLabel(o.provider)}</span>
                      {o.transaction_id ? <span className="ml-2 font-mono">{o.transaction_id}</span> : null}
                      {o.coupon_code ? <span className="ml-2">coupon {o.coupon_code}</span> : null}
                    </p>
                    {o.status_group === "failed" && o.note ? <p className="mt-0.5 text-xs text-destructive">{o.note}</p> : null}
                  </div>
                  <p className="whitespace-nowrap text-sm font-bold">{formatMoney(o.amount, o.currency)}</p>
                  <StatusPill o={o} />
                </div>
              );
            })}
          </div>
          <PaginationBar page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} noun="payments" />
        </>
      )}
    </div>
  );
}
