"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { paymentsApi } from "@/services/api/payments";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  DollarSign,
  Receipt,
  Search,
  Phone,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import type { Payment } from "@/types";
import { cn, getApiErrorMessage, getInitials } from "@/lib/utils";
import { paymentMethodLabel } from "@/lib/payment-labels";
import { useAuthStore } from "@/store/auth-store";
import { isAdminUser } from "@/lib/auth-routing";

const statusConfig: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  pending: { label: "Pending", icon: Clock, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  paid: { label: "Completed", icon: CheckCircle2, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  success: { label: "Completed", icon: CheckCircle2, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  completed: { label: "Completed", icon: CheckCircle2, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  failed: { label: "Failed", icon: XCircle, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  refunded: { label: "Refunded", icon: RotateCcw, color: "bg-orange-100 text-[#C44D00] dark:bg-orange-900/30 dark:text-[#FF8A66]" },
};

function parsePaymentListPayload(body: unknown): Payment[] {
  if (Array.isArray(body)) return body as Payment[];
  if (body && typeof body === "object" && "data" in body) {
    const d = (body as { data: unknown }).data;
    if (Array.isArray(d)) return d as Payment[];
  }
  return [];
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function isCompletedPayment(p: Payment) {
  return p.status === "paid" || p.status === "success" || p.status === "completed";
}

function sumByCurrency(
  rows: Payment[],
  pred: (p: Payment) => boolean
): { currency: string; totalMinor: number }[] {
  const m = new Map<string, number>();
  for (const p of rows) {
    if (!pred(p)) continue;
    const c = (p.currency || "USD").toUpperCase();
    m.set(c, (m.get(c) ?? 0) + p.amount);
  }
  return Array.from(m.entries()).map(([currency, totalMinor]) => ({ currency, totalMinor }));
}

/** Desktop columns: student | course | amount | method | status | date | action */
const TX_COLS =
  "md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(64px,auto)_minmax(0,150px)_minmax(0,auto)_minmax(0,auto)_84px]";

function paymentDate(p: Payment) {
  return new Date(p.paid_at || p.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function providerLabel(provider: string) {
  return paymentMethodLabel(provider);
}

export default function PaymentsPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminUser(user);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [studentFilter, setStudentFilter] = useState<string>("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [reviewing, setReviewing] = useState<Payment | null>(null);

  const myQuery = useQuery<Payment[]>({
    queryKey: ["my-payments"],
    queryFn: async () => {
      const res = await paymentsApi.list();
      return parsePaymentListPayload(res.data);
    },
    enabled: !!user && !isAdmin,
    refetchOnMount: "always",
  });

  const adminQuery = useQuery<Payment[]>({
    queryKey: ["admin-payments"],
    queryFn: async () => {
      const res = await paymentsApi.listAdmin();
      return parsePaymentListPayload(res.data);
    },
    enabled: !!user && isAdmin,
    refetchOnMount: "always",
  });

  const payments = isAdmin ? adminQuery.data : myQuery.data;
  const isLoading = isAdmin ? adminQuery.isLoading : myQuery.isLoading;
  const isError = isAdmin ? adminQuery.isError : myQuery.isError;
  const error = isAdmin ? adminQuery.error : myQuery.error;

  const studentOptions = useMemo(() => {
    if (!isAdmin || !payments?.length) return [] as { id: string; label: string }[];
    const m = new Map<string, string>();
    for (const p of payments) {
      const name = (p.student_name || "").trim();
      const email = (p.student_email || "").trim();
      if (!p.user_id) continue; // guest checkout
      const label = name ? (email ? `${name} (${email})` : name) : email || p.user_id;
      m.set(p.user_id, label);
    }
    return Array.from(m.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [isAdmin, payments]);

  const courseOptions = useMemo(() => {
    if (!isAdmin || !payments?.length) return [] as { id: string; label: string }[];
    const m = new Map<string, string>();
    for (const p of payments) {
      const title = (p.course_title || "").trim() || "Course";
      m.set(p.course_id, title);
    }
    return Array.from(m.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [isAdmin, payments]);

  const providers = useMemo(() => {
    const s = new Set<string>();
    (payments ?? []).forEach((p) => {
      if (p.provider) s.add(p.provider.toLowerCase());
    });
    return Array.from(s).sort();
  }, [payments]);

  const filtered = useMemo(() => {
    let rows = payments ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((p) => {
        const title = (p.course_title || "").toLowerCase();
        const tid = (p.transaction_id || "").toLowerCase();
        const stu = (p.student_name || "").toLowerCase();
        const sem = (p.student_email || "").toLowerCase();
        return (
          title.includes(q) ||
          tid.includes(q) ||
          p.course_id.toLowerCase().includes(q) ||
          stu.includes(q) ||
          sem.includes(q) ||
          (p.user_id ?? "").toLowerCase().includes(q)
        );
      });
    }
    if (isAdmin && studentFilter !== "all") {
      rows = rows.filter((p) => p.user_id === studentFilter);
    }
    if (isAdmin && courseFilter !== "all") {
      rows = rows.filter((p) => p.course_id === courseFilter);
    }
    if (statusFilter !== "all") {
      // "Completed" covers paid (database value) and the older success/completed names
      rows = rows.filter((p) =>
        statusFilter === "success" ? isCompletedPayment(p) : p.status === statusFilter
      );
    }
    if (providerFilter !== "all") {
      rows = rows.filter((p) => (p.provider || "").toLowerCase() === providerFilter);
    }
    return rows;
  }, [payments, search, statusFilter, providerFilter, studentFilter, courseFilter, isAdmin]);

  const spentByCurrency = useMemo(
    () =>
      sumByCurrency(filtered, isCompletedPayment),
    [filtered]
  );

  const refundedByCurrency = useMemo(
    () => sumByCurrency(filtered, (p) => p.status === "refunded"),
    [filtered]
  );

  if (!user) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-muted-foreground text-sm">
        Sign in to view payments.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CreditCard className="h-7 w-7 text-primary" />
          Payment History
        </h1>
        <p className="text-muted-foreground mt-1">
          {isAdmin
            ? "All institute transactions — filter by student, course, status, or method."
            : "View your payment transactions and receipts."}
        </p>
      </div>

      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load payments."}
        </p>
      )}

      {/* Summary Cards (reflects filtered list) */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-none shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Total spent (completed)</p>
              <div className="text-2xl font-bold space-y-0.5">
                {spentByCurrency.length === 0 ? (
                  <span>{formatAmount(0, "usd")}</span>
                ) : (
                  spentByCurrency.map(({ currency, totalMinor }) => (
                    <div key={currency}>{formatAmount(totalMinor, currency)}</div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-orange-100 dark:bg-orange-900/30">
              <RotateCcw className="h-5 w-5 text-[#0B1F3A]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Refunded</p>
              <div className="text-2xl font-bold space-y-0.5">
                {refundedByCurrency.length === 0 ? (
                  <span>{formatAmount(0, "usd")}</span>
                ) : (
                  refundedByCurrency.map(({ currency, totalMinor }) => (
                    <div key={currency}>{formatAmount(totalMinor, currency)}</div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-brand-soft">
              <Receipt className="h-5 w-5 text-brand" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Transactions (shown)</p>
              <p className="text-2xl font-bold">{filtered.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* title + filters */}
        <div className="space-y-4 border-b border-border p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold tracking-tight text-foreground">Transactions</h2>
            <span className="rounded-full bg-muted px-3 py-1 text-[12px] font-semibold text-muted-foreground">
              {filtered.length.toLocaleString()} shown
            </span>
          </div>
          <div
            className={cn(
              "grid gap-2.5 sm:grid-cols-2",
              isAdmin ? "lg:grid-cols-3 2md:grid-cols-5" : "lg:grid-cols-3",
            )}
          >
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search student, course, reference…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 rounded-xl pl-10"
              />
            </div>
            {isAdmin ? (
              <>
                <Select value={studentFilter} onValueChange={setStudentFilter}>
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue placeholder="Student" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All students</SelectItem>
                    {studentOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={courseFilter} onValueChange={setCourseFilter}>
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue placeholder="Course" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All courses</SelectItem>
                    {courseOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : null}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="success">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All methods</SelectItem>
                {providers.map((pr) => (
                  <SelectItem key={pr} value={pr}>
                    {providerLabel(pr)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className={cn(!isAdmin && "p-4 sm:p-5")}>
          {!filtered.length ? (
            <div className="py-14 text-center">
              <CreditCard className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-muted-foreground">
                {(payments?.length ?? 0) === 0 ? "No payments yet." : "No transactions match your filters."}
              </p>
            </div>
          ) : isAdmin ? (
            <>
              <div
                className={cn(
                  "hidden items-center gap-5 border-b border-border bg-muted/50 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground md:grid",
                  TX_COLS,
                )}
              >
                <span>Student</span>
                <span>Course</span>
                <span>Amount</span>
                <span>Method</span>
                <span>Status</span>
                <span className="text-right">Date</span>
                <span className="sr-only">Action</span>
              </div>
              <ul className="divide-y divide-border/70">
                {filtered.map((p) => {
                  const sc = statusConfig[p.status] ?? statusConfig.pending;
                  const StatusIcon = sc.icon;
                  const name = (p.student_name || "").trim();
                  const sub = (p.student_email || "").trim() || p.user_id || "Guest checkout";
                  const method = providerLabel(p.provider);
                  return (
                    <li
                      key={p.id}
                      className={cn(
                        "flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3.5 transition-colors hover:bg-muted/30 sm:px-5 md:grid",
                        TX_COLS,
                      )}
                    >
                      {/* student */}
                      <div className="flex w-full min-w-0 items-center gap-3 md:w-auto">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-navy/10 text-[11px] font-bold text-brand-navy dark:bg-white/10 dark:text-white">
                          {getInitials(name || sub)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-foreground" title={name}>
                            {name || "—"}
                          </p>
                          <p className="truncate text-[12px] text-muted-foreground" title={sub}>
                            {sub}
                          </p>
                        </div>
                      </div>

                      {/* course (+ reference underneath) */}
                      <div className="w-full min-w-0 md:w-auto">
                        <p className="truncate text-[13.5px] font-medium leading-snug text-foreground" title={p.course_title}>
                          {(p.course_title || "").trim() || "Course"}
                        </p>
                        {p.transaction_id ? (
                          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title={p.transaction_id}>
                            Ref: {p.transaction_id}
                          </p>
                        ) : null}
                      </div>

                      <p className="whitespace-nowrap text-[14px] font-bold text-foreground">
                        {formatAmount(p.amount, p.currency)}
                      </p>

                      <span
                        className="inline-flex max-w-full items-center gap-1.5 truncate rounded-lg bg-muted px-2.5 py-1 text-[12px] font-medium text-muted-foreground"
                        title={method}
                      >
                        <CreditCard className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{method}</span>
                      </span>
                      {p.payer_phone ? (
                        <span className="-mt-1 block font-mono text-[11px] text-muted-foreground md:hidden">{p.payer_phone}</span>
                      ) : null}

                      <Badge className={cn("w-fit gap-1 whitespace-nowrap rounded-full border-0 px-2.5 py-1", sc.color)}>
                        <StatusIcon className="h-3.5 w-3.5" />
                        {sc.label}
                      </Badge>

                      <p className="ml-auto whitespace-nowrap text-[13px] text-muted-foreground md:ml-0 md:text-right">
                        {paymentDate(p)}
                      </p>

                      <div className="flex justify-end">
                        {p.status === "pending" ? (
                          <Button
                            size="sm"
                            className="h-8 rounded-lg bg-brand-navy px-3 text-[12px] text-white hover:bg-brand-navy/90 dark:bg-white dark:text-brand-navy"
                            onClick={() => setReviewing(p)}
                          >
                            Review
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="space-y-2">
              {filtered.map((p) => {
                const sc = statusConfig[p.status] ?? statusConfig.pending;
                const StatusIcon = sc.icon;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-4 p-4 rounded-xl border hover:bg-accent/30 transition-colors"
                  >
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <CreditCard className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {p.course_title?.trim() ? p.course_title : "Course payment"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.paid_at
                          ? new Date(p.paid_at).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })
                          : new Date(p.created_at).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                        <span className="ml-2 text-[10px] uppercase tracking-wide">
                          {providerLabel(p.provider)}
                        </span>
                        {p.transaction_id && (
                          <span className="ml-2 font-mono text-[10px]">
                            {p.transaction_id.length > 28 ? `${p.transaction_id.slice(0, 28)}…` : p.transaction_id}
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="font-bold text-sm whitespace-nowrap">
                      {formatAmount(p.amount, p.currency)}
                    </p>
                    <Badge className={cn("border-0 gap-1 shrink-0", sc.color)}>
                      <StatusIcon className="h-3 w-3" />
                      {sc.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <ReviewPaymentDialog payment={reviewing} onClose={() => setReviewing(null)} />
    </div>
  );
}

/** Admin: check a pending payment (manual EVC request or an unconfirmed WaafiPay charge) and approve or reject it. */
function ReviewPaymentDialog({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reference, setReference] = useState("");
  const [confirmReject, setConfirmReject] = useState(false);

  const done = async (msg: string) => {
    toast.success(msg);
    setReference("");
    setConfirmReject(false);
    onClose();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-enrollments"] }),
    ]);
  };
  const approve = useMutation({
    mutationFn: (p: Payment) => paymentsApi.approve(p.id, reference.trim() || undefined),
    onSuccess: () => done("Payment approved — the course is now open for the student."),
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, "Could not approve")),
  });
  const reject = useMutation({
    mutationFn: (p: Payment) => paymentsApi.reject(p.id, "Payment not received"),
    onSuccess: () => done("Payment request rejected."),
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, "Could not reject")),
  });
  const busy = approve.isPending || reject.isPending;
  const p = payment;
  const isWaafi = (p?.provider || "").toLowerCase() === "wafi";

  return (
    <Dialog
      open={!!p}
      onOpenChange={(o) => {
        if (!o && !busy) {
          setReference("");
          setConfirmReject(false);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand" /> Review payment
          </DialogTitle>
          <DialogDescription>
            {isWaafi
              ? "WaafiPay did not confirm this charge. Check the WaafiPay merchant report for the reference below before approving."
              : "Check that the money arrived on the institute EVC number before approving."}
          </DialogDescription>
        </DialogHeader>
        {p ? (
          <dl className="space-y-2 rounded-xl border border-border bg-muted/40 p-4 text-[13.5px]">
            <Row label="Student" value={p.student_name || p.student_email || "—"} />
            <Row label="Course" value={p.course_title || "—"} />
            <Row label="Amount" value={formatAmount(p.amount, p.currency)} strong />
            <Row label="Method" value={providerLabel(p.provider)} />
            <Row
              label={isWaafi ? "Payer number" : "Sent from"}
              value={
                p.payer_phone ? (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Phone className="h-3.5 w-3.5" />
                    {p.payer_phone}
                  </span>
                ) : (
                  "not given"
                )
              }
            />
            {p.transaction_id ? <Row label="Transaction ID" value={<span className="font-mono">{p.transaction_id}</span>} /> : null}
            {isWaafi ? <Row label="WaafiPay reference" value={<span className="font-mono text-[12px]">{p.id}</span>} /> : null}
            <Row label="Requested" value={new Date(p.created_at).toLocaleString("en-US")} />
          </dl>
        ) : null}
        {!p?.transaction_id ? (
          <div className="space-y-1.5">
            <Label htmlFor="approve-ref" className="text-xs">
              Transaction ID <span className="font-normal text-muted-foreground">(optional, saved with the payment)</span>
            </Label>
            <Input
              id="approve-ref"
              value={reference}
              maxLength={64}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. from the EVC SMS"
              className="h-10"
            />
          </div>
        ) : null}
        <DialogFooter className="gap-2 sm:justify-between">
          {confirmReject ? (
            <Button variant="destructive" disabled={busy} onClick={() => p && reject.mutate(p)}>
              {reject.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
              Yes, reject
            </Button>
          ) : (
            <Button variant="outline" disabled={busy} className="text-destructive" onClick={() => setConfirmReject(true)}>
              <XCircle className="mr-2 h-4 w-4" /> Reject
            </Button>
          )}
          <Button className="bg-success text-white hover:bg-success/90" disabled={busy} onClick={() => p && approve.mutate(p)}>
            {approve.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Approve &amp; open course
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 text-right", strong ? "font-bold text-foreground" : "text-foreground")}>{value}</dd>
    </div>
  );
}
