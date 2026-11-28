"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Check, Download, Loader2, Lock, Settings2, ShoppingCart, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { booksApi, type Book } from "@/services/api/student-features";
import { useAuthStore } from "@/store/auth-store";
import { cartCheckoutHref, useCartStore } from "@/store/cart-store";
import { isAdminUser } from "@/lib/auth-routing";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatBookPrice(b: Pick<Book, "is_free" | "price" | "currency">) {
  if (b.is_free) return "Free";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: b.currency || "USD" }).format(b.price / 100);
}

/**
 * A2: book store + reader. PDFs are fetched with the sign-in token; their storage URL is never shown.
 * Paid books are bought like courses: "Buy now" opens the checkout (WaafiPay or manual EVC), or they
 * go into the cart first. ?book=<slug> points at one book, ?read=<slug> opens an owned book.
 */
function BooksInner() {
  const user = useAuthStore((s) => s.user);
  const admin = isAdminUser(user);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [tab, setTab] = useState<"store" | "mine">("store");
  const [reading, setReading] = useState<Book | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const cart = useCartStore((s) => s.items);
  const addToCart = useCartStore((s) => s.addItem);
  const handled = useRef<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["books", user?.id],
    queryFn: () => booksApi.list().then((r) => r.data),
    enabled: !!user,
  });
  const list = (data ?? []).filter((b) => (admin ? b.status === "published" : true));
  const shown = tab === "mine" ? list.filter((b) => b.owned && !b.is_free) : list;

  // ?read=<slug> (after a purchase) opens the book; ?book=<slug> (from the cart / checkout) points at it
  useEffect(() => {
    if (!data) return;
    const read = params.get("read");
    const point = params.get("book");
    const key = `${read ?? ""}|${point ?? ""}`;
    if ((!read && !point) || handled.current === key) return;
    handled.current = key;
    const slug = read ?? point!;
    const b = data.find((x) => x.slug === slug);
    router.replace(pathname, { scroll: false });
    if (!b) return;
    setTab("store");
    if (read && b.owned) {
      setReading(b);
      return;
    }
    setFocus(b.id);
    setTimeout(() => document.getElementById(`book-${b.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    setTimeout(() => setFocus(null), 3500);
  }, [data, params, pathname, router]);

  const add = (b: Book) => {
    const added = addToCart({ kind: "book", id: b.id, slug: b.slug, title: b.title, priceMinor: b.price, currency: b.currency || "USD", isFree: false });
    if (added) toast.success("Added to cart", { action: { label: "View cart", onClick: () => router.push("/cart") } });
    else toast.message("This book is already in your cart");
  };

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
          {shown.map((b) => {
            const inCart = cart.some((l) => l.kind === "book" && l.id === b.id);
            return (
              <Card
                key={b.id}
                id={`book-${b.id}`}
                className={cn("flex scroll-mt-24 flex-col overflow-hidden transition-shadow", focus === b.id && "ring-2 ring-brand ring-offset-2 ring-offset-background")}
              >
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
                  <div className="mt-auto space-y-2 pt-2">
                    {b.owned ? (
                      <Button className="w-full" onClick={() => setReading(b)} disabled={!b.has_file}>
                        <BookOpen className="h-4 w-4" /> Read
                      </Button>
                    ) : b.payment_pending ? (
                      <Button className="w-full" variant="outline" disabled>
                        Payment being verified
                      </Button>
                    ) : (
                      <>
                        <Button asChild className="w-full">
                          <Link href={cartCheckoutHref({ kind: "book", slug: b.slug })}>Buy now</Link>
                        </Button>
                        {inCart ? (
                          <Button asChild variant="outline" className="w-full">
                            <Link href="/cart">
                              <Check className="h-4 w-4 text-success" /> In cart
                            </Link>
                          </Button>
                        ) : (
                          <Button variant="outline" className="w-full" onClick={() => add(b)}>
                            <ShoppingCart className="h-4 w-4" /> Add to cart
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {reading ? <BookReader book={reading} onClose={() => setReading(null)} /> : null}
    </div>
  );
}

export default function BooksPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
      <BooksInner />
    </Suspense>
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
