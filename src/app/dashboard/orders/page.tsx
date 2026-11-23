"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Clock, Inbox, Loader2, Phone, RefreshCw, ShoppingBag, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { paymentsApi } from "@/services/api/payments";
import type { Payment } from "@/types";
import { cn, getApiErrorMessage, getInitials } from "@/lib/utils";
import { paymentMethodLabel } from "@/lib/payment-labels";
import { useAuthStore } from "@/store/auth-store";
import { isAdminUser } from "@/lib/auth-routing";

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: (currency || "USD").toUpperCase() }).format(amount / 100);
}

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** wa.me wants the full international number without "+" or spaces. */
function waNumber(phone?: string) {
  const d = (phone || "").replace(/\D/g, "");
  if (/^252\d{9}$/.test(d)) return d;
  if (/^\d{9}$/.test(d)) return `252${d}`;
  if (/^0\d{9}$/.test(d)) return `252${d.slice(1)}`;
  return null;
}

/** Admin: every order still waiting for a decision (manual EVC requests and unconfirmed WaafiPay charges). */
export default function OrdersPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminUser(user);

  const q = useQuery({
    queryKey: ["admin-pending-orders"],
    queryFn: () => paymentsApi.listPendingAdmin().then((r) => r.data),
    enabled: !!user && isAdmin,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  if (user && !isAdmin) {
    return <p className="p-6 text-muted-foreground">Only administrators can see orders.</p>;
  }

  const orders = q.data?.data ?? [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-3xl font-bold tracking-tight">
            <ShoppingBag className="h-7 w-7 text-brand" /> Orders
          </h1>
          <p className="mt-1 text-muted-foreground">
            Pending orders waiting for you. Check the money arrived, then approve to open the course for the student.
          </p>
        </div>
        <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={cn("mr-2 h-4 w-4", q.isFetching && "animate-spin")} /> Refresh
        </Button>
      </div>

      <div className="inline-flex items-center gap-2 rounded-full border border-warning/40 bg-warning-soft px-3.5 py-1.5 text-sm font-semibold text-warning">
        <Clock className="h-4 w-4" />
        {q.isLoading ? "…" : q.data?.total ?? 0} pending
      </div>

      {q.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : q.isError ? (
        <p className="text-destructive">{getApiErrorMessage(q.error, "Could not load orders")}</p>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card py-16 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/60" />
          <p className="font-semibold">No pending orders</p>
          <p className="text-sm text-muted-foreground">New manual payment orders will appear here.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        All payments (approved, failed, refunded) are on the{" "}
        <Link href="/dashboard/payments" className="font-medium text-brand hover:underline">
          Payments
        </Link>{" "}
        page.
      </p>
    </div>
  );
}

function OrderCard({ order: o }: { order: Payment }) {
  const queryClient = useQueryClient();
  const [reference, setReference] = useState("");
  const [confirmReject, setConfirmReject] = useState(false);
  const isWaafi = (o.provider || "").toLowerCase() === "wafi";

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-pending-orders"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-pending-count"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-enrollments"] }),
    ]);
  const approve = useMutation({
    mutationFn: () => paymentsApi.approve(o.id, reference.trim() || undefined),
    onSuccess: async () => {
      toast.success("Approved — the course is now open for the student.");
      await refresh();
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, "Could not approve")),
  });
  const reject = useMutation({
    mutationFn: () => paymentsApi.reject(o.id, "Payment not received"),
    onSuccess: async () => {
      toast.success("Order rejected.");
      await refresh();
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, "Could not reject")),
  });
  const busy = approve.isPending || reject.isPending;

  const contactPhone = o.payer_phone || o.student_phone;
  const wa = waNumber(contactPhone);
  const waText = encodeURIComponent(
    `Asc ${o.student_name || ""}, waxaan ka hadlaynaa dalabkaaga Laambad: ${o.course_title || ""} (${formatAmount(o.amount, o.currency)}).`
  );
  const name = o.student_name || o.student_email || "Student";

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-navy/10 text-sm font-bold text-brand-navy dark:bg-white/10 dark:text-white">
          {getInitials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{name}</p>
          {o.student_email ? <p className="truncate text-[13px] text-muted-foreground">{o.student_email}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">{formatAmount(o.amount, o.currency)}</p>
          <p className="text-[12px] text-muted-foreground" title={new Date(o.created_at).toLocaleString("en-US")}>
            {timeAgo(o.created_at)}
          </p>
        </div>
      </div>

      <dl className="mt-4 space-y-1.5 rounded-xl bg-muted/50 p-3.5 text-[13.5px]">
        <div className="flex justify-between gap-4">
          <dt className="shrink-0 text-muted-foreground">Course</dt>
          <dd className="min-w-0 truncate text-right font-medium" title={o.course_title}>
            {o.course_title || "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Method</dt>
          <dd>{isWaafi ? "WaafiPay (not confirmed)" : paymentMethodLabel(o.provider)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{isWaafi ? "Payer number" : "Sent from"}</dt>
          <dd className="inline-flex items-center gap-1 font-mono">
            {o.payer_phone ? (
              <>
                <Phone className="h-3.5 w-3.5" /> {o.payer_phone}
              </>
            ) : (
              <span className="font-sans text-muted-foreground">not given</span>
            )}
          </dd>
        </div>
        {o.transaction_id ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Transaction ID</dt>
            <dd className="font-mono">{o.transaction_id}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Order</dt>
          <dd className="font-mono text-[12px]">{o.id.slice(0, 8)}</dd>
        </div>
      </dl>

      {!o.transaction_id ? (
        <Input
          className="mt-3 h-10"
          placeholder="Transaction ID (optional, from the EVC SMS)"
          maxLength={64}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button className="flex-1 bg-success text-white hover:bg-success/90" disabled={busy} onClick={() => approve.mutate()}>
          {approve.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
          Approve
        </Button>
        {confirmReject ? (
          <Button variant="destructive" disabled={busy} onClick={() => reject.mutate()}>
            {reject.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
            Yes, reject
          </Button>
        ) : (
          <Button variant="outline" className="text-destructive" disabled={busy} onClick={() => setConfirmReject(true)}>
            <XCircle className="mr-2 h-4 w-4" /> Reject
          </Button>
        )}
        {wa ? (
          <a
            href={`https://wa.me/${wa}?text=${waText}`}
            target="_blank"
            rel="noopener noreferrer"
            title="WhatsApp the student"
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-[#25D366] px-3.5 text-sm font-semibold text-white transition hover:bg-[#1ebe57]"
          >
            <Phone className="h-4 w-4" /> WhatsApp
          </a>
        ) : null}
      </div>
    </div>
  );
}
