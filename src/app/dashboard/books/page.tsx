"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Download, Loader2, Lock, Settings2, ShoppingCart, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { booksApi, type Book } from "@/services/api/student-features";
import { useAuthStore } from "@/store/auth-store";
import { isAdminUser } from "@/lib/auth-routing";
import { SODEMY_CONTACT } from "@/lib/sodemy-contact";
import { cn, getApiErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

function formatBookPrice(b: Pick<Book, "is_free" | "price" | "currency">) {
  if (b.is_free) return "Free";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: b.currency || "USD" }).format(b.price / 100);
}

/** A2: book store + reader. PDFs are fetched with the sign-in token; their storage URL is never shown. */
export default function BooksPage() {
  const user = useAuthStore((s) => s.user);
  const admin = isAdminUser(user);
  const [tab, setTab] = useState<"store" | "mine">("store");
  const [reading, setReading] = useState<Book | null>(null);
  const [buying, setBuying] = useState<Book | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["books", user?.id],
    queryFn: () => booksApi.list().then((r) => r.data),
    enabled: !!user,
  });
  const list = (data ?? []).filter((b) => (admin ? b.status === "published" : true));
  const shown = tab === "mine" ? list.filter((b) => b.owned && !b.is_free) : list;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BookOpen className="h-7 w-7 text-primary" />
            Books
          </h1>
          <p className="mt-1 text-muted-foreground">Read online or download. Free books open right away.</p>
        </div>
        {admin ? (
          <Button asChild variant="outline">
            <Link href="/dashboard/books/manage">
              <Settings2 className="h-4 w-4" /> Manage books
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="inline-flex rounded-lg border p-1">
        {(["store", "mine"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition",
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "store" ? "All books" : "My purchases"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
      ) : !shown.length ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            {tab === "mine" ? "You have not bought any books yet." : "No books published yet."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((b) => (
            <Card key={b.id} className="flex flex-col overflow-hidden">
              <div className="flex aspect-[3/4] items-center justify-center overflow-hidden bg-muted">
                {b.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.cover_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <BookOpen className="h-12 w-12 text-muted-foreground/40" />
                )}
              </div>
              <CardContent className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 font-semibold leading-snug">{b.title}</p>
                  <Badge variant={b.is_free ? "secondary" : "default"} className="shrink-0">
                    {formatBookPrice(b)}
                  </Badge>
                </div>
                {b.author ? <p className="text-xs text-muted-foreground">{b.author}</p> : null}
                {b.description ? <p className="line-clamp-3 text-sm text-muted-foreground">{b.description}</p> : null}
                <div className="mt-auto pt-2">
                  {b.owned ? (
                    <Button className="w-full" onClick={() => setReading(b)} disabled={!b.has_file}>
                      <BookOpen className="h-4 w-4" /> Read
                    </Button>
                  ) : b.payment_pending ? (
                    <Button className="w-full" variant="outline" disabled>
                      Payment being verified
                    </Button>
                  ) : (
                    <Button className="w-full" onClick={() => setBuying(b)}>
                      <ShoppingCart className="h-4 w-4" /> Buy
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {reading ? <BookReader book={reading} onClose={() => setReading(null)} /> : null}
      {buying ? <BuyBookDialog book={buying} onClose={() => setBuying(null)} /> : null}
    </div>
  );
}

function BookReader({ book, onClose }: { book: Book; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    booksApi
      .file(book.id)
      .then((r) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
        setUrl(objectUrl);
      })
      .catch(async (e) => {
        // the error body is a Blob too (responseType: blob)
        let msg = "Could not open the book.";
        try {
          const text = await e?.response?.data?.text?.();
          const j = text ? JSON.parse(text) : null;
          msg = j?.error?.message ?? j?.message ?? msg;
        } catch {
          /* keep default */
        }
        if (!cancelled) setError(msg);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [book.id]);

  const download = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${book.slug}.pdf`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <p className="min-w-0 flex-1 truncate font-semibold">{book.title}</p>
        <Button size="sm" variant="outline" onClick={download} disabled={!url}>
          <Download className="h-4 w-4" /> <span className="hidden sm:inline">Download</span>
        </Button>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Lock className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{error}</p>
          </div>
        ) : url ? (
          <iframe title={book.title} src={url} className="h-full w-full border-0" />
        ) : (
          <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading the book…
          </div>
        )}
      </div>
    </div>
  );
}

function BuyBookDialog({ book, onClose }: { book: Book; onClose: () => void }) {
  const qc = useQueryClient();
  const [method, setMethod] = useState<"waafi" | "manual">("waafi");
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const pay = useMutation({
    mutationFn: async () => {
      if (method === "waafi") return (await booksApi.payWaafi(book.id, phone)).data;
      await booksApi.payManual(book.id, phone, reference || undefined);
      return { outcome: "manual" as const, message: "" };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["books"] });
      if (r.outcome === "approved") {
        toast.success("Payment received — your book is ready!");
        onClose();
      } else if (r.outcome === "declined") {
        toast.error(r.message || "The payment was declined.");
      } else if (r.outcome === "manual") {
        setDone("manual");
      } else {
        toast.message(r.message);
        onClose();
      }
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Payment failed")),
  });

  const price = formatBookPrice(book);
  const waNumber = SODEMY_CONTACT.whatsappUrl.replace(/\D/g, "");
  const waText = [
    "Asc, waxaan iibsaday buug Laambad (Manual payment / EVC Plus).",
    `Buugga: ${book.title}`,
    `Lacagta: ${price}`,
    phone ? `Lambarka aan ka diray: ${phone}` : "",
    reference ? `Transaction ID: ${reference}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Buy “{book.title}”</DialogTitle>
          <DialogDescription>Price: {price}</DialogDescription>
        </DialogHeader>
        {done === "manual" ? (
          <div className="space-y-3 text-center">
            <p className="text-sm">Request submitted. We open the book after checking your transfer.</p>
            <Button asChild className="w-full">
              <a href={`https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer">
                Send confirmation on WhatsApp
              </a>
            </Button>
            <Button variant="outline" className="w-full" onClick={onClose}>
              Close
            </Button>
          </div>
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
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm",
                    method === m ? "border-brand bg-brand-soft font-semibold" : "hover:bg-muted/60"
                  )}
                >
                  {m === "waafi" ? "Pay now (PIN)" : "Manual EVC"}
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    {m === "waafi" ? "EVC · Zaad · Sahal · eDahab" : "Send, then an admin approves"}
                  </span>
                </button>
              ))}
            </div>
            {method === "manual" ? (
              <p className="text-sm text-muted-foreground">
                Send <strong className="text-foreground">{price}</strong> with EVC Plus to{" "}
                <strong className="font-mono text-foreground">+252 61 9993660</strong>, then submit this form.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">You will get a prompt on your phone — confirm it with your PIN.</p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="book-phone">{method === "waafi" ? "Mobile number to pay with" : "Number you paid from"}</Label>
              <Input id="book-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="61 234 5678" inputMode="tel" />
            </div>
            {method === "manual" ? (
              <div className="space-y-1.5">
                <Label htmlFor="book-ref">Transaction ID (optional)</Label>
                <Input id="book-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="From the EVC SMS" />
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
