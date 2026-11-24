"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, GraduationCap, Loader2, Pencil, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { coursesApi } from "@/services/api/courses";
import { bundleApi, money, type Bundle } from "@/services/api/course-features";
import { useAuthStore } from "@/store/auth-store";
import { isAdminUser } from "@/lib/auth-routing";
import { SODEMY_CONTACT } from "@/lib/sodemy-contact";
import { cn, formatDateTime, getApiErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

/** A5: diplomas (course bundles). Students buy one and get all its courses; admins build and approve. */
export default function BundlesPage() {
  const user = useAuthStore((s) => s.user);
  const admin = isAdminUser(user);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"store" | "orders">("store");
  const [buying, setBuying] = useState<Bundle | null>(null);
  const [editing, setEditing] = useState<Bundle | "new" | null>(null);

  const list = useQuery({ queryKey: ["bundles", user?.id], queryFn: () => bundleApi.list().then((r) => r.data), enabled: !!user });
  const orders = useQuery({ queryKey: ["bundle-orders"], queryFn: () => bundleApi.orders().then((r) => r.data), enabled: admin && tab === "orders" });
  const decide = useMutation({
    mutationFn: ({ id, ok }: { id: string; ok: boolean }) => (ok ? bundleApi.approve(id) : bundleApi.reject(id)),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["bundle-orders"] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not save")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => bundleApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bundles"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <GraduationCap className="h-7 w-7 text-primary" /> Diplomas
          </h1>
          <p className="mt-1 text-muted-foreground">Several courses together at one price — one payment opens them all.</p>
        </div>
        {admin ? (
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> New diploma
          </Button>
        ) : null}
      </div>

      {admin ? (
        <div className="inline-flex rounded-lg border p-1">
          {(["store", "orders"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn("rounded-md px-4 py-1.5 text-sm font-medium", tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            >
              {t === "store" ? "Diplomas" : "Orders"}
            </button>
          ))}
        </div>
      ) : null}

      {tab === "orders" && admin ? (
        orders.isLoading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : !orders.data?.length ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">No diploma orders yet.</CardContent>
          </Card>
        ) : (
          <div className="divide-y rounded-xl border bg-card">
            {orders.data.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{o.bundle_title}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.student_name} · {o.student_email} · {money(o.amount, o.currency)} · {o.provider === "wafi" ? "WaafiPay" : o.provider}
                    {o.payer_phone ? ` · from ${o.payer_phone}` : ""} {o.transaction_id ? `· Tx ${o.transaction_id}` : ""} · {formatDateTime(o.created_at)}
                  </p>
                </div>
                <Badge variant={o.status === "paid" ? "default" : o.status === "pending" ? "secondary" : "destructive"}>{o.status}</Badge>
                {o.status === "pending" ? (
                  <>
                    <Button size="sm" onClick={() => window.confirm("Money received? Open all courses for this student.") && decide.mutate({ id: o.id, ok: true })}>
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => window.confirm("Reject this order?") && decide.mutate({ id: o.id, ok: false })}>
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        )
      ) : list.isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : !list.data?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No diplomas yet.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.data.map((b) => (
            <Card key={b.id} className="overflow-hidden">
              {b.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.cover_url} alt="" className="h-40 w-full object-cover" />
              ) : null}
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold">{b.title}</p>
                    <p className="text-xs text-muted-foreground">{b.course_count} courses</p>
                  </div>
                  {admin ? <Badge variant={b.status === "published" ? "default" : "secondary"}>{b.status}</Badge> : null}
                </div>
                {b.description ? <p className="line-clamp-3 text-sm text-muted-foreground">{b.description}</p> : null}
                <ol className="space-y-1 text-sm">
                  {b.courses.map((c, i) => (
                    <li key={c.id} className="flex gap-2">
                      <span className="w-5 shrink-0 text-xs font-semibold text-muted-foreground">{i + 1}.</span>
                      <Link href={`/courses/${encodeURIComponent(c.slug)}`} className="truncate hover:underline">
                        {c.title}
                      </Link>
                    </li>
                  ))}
                </ol>
                <div className="flex items-end gap-2">
                  <span className="text-2xl font-extrabold">{b.effective_price === 0 ? "Free" : money(b.effective_price, b.currency)}</span>
                  {b.sale_price !== null && b.price > b.effective_price ? (
                    <span className="pb-1 text-sm text-muted-foreground line-through">{money(b.price, b.currency)}</span>
                  ) : null}
                  {b.courses_value > b.effective_price ? (
                    <span className="pb-1 text-xs font-semibold text-success">save {money(b.courses_value - b.effective_price, b.currency)}</span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {b.owned ? (
                    <Button asChild variant="outline">
                      <Link href="/dashboard/my-courses">Open my courses</Link>
                    </Button>
                  ) : b.pending ? (
                    <Button variant="outline" disabled>
                      Payment being verified
                    </Button>
                  ) : b.status === "published" ? (
                    <Button onClick={() => setBuying(b)}>
                      <ShoppingCart className="h-4 w-4" /> {b.effective_price === 0 ? "Enroll" : "Buy diploma"}
                    </Button>
                  ) : null}
                  {admin ? (
                    <>
                      <Button variant="outline" onClick={() => setEditing(b)}>
                        <Pencil className="h-4 w-4" /> Edit
                      </Button>
                      <Button variant="outline" className="text-destructive" onClick={() => window.confirm(`Remove "${b.title}"?`) && remove.mutate(b.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {buying ? <BuyDialog bundle={buying} onClose={() => setBuying(null)} /> : null}
      {editing ? <BundleEditor bundle={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function BuyDialog({ bundle, onClose }: { bundle: Bundle; onClose: () => void }) {
  const qc = useQueryClient();
  const [method, setMethod] = useState<"waafi" | "manual">("waafi");
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  const [manualDone, setManualDone] = useState(false);
  const price = bundle.effective_price === 0 ? "Free" : money(bundle.effective_price, bundle.currency);
  const pay = useMutation({
    mutationFn: async () => {
      if (bundle.effective_price === 0) {
        await bundleApi.enrollFree(bundle.id);
        return { outcome: "approved" as const, message: "" };
      }
      if (method === "waafi") return (await bundleApi.payWaafi(bundle.id, phone)).data;
      await bundleApi.payManual(bundle.id, phone, reference || undefined);
      return { outcome: "manual" as const, message: "" };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["bundles"] });
      qc.invalidateQueries({ queryKey: ["dashboard-overview"] });
      if (r.outcome === "approved") {
        toast.success("All courses are open — good luck!");
        onClose();
      } else if (r.outcome === "declined") toast.error(r.message || "The payment was declined.");
      else if (r.outcome === "manual") setManualDone(true);
      else {
        toast.message(r.message);
        onClose();
      }
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Payment failed")),
  });
  const wa = `https://wa.me/${SODEMY_CONTACT.whatsappUrl.replace(/\D/g, "")}?text=${encodeURIComponent(
    [`Asc, waxaan iibsaday diploma Laambad (Manual payment / EVC Plus).`, `Diploma: ${bundle.title}`, `Lacagta: ${price}`, phone ? `Lambarka: ${phone}` : "", reference ? `Transaction ID: ${reference}` : ""]
      .filter(Boolean)
      .join("\n")
  )}`;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{bundle.title}</DialogTitle>
          <DialogDescription>
            {bundle.course_count} courses · {price}
          </DialogDescription>
        </DialogHeader>
        {manualDone ? (
          <div className="space-y-3 text-center">
            <p className="text-sm">Request submitted. We open the courses after checking your transfer.</p>
            <Button asChild className="w-full">
              <a href={wa} target="_blank" rel="noopener noreferrer">
                Send confirmation on WhatsApp
              </a>
            </Button>
          </div>
        ) : bundle.effective_price === 0 ? (
          <Button onClick={() => pay.mutate()} disabled={pay.isPending}>
            {pay.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Enroll in all courses
          </Button>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!pay.isPending) pay.mutate();
            }}
          >
            <div className="grid grid-cols-2 gap-2">
              {(["waafi", "manual"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn("rounded-lg border px-3 py-2 text-left text-sm", method === m ? "border-brand bg-brand-soft font-semibold" : "hover:bg-muted/60")}
                >
                  {m === "waafi" ? "Pay now (PIN)" : "Manual EVC"}
                </button>
              ))}
            </div>
            {method === "manual" ? (
              <p className="text-sm text-muted-foreground">
                Send <strong className="text-foreground">{price}</strong> with EVC Plus to <strong className="font-mono text-foreground">+252 61 9993660</strong>, then submit.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">You will get a prompt on your phone — confirm it with your PIN.</p>
            )}
            <div className="space-y-1.5">
              <Label>{method === "waafi" ? "Mobile number to pay with" : "Number you paid from"}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="61 234 5678" inputMode="tel" />
            </div>
            {method === "manual" ? (
              <div className="space-y-1.5">
                <Label>Transaction ID (optional)</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </div>
            ) : null}
            <Button type="submit" className="w-full" disabled={!phone.trim() || pay.isPending}>
              {pay.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pay.isPending && method === "waafi" ? "Waiting for your PIN…" : method === "waafi" ? `Pay ${price}` : "Submit request"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BundleEditor({ bundle, onClose }: { bundle: Bundle | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(bundle?.title ?? "");
  const [description, setDescription] = useState(bundle?.description ?? "");
  const [coverUrl, setCoverUrl] = useState(bundle?.cover_url ?? "");
  const [price, setPrice] = useState(bundle ? String(bundle.price / 100) : "");
  const [salePrice, setSalePrice] = useState(bundle?.sale_price != null ? String(bundle.sale_price / 100) : "");
  const [published, setPublished] = useState(bundle?.status === "published");
  const [courses, setCourses] = useState<{ id: string; title: string }[]>(bundle?.courses.map((c) => ({ id: c.id, title: c.title })) ?? []);
  const [q, setQ] = useState("");
  const search = useQuery({
    queryKey: ["bundle-course-search", q],
    queryFn: () => coursesApi.list(1, 20, false, { q, status: "published" }).then((r) => r.data.data ?? []),
    enabled: q.trim().length >= 2,
  });
  const save = useMutation({
    mutationFn: () => {
      const data = {
        title,
        description: description || null,
        cover_url: coverUrl || null,
        price: Math.round(Number(price || 0) * 100),
        sale_price: salePrice.trim() ? Math.round(Number(salePrice) * 100) : null,
        status: (published ? "published" : "draft") as "draft" | "published",
        course_ids: courses.map((c) => c.id),
      };
      return bundle ? bundleApi.update(bundle.id, data) : bundleApi.create(data);
    },
    onSuccess: () => {
      toast.success("Diploma saved");
      qc.invalidateQueries({ queryKey: ["bundles"] });
      onClose();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not save")),
  });
  const move = (i: number, d: -1 | 1) => {
    const n = [...courses];
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    setCourses(n);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{bundle ? "Edit diploma" : "New diploma"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Price (USD)</Label>
              <Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Sale price (optional)</Label>
              <Input type="number" min="0" step="0.01" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Cover image URL</Label>
              <Input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://…" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Courses (in order)</Label>
            <ol className="space-y-1.5">
              {courses.map((c, i) => (
                <li key={c.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="w-5 text-xs font-semibold text-muted-foreground">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === courses.length - 1}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setCourses(courses.filter((x) => x.id !== c.id))}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ol>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a published course…" />
            </div>
            {q.trim().length >= 2 ? (
              <div className="max-h-44 overflow-y-auto rounded-lg border">
                {(search.data ?? []).map((c) => {
                  const added = courses.some((x) => x.id === c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={added}
                      onClick={() => {
                        setCourses([...courses, { id: c.id, title: c.title }]);
                        setQ("");
                      }}
                      className="flex w-full justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/60 disabled:opacity-50"
                    >
                      <span className="truncate">{c.title}</span>
                      <span className="text-xs text-muted-foreground">{added ? "Added" : "Add"}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Published (students can buy it)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!title.trim() || save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
