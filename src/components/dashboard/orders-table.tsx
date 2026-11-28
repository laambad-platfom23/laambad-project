"use client";

/**
 * A11 (Phase 2 test): admin orders — course AND book orders in one table, server-side paging
 * (10 per page), status tabs with counts, type filter, search, and Review (approve / reject /
 * coupon / WhatsApp). Used by /dashboard/orders (opens on "Pending") and /dashboard/payments ("All").
 */
import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, Clock, GraduationCap, Loader2, Phone, RefreshCw, RotateCcw, Search, Tag, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { ordersApi, type Order, type OrderKind, type OrderList, type OrderStatusGroup } from "@/services/api/orders";
import { paymentMethodLabel } from "@/lib/payment-labels";
import { cn, getApiErrorMessage, getInitials } from "@/lib/utils";

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: (currency || "USD").toUpperCase() }).format(amount / 100);
}

function shortDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const TABS: { key: OrderStatusGroup; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed / rejected" },
  { key: "refunded", label: "Refunded" },
  { key: "all", label: "All" },
];

export const STATUS_STYLE: Record<Exclude<OrderStatusGroup, "all">, { label: string; cls: string; icon: typeof Clock }> = {
  pending: { label: "Pending", cls: "bg-warning-soft text-warning", icon: Clock },
  completed: { label: "Completed", cls: "bg-success-soft text-success", icon: CheckCircle2 },
  failed: { label: "Failed", cls: "bg-destructive/10 text-destructive", icon: XCircle },
  refunded: { label: "Refunded", cls: "bg-muted text-muted-foreground", icon: RotateCcw },
};

export function StatusPill({ o }: { o: Pick<Order, "status_group" | "status"> }) {
  const st = STATUS_STYLE[o.status_group];
  const Icon = st.icon;
  return (
    <Badge className={cn("w-fit gap-1 whitespace-nowrap rounded-full border-0 px-2.5 py-1", st.cls)} title={o.status}>
      <Icon className="h-3.5 w-3.5" />
      {o.status === "cancelled" || o.status === "canceled" ? "Cancelled" : st.label}
    </Badge>
  );
}

export function KindTag({ kind }: { kind: OrderKind }) {
  const Icon = kind === "book" ? BookOpen : GraduationCap;
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3 w-3" /> {kind === "book" ? "Book" : "Course"}
    </span>
  );
}

/** wa.me wants the full international number without "+" or spaces. */
function waNumber(phone?: string | null) {
  const d = (phone || "").replace(/\D/g, "");
  if (/^252\d{9}$/.test(d)) return d;
  if (/^\d{9}$/.test(d)) return `252${d}`;
  if (/^0\d{9}$/.test(d)) return `252${d.slice(1)}`;
  return null;
}

export function OrdersTable({
  defaultStatus,
  onData,
  fixedType,
}: {
  defaultStatus: OrderStatusGroup;
  onData?: (d: OrderList | undefined) => void;
  /** only course or only book orders (no type filter shown) */
  fixedType?: OrderKind;
}) {
  const [status, setStatus] = useState<OrderStatusGroup>(defaultStatus);
  const [type, setType] = useState<OrderKind | "all">(fixedType ?? "all");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Order | null>(null);

  // search as you type, without a request per key
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const query = useQuery({
    queryKey: ["admin-orders", status, type, q, page],
    queryFn: () => ordersApi.admin({ status, type, q, page }).then((r) => r.data),
    placeholderData: keepPreviousData,
    refetchInterval: status === "pending" ? 30_000 : false,
  });
  const data = query.data;
  useEffect(() => onData?.(data), [data, onData]);

  const pick = (s: OrderStatusGroup) => {
    setStatus(s);
    setPage(1);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="space-y-3 border-b border-border p-3 sm:p-4">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => pick(t.key)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                status === t.key ? "bg-brand-navy text-white dark:bg-white dark:text-brand-navy" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  status === t.key ? "bg-white/20" : t.key === "pending" && (data?.counts.pending ?? 0) > 0 ? "bg-warning-soft text-warning" : "bg-muted"
                )}
              >
                {data ? data.counts[t.key].toLocaleString() : "…"}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student, course, book, phone, reference, coupon…"
              className="h-10 rounded-xl pl-9"
            />
          </div>
          {fixedType ? null : (
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v as OrderKind | "all");
                setPage(1);
              }}
            >
              <SelectTrigger className="h-10 w-[150px] rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Courses &amp; books</SelectItem>
                <SelectItem value="course">Courses</SelectItem>
                <SelectItem value="book">Books</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl" onClick={() => query.refetch()} disabled={query.isFetching} aria-label="Refresh">
            <RefreshCw className={cn("h-4 w-4", query.isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <p className="p-6 text-sm text-destructive">{getApiErrorMessage(query.error, "Could not load the orders")}</p>
      ) : !data?.data.length ? (
        <div className="py-16 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 font-medium">{status === "pending" ? "No orders are waiting." : "No orders match."}</p>
          {q ? <p className="mt-1 text-sm text-muted-foreground">Try another search.</p> : null}
        </div>
      ) : (
        <>
          <div className="hidden grid-cols-[110px_minmax(0,1.2fr)_minmax(0,1.4fr)_90px_minmax(0,0.9fr)_110px_84px] items-center gap-4 border-b border-border bg-muted/50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground lg:grid">
            <span>Order</span>
            <span>Student</span>
            <span>Item</span>
            <span>Total</span>
            <span>Method</span>
            <span>Status</span>
            <span className="sr-only">Action</span>
          </div>
          <ul className={cn("divide-y divide-border/70", query.isFetching && "opacity-70 transition-opacity")}>
            {data.data.map((o) => (
              <li
                key={`${o.kind}:${o.id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 px-4 py-3.5 transition-colors hover:bg-muted/30 sm:px-5 lg:grid-cols-[110px_minmax(0,1.2fr)_minmax(0,1.4fr)_90px_minmax(0,0.9fr)_110px_84px] lg:items-center"
              >
                <div className="order-2 text-right lg:order-none lg:text-left">
                  <p className="font-mono text-[12px] text-muted-foreground">#{o.id.slice(0, 8)}</p>
                  <p className="text-[12.5px]">{shortDate(o.created_at)}</p>
                </div>
                <div className="order-1 flex min-w-0 items-center gap-2.5 lg:order-none">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-navy/10 text-[11px] font-bold text-brand-navy dark:bg-white/10 dark:text-white">
                    {getInitials(o.student_name || o.student_email || "?")}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">{o.student_name || "—"}</p>
                    <p className="truncate text-[12px] text-muted-foreground">{o.student_email || o.payer_phone || ""}</p>
                  </div>
                </div>
                <div className="order-3 col-span-2 min-w-0 lg:order-none lg:col-span-1">
                  <KindTag kind={o.kind} />
                  <p className="truncate text-[13.5px] font-medium" title={o.item_title}>
                    {o.item_title}
                  </p>
                  {o.coupon_code ? (
                    <p className="inline-flex items-center gap-1 text-[11.5px] text-brand">
                      <Tag className="h-3 w-3" /> {o.coupon_code}
                    </p>
                  ) : null}
                </div>
                <p className="order-4 text-[14px] font-bold lg:order-none">{formatMoney(o.amount, o.currency)}</p>
                <p className="order-5 truncate text-[12.5px] text-muted-foreground lg:order-none">{paymentMethodLabel(o.provider)}</p>
                <div className="order-6 lg:order-none">
                  <StatusPill o={o} />
                </div>
                <div className="order-7 flex justify-end lg:order-none">
                  <Button
                    size="sm"
                    variant={o.status_group === "pending" ? "default" : "outline"}
                    className={cn("h-8 rounded-lg px-3 text-[12px]", o.status_group === "pending" && "bg-brand-navy text-white hover:bg-brand-navy/90 dark:bg-white dark:text-brand-navy")}
                    onClick={() => setOpen(o)}
                  >
                    {o.status_group === "pending" ? "Review" : "Details"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <PaginationBar className="border-t border-border p-3 sm:px-5" page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} noun="orders" />
        </>
      )}
      <OrderDialog order={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right font-medium", mono && "font-mono text-[12.5px]")}>{value}</dd>
    </div>
  );
}

/** Review an order: details, approve / reject, a coupon (free or discounted), WhatsApp the student. */
function OrderDialog({ order: o, onClose }: { order: Order | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [reference, setReference] = useState("");
  const [code, setCode] = useState("");
  const [confirmReject, setConfirmReject] = useState(false);
  useEffect(() => {
    setReference("");
    setCode("");
    setConfirmReject(false);
  }, [o?.id]);

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["admin-orders"] }),
      qc.invalidateQueries({ queryKey: ["admin-pending-count"] }),
      qc.invalidateQueries({ queryKey: ["admin-enrollments"] }),
    ]);
  const what = o?.kind === "book" ? "book" : "course";
  const approve = useMutation({
    mutationFn: () => ordersApi.approve(o!, reference.trim() || undefined),
    onSuccess: async () => {
      toast.success(`Approved — the ${what} is open for the student.`);
      await refresh();
      onClose();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not approve")),
  });
  const reject = useMutation({
    mutationFn: () => ordersApi.reject(o!, "Payment not received"),
    onSuccess: async () => {
      toast.success("Order rejected — the student was told.");
      await refresh();
      onClose();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not reject")),
  });
  const coupon = useMutation({
    mutationFn: () => ordersApi.coupon(o!, code.trim()).then((r) => r.data),
    onSuccess: async (r) => {
      if (r.status === "paid") {
        toast.success(`Coupon applied — free. The ${what} is open for the student.`);
        await refresh();
        onClose();
      } else {
        toast.success(`Coupon applied — the student now pays ${formatMoney(r.amount, o!.currency)}.`);
        await refresh();
        onClose();
      }
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not apply the coupon")),
  });
  const busy = approve.isPending || reject.isPending || coupon.isPending;
  const pending = o?.status_group === "pending";
  const wa = waNumber(o?.payer_phone || o?.student_phone);
  const waText = o
    ? encodeURIComponent(`Asc ${o.student_name || ""}, waxaan ka hadlaynaa dalabkaaga Laambad: ${o.item_title} (${formatMoney(o.amount, o.currency)}).`)
    : "";

  return (
    <Dialog open={!!o} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-md">
        {o ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Order <span className="font-mono text-base text-muted-foreground">#{o.id.slice(0, 8)}</span>
              </DialogTitle>
              <DialogDescription asChild>
                {/* a <div>: the status badge is a <div> and may not sit inside the default <p> */}
                <div className="flex items-center gap-2">
                  <StatusPill o={o} /> <KindTag kind={o.kind} />
                </div>
              </DialogDescription>
            </DialogHeader>
            <dl className="space-y-1.5 rounded-xl bg-muted/50 p-3.5 text-[13.5px]">
              <Row label="Student" value={o.student_name || "—"} />
              {o.student_email ? <Row label="E-mail" value={o.student_email} /> : null}
              <Row label={o.kind === "book" ? "Book" : "Course"} value={o.item_title} />
              <Row label="Total" value={formatMoney(o.amount, o.currency)} />
              <Row label="Method" value={paymentMethodLabel(o.provider)} />
              {o.payer_phone ? (
                <Row
                  label="Paid from"
                  value={
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Phone className="h-3.5 w-3.5" /> {o.payer_phone}
                    </span>
                  }
                />
              ) : null}
              {o.transaction_id ? <Row label="Reference" value={o.transaction_id} mono /> : null}
              {o.coupon_code ? <Row label="Coupon" value={o.coupon_code} mono /> : null}
              <Row label="Ordered" value={o.created_at ? new Date(o.created_at).toLocaleString("en-GB") : "—"} />
              {o.paid_at ? <Row label="Paid" value={new Date(o.paid_at).toLocaleString("en-GB")} /> : null}
              {o.note ? <Row label="Note" value={o.note} /> : null}
            </dl>

            {pending ? (
              <div className="space-y-3">
                {!o.transaction_id ? (
                  <Input placeholder="Transaction ID / bank reference (optional)" maxLength={64} value={reference} onChange={(e) => setReference(e.target.value)} />
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button className="flex-1 bg-success text-white hover:bg-success/90" disabled={busy} onClick={() => approve.mutate()}>
                    {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve
                  </Button>
                  {confirmReject ? (
                    <Button variant="destructive" disabled={busy} onClick={() => reject.mutate()}>
                      {reject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Yes, reject
                    </Button>
                  ) : (
                    <Button variant="outline" className="text-destructive" disabled={busy} onClick={() => setConfirmReject(true)}>
                      <XCircle className="h-4 w-4" /> Reject
                    </Button>
                  )}
                </div>
                <form
                  className="rounded-xl border border-dashed p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (code.trim() && !busy) coupon.mutate();
                  }}
                >
                  <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
                    <Tag className="h-4 w-4 text-brand" /> Give a coupon
                  </p>
                  <p className="mb-2 text-[12px] text-muted-foreground">
                    A 100% coupon opens the {what} now. A smaller one lowers what the student still has to pay.
                  </p>
                  <div className="flex gap-2">
                    <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Coupon code" className="h-9" maxLength={60} />
                    <Button type="submit" variant="secondary" className="h-9" disabled={!code.trim() || busy}>
                      {coupon.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                    </Button>
                  </div>
                </form>
              </div>
            ) : null}
            {wa ? (
              <a
                href={`https://wa.me/${wa}?text=${waText}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-[#25D366] px-3.5 text-sm font-semibold text-white transition hover:bg-[#1ebe57]"
              >
                <Phone className="h-4 w-4" /> WhatsApp the student
              </a>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
