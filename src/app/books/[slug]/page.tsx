"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Check, ChevronRight, Clock, GraduationCap, Headphones, ShieldCheck, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookCover, BookReviews, RatingLine, formatBookPrice } from "@/components/books/book-parts";
import { booksApi } from "@/services/api/student-features";
import { useAuthStore } from "@/store/auth-store";
import { cartCheckoutHref, useCartStore } from "@/store/cart-store";

/**
 * A12 (Phase 2 test): a book's page — cover, rating, Read / Listen (or Buy / Add to cart), "not for
 * download", the related course ("Practise what this book teaches"), the description and reviews.
 */
export default function BookPage() {
  const params = useParams();
  const slug = typeof params.slug === "string" ? decodeURIComponent(params.slug) : "";
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const cart = useCartStore((s) => s.items);
  const addToCart = useCartStore((s) => s.addItem);
  const { data: book, isLoading, isError } = useQuery({
    queryKey: ["book", slug, user?.id ?? "guest"],
    queryFn: () => booksApi.get(slug).then((r) => r.data),
    enabled: !!slug,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[300px_1fr]">
        <Skeleton className="aspect-[3/4] rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }
  if (isError || !book) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <BookOpen className="mx-auto h-12 w-12 text-muted-foreground" />
        <p className="mt-3 font-semibold">This book is not available.</p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/books">All books</Link>
        </Button>
      </div>
    );
  }

  const readHref = `/books/${encodeURIComponent(book.slug)}/read`;
  const canRead = !!book.owned;
  const inCart = cart.some((l) => l.kind === "book" && l.id === book.id);
  const desc = (book.description ?? "").trim();
  const intro = desc.split(/\n\s*\n/)[0] ?? "";
  const started = book.progress && book.progress.last_page > 1 ? book.progress : null;

  const add = () => {
    const added = addToCart({ kind: "book", id: book.id, slug: book.slug, title: book.title, priceMinor: book.price, currency: book.currency || "USD", isFree: false });
    if (added) toast.success("Added to cart", { action: { label: "View cart", onClick: () => router.push("/cart") } });
    else toast.message("This book is already in your cart");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <nav className="mb-5 flex items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/books" className="hover:text-foreground">
          eBooks
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="truncate text-foreground">{book.title}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-[300px_1fr] lg:gap-12">
        <div className="mx-auto w-full max-w-[300px]">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-md">
            <BookCover url={book.cover_url} className="aspect-[3/4] w-full" iconClass="h-16 w-16" />
          </div>
        </div>

        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight text-[#0B1F3A] dark:text-white sm:text-4xl">{book.title}</h1>
          {book.author ? <p className="mt-2 text-lg text-muted-foreground">{book.author}</p> : null}
          {book.rating?.count ? (
            <a href="#reviews" className="mt-3 inline-block">
              <RatingLine rating={book.rating} size={20} className="text-base" />
            </a>
          ) : null}
          {intro ? <p className="mt-4 whitespace-pre-wrap text-lg leading-relaxed text-foreground/90">{intro}</p> : null}
          <p className="mt-3 text-muted-foreground">
            {book.page_count ? `${book.page_count} pages, ` : ""}read on the screen, with a voice that reads every page aloud.
          </p>

          {started && canRead ? (
            <div className="mt-5 max-w-md">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">You are on page {started.last_page}</span>
                <span className="text-muted-foreground">{started.percent}% read</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-brand" style={{ width: `${started.percent}%` }} />
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            {canRead ? (
              <>
                <Button asChild size="lg" className="h-12 rounded-xl px-7 text-base">
                  <Link href={readHref}>
                    <BookOpen className="h-5 w-5" /> {started ? "Continue reading" : "Read"}
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 rounded-xl px-7 text-base">
                  <Link href={`${readHref}?listen=1`}>
                    <Headphones className="h-5 w-5" /> Listen
                  </Link>
                </Button>
              </>
            ) : book.is_free ? (
              <>
                <Button asChild size="lg" className="h-12 rounded-xl px-7 text-base">
                  <Link href={`/login?next=${encodeURIComponent(readHref)}`}>
                    <BookOpen className="h-5 w-5" /> Sign in to read — free
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 rounded-xl px-7 text-base">
                  <Link href={`/register?next=${encodeURIComponent(readHref)}`}>Create account</Link>
                </Button>
              </>
            ) : book.payment_pending ? (
              <div className="flex max-w-xl gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <p>
                  Your payment is <strong>being verified</strong>. The book opens as soon as it is confirmed.{" "}
                  <Link className="font-medium text-brand hover:underline" href={cartCheckoutHref({ kind: "book", slug: book.slug })}>
                    Pay with WaafiPay instead
                  </Link>
                </p>
              </div>
            ) : (
              <>
                <Button asChild size="lg" className="h-12 rounded-xl px-7 text-base">
                  <Link href={cartCheckoutHref({ kind: "book", slug: book.slug })}>Buy now · {formatBookPrice(book)}</Link>
                </Button>
                {inCart ? (
                  <Button asChild size="lg" variant="outline" className="h-12 rounded-xl px-6 text-base">
                    <Link href="/cart">
                      <Check className="h-5 w-5 text-success" /> In cart
                    </Link>
                  </Button>
                ) : (
                  <Button size="lg" variant="outline" className="h-12 rounded-xl px-6 text-base" onClick={add}>
                    <ShoppingCart className="h-5 w-5" /> Add to cart
                  </Button>
                )}
              </>
            )}
          </div>

          <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0" /> Read and listened to on the site and in the app. Not for download.
          </p>
        </div>
      </div>

      {book.course ? (
        <section className="mt-12 rounded-3xl border bg-brand-soft/40 p-6 sm:p-8 dark:bg-white/5">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white">
              <GraduationCap className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold">Practise what this book teaches</h2>
              <p className="text-muted-foreground">
                The course <strong className="text-foreground">{book.course.title}</strong> has lessons, quizzes and exercises on the same subject.
              </p>
            </div>
            <Button asChild variant="outline" className="rounded-xl">
              <Link href={`/courses/${encodeURIComponent(book.course.slug)}`}>
                Open the course <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      ) : null}

      {desc && desc !== intro ? (
        <section className="mt-12 max-w-3xl">
          <h2 className="text-xl font-bold">About this book</h2>
          <p className="mt-3 whitespace-pre-wrap leading-relaxed text-foreground/85">{desc}</p>
        </section>
      ) : null}

      <section id="reviews" className="mt-12 max-w-4xl scroll-mt-24">
        <h2 className="mb-4 text-xl font-bold">Ratings &amp; reviews</h2>
        <BookReviews bookId={book.id} signedIn={!!user} />
      </section>

      {!canRead && !book.is_free && !user ? (
        <p className="mt-10 text-sm text-muted-foreground">
          Already bought it?{" "}
          <Link href={`/login?next=${encodeURIComponent(`/books/${book.slug}`)}`} className="font-medium text-brand hover:underline">
            Sign in
          </Link>{" "}
          with the same account.
        </p>
      ) : null}
    </div>
  );
}
