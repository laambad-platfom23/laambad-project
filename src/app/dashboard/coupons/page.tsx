"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Search, TicketPercent, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { couponsApi, type Coupon, type CouponInput, type CouponScope } from "@/services/api/orders";
import { useAuthStore } from "@/store/auth-store";
import { isAdminUser } from "@/lib/auth-routing";
import { cn, getApiErrorMessage } from "@/lib/utils";

const SCOPE_LABEL: Record<CouponScope, string> = { all: "Courses & books", courses: "Courses", books: "Books" };

function discountLabel(c: Coupon) {
  return c.discount_type === "fixed"
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((c.discount_amount ?? 0) / 100)
    : `${c.discount_percent ?? 0}%`;
}

function stateOf(c: Coupon): { label: string; cls: string } {
  if (!c.is_active) return { label: "Off", cls: "bg-muted text-muted-foreground" };
  if (c.expired) return { label: "Expired", cls: "bg-destructive/10 text-destructive" };
  if (c.used_up) return { label: "Used up", cls: "bg-warning-soft text-warning" };
  return { label: "Active", cls: "bg-success-soft text-success" };
}

/** A11 (Phase 2 test): admins create and manage coupons for courses and books. */
export default function CouponsPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Coupon | "new" | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const list = useQuery({
    queryKey: ["admin-coupons", q, status, page],
    queryFn: () => couponsApi.list({ q, status, page }).then((r) => r.data),
    placeholderData: keepPreviousData,
    enabled: !!user && isAdminUser(user),
  });
  const remove = useMutation({
    mutationFn: (c: Coupon) => couponsApi.remove(c.id),
    onSuccess: () => {
      toast.success("Coupon deleted");
      qc.invalidateQueries({ queryKey: ["admin-coupons"] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not delete the coupon")),
  });

  if (user && !isAdminUser(user)) return <p className="p-6 text-muted-foreground">Only administrators can manage coupons.</p>;
  const data = list.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <TicketPercent className="h-7 w-7 text-brand" /> Coupons
          </h1>
          <p className="mt-1 text-muted-foreground">Discount codes for courses and books. Students type them at checkout; you can also give one on an order.</p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> New coupon
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b p-3 sm:p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a code…" className="h-10 rounded-xl pl-9" />
          </div>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as typeof status);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-10 w-[170px] rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All coupons</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Off or expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {list.isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : !data?.data.length ? (
          <p className="py-14 text-center text-sm text-muted-foreground">{q ? "No coupon matches." : "No coupons yet — create the first one."}</p>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1.3fr)_90px_minmax(0,1fr)_100px_110px_90px_80px] gap-4 border-b bg-muted/50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground md:grid">
              <span>Code</span>
              <span>Discount</span>
              <span>For</span>
              <span>Used</span>
              <span>Expires</span>
              <span>Status</span>
              <span className="sr-only">Actions</span>
            </div>
            <ul className={cn("divide-y", list.isFetching && "opacity-70")}>
              {data.data.map((c) => {
                const st = stateOf(c);
                return (
                  <li
                    key={c.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 sm:px-5 md:grid-cols-[minmax(0,1.3fr)_90px_minmax(0,1fr)_100px_110px_90px_80px]"
                  >
                    <p className="truncate font-mono text-[14px] font-semibold" title={c.code}>
                      {c.code}
                    </p>
                    <p className="text-right font-bold md:text-left">{discountLabel(c)}</p>
                    <p className="text-[13px] text-muted-foreground">{SCOPE_LABEL[c.applies_to]}</p>
                    <p className="text-right text-[13px] tabular-nums md:text-left">
                      {c.usage_count.toLocaleString()}
                      {c.usage_limit != null ? <span className="text-muted-foreground"> / {c.usage_limit.toLocaleString()}</span> : null}
                    </p>
                    <p className="text-[13px] text-muted-foreground">{c.expires_at ? new Date(c.expires_at).toLocaleDateString("en-GB") : "Never"}</p>
                    <Badge className={cn("w-fit justify-self-end rounded-full border-0 md:justify-self-start", st.cls)}>{st.label}</Badge>
                    <div className="col-span-2 flex justify-end gap-1 md:col-span-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${c.code}`} onClick={() => setEditing(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label={`Delete ${c.code}`}
                        disabled={remove.isPending}
                        onClick={() => window.confirm(`Delete the coupon ${c.code}? Orders that used it keep it.`) && remove.mutate(c)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <PaginationBar className="border-t p-3 sm:px-5" page={data.page} pageSize={10} total={data.total} onPage={setPage} noun="coupons" />
          </>
        )}
      </div>
      {editing ? <CouponDialog coupon={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function CouponDialog({ coupon, onClose }: { coupon: Coupon | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState(coupon?.code ?? "");
  const [type, setType] = useState<"percent" | "fixed">(coupon?.discount_type ?? "percent");
  const [value, setValue] = useState(
    coupon ? (coupon.discount_type === "fixed" ? String((coupon.discount_amount ?? 0) / 100) : String(coupon.discount_percent ?? "")) : ""
  );
  const [scope, setScope] = useState<CouponScope>(coupon?.applies_to ?? "all");
  const [expires, setExpires] = useState(coupon?.expires_at ? coupon.expires_at.slice(0, 10) : "");
  const [limit, setLimit] = useState(coupon?.usage_limit != null ? String(coupon.usage_limit) : "");
  const [active, setActive] = useState(coupon?.is_active ?? true);

  const save = useMutation({
    mutationFn: () => {
      const num = Number(value);
      const data: CouponInput = {
        code: code.trim(),
        discount_type: type,
        value: type === "fixed" ? Math.round(num * 100) : num,
        applies_to: scope,
        expires_at: expires || null,
        usage_limit: limit.trim() ? Number(limit) : null,
        is_active: active,
      };
      return coupon ? couponsApi.update(coupon.id, data) : couponsApi.create(data);
    },
    onSuccess: () => {
      toast.success(coupon ? "Coupon saved" : "Coupon created");
      qc.invalidateQueries({ queryKey: ["admin-coupons"] });
      onClose();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not save the coupon")),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{coupon ? `Edit ${coupon.code}` : "New coupon"}</DialogTitle>
          <DialogDescription>{coupon ? `Used ${coupon.usage_count} time${coupon.usage_count === 1 ? "" : "s"}.` : "Students type the code at checkout."}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!save.isPending) save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="cp-code">Code</Label>
            <Input id="cp-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\s+/g, ""))} placeholder="e.g. RAMADAN50" maxLength={60} className="font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Discount</Label>
              <Select value={type} onValueChange={(v) => setType(v as "percent" | "fixed")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percentage (%)</SelectItem>
                  <SelectItem value="fixed">Amount ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-value">{type === "percent" ? "Percent off" : "Dollars off"}</Label>
              <Input
                id="cp-value"
                type="number"
                inputMode="decimal"
                min={type === "percent" ? 1 : 0.01}
                max={type === "percent" ? 100 : undefined}
                step={type === "percent" ? 1 : 0.01}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={type === "percent" ? "100 = free" : "5.00"}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Works for</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as CouponScope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Courses and books</SelectItem>
                <SelectItem value="courses">Courses only</SelectItem>
                <SelectItem value="books">Books only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cp-exp">Expires (optional)</Label>
              <Input id="cp-exp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-limit">Max uses (optional)</Label>
              <Input id="cp-limit" type="number" min={1} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="No limit" />
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm">
            <span>
              <span className="font-medium">Active</span>
              <span className="block text-xs text-muted-foreground">Off = students cannot use it.</span>
            </span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!code.trim() || !value || save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {coupon ? "Save" : "Create coupon"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
