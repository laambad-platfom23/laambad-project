"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Check, Headphones, Settings2, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { BookCover, RatingLine, formatBookPrice } from "@/components/books/book-parts";
import { booksApi, type Book } from "@/services/api/student-features";
import { useAuthStore } from "@/store/auth-store";
import { cartCheckoutHref, useCartStore } from "@/store/cart-store";
import { isAdminUser } from "@/lib/auth-routing";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PAGE = 12;

/**
 * Books in the dashboard: every book, and "My books" (bought or started) with the reading progress.
 * A book opens its page (/books/<slug>); Read / Listen open the in-app reader (A12 — no download).
 * Paid books are bought like courses: Buy now (checkout) or Add to cart.
 * ?book=<slug> points at one book; ?read=<slug> (old links) opens the reader.
 */
function BooksInner() {
  const user = useAuthStore((s) => s.user);
  const admin = isAdminUser(user);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [tab, setTab] = useState<"store" | "mine">("store");
  const [page, setPage] = useState(1);
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
  const mine = (b: Book) => !!b.owned && (!b.is_free || !!b.progress);
  const all = tab === "mine" ? list.filter(mine) : list;
  const shown = all.slice((page - 1) * PAGE, page * PAGE);

  useEffect(() => {
    if (!data) return;
    const read = params.get("read");
    const point = params.get("book");
    const key = `${read ?? ""}|${point ?? ""}`;
    if ((!read && !point) || handled.current === key) return;
    handled.current = key;
    if (read) {
      router.replace(`/books/${encodeURIComponent(read)}/read`);
      return;
    }
    router.replace(pathname, { scroll: false });
    const idx = list.findIndex((x) => x.slug === point);
    if (idx < 0) return;
    setTab("store");
    setPage(Math.floor(idx / PAGE) + 1);
    const b = list[idx];
    setFocus(b.id);
    setTimeout(() => document.getElementById(`book-${b.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    setTimeout(() => setFocus(null), 3500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <p className="mt-1 text-muted-foreground">Read and listen here and in the app. Books are not downloaded.</p>
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
            onClick={() => {
              setTab(t);
              setPage(1);
            }}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition",
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "store" ? "All books" : "My books"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
      ) : !all.length ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            {tab === "mine" ? "Books you buy or start reading appear here." : "No books published yet."}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {shown.map((b) => {
              const inCart = cart.some((l) => l.kind === "book" && l.id === b.id);
              const href = `/books/${encodeURIComponent(b.slug)}`;
              return (
                <Card
                  key={b.id}
                  id={`book-${b.id}`}
                  className={cn("flex scroll-mt-24 flex-col overflow-hidden transition-shadow", focus === b.id && "ring-2 ring-brand ring-offset-2 ring-offset-background")}
                >
                  <Link href={href} className="relative block">
                    <BookCover url={b.cover_url} className="aspect-[3/4] w-full" />
                    {b.progress && b.progress.percent > 0 ? (
                      <span className="absolute inset-x-0 bottom-0 h-1.5 bg-black/20" title={`${b.progress.percent}% read`}>
                        <span className="block h-full bg-brand" style={{ width: `${b.progress.percent}%` }} />
                      </span>
                    ) : null}
                  </Link>
                  <CardContent className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={href} className="line-clamp-2 font-semibold leading-snug hover:text-brand">
                        {b.title}
                      </Link>
                      <Badge variant={b.is_free ? "secondary" : "default"} className="shrink-0">
                        {formatBookPrice(b)}
                      </Badge>
                    </div>
                    {b.author ? <p className="text-xs text-muted-foreground">{b.author}</p> : null}
                    <RatingLine rating={b.rating} size={13} className="text-xs" />
                    {b.progress && b.progress.percent > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Page {b.progress.last_page} · {b.progress.percent}% read
                      </p>
                    ) : b.description ? (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{b.description}</p>
                    ) : null}
                    <div className="mt-auto space-y-2 pt-2">
                      {b.owned ? (
                        <div className="flex gap-2">
                          <Button asChild className="flex-1" disabled={!b.has_file}>
                            <Link href={`${href}/read`}>
                              <BookOpen className="h-4 w-4" /> {b.progress && b.progress.last_page > 1 ? "Continue" : "Read"}
                            </Link>
                          </Button>
                          <Button asChild variant="outline" size="icon" aria-label="Listen" title="Listen">
                            <Link href={`${href}/read?listen=1`}>
                              <Headphones className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
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
          <PaginationBar page={page} pageSize={PAGE} total={all.length} onPage={setPage} noun="books" />
        </>
      )}
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
