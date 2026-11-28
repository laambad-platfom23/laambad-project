"use client";

/**
 * /checkout?book=<slug> — buy a book the same way as a course: WaafiPay (EVC Plus · Zaad · Sahal ·
 * eDahab, PIN on the phone, the book opens at once) or a manual EVC transfer an admin approves.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, ChevronLeft, Clock, FileText, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { booksApi, type Book } from "@/services/api/student-features";
import { useCartStore } from "@/store/cart-store";
import { getApiErrorMessage } from "@/lib/utils";
import {
  CheckoutHeader,
  CheckoutSkeleton,
  ManualOrderDialog,
  PaymentMethodSection,
  WaafiDialog,
  formatMinor,
  isValidSomaliMobile,
  useCheckoutUser,
  usePaymentForm,
  type ManualOrder,
  type WaafiDialogState,
} from "@/components/checkout/checkout-parts";

type BookWaafiResult = { outcome: "approved" | "declined" | "unknown"; message: string; status: string };

const PRIMARY =
  "bg-[#0B1F3A] font-bold text-white shadow-lg shadow-[#0B1F3A]/20 hover:bg-[#123252] dark:bg-brand dark:hover:bg-brand-hover";

function BookCover({ book, className }: { book: Pick<Book, "cover_url">; className: string }) {
  if (!book.cover_url) {
    return (
      <div className={`flex shrink-0 items-center justify-center rounded-md bg-muted ${className}`}>
        <BookOpen className="h-6 w-6 text-muted-foreground/50" aria-hidden />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={book.cover_url} alt="" className={`shrink-0 rounded-md object-cover ${className}`} />;
}

function Centered({ backHref, children }: { backHref: string; children: React.ReactNode }) {
  return (
    <>
      <CheckoutHeader cancelHref={backHref} />
      <div className="mx-auto max-w-lg px-4 py-16 text-center">{children}</div>
    </>
  );
}

export function BookCheckout({ slug }: { slug: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { authed, restoring } = useCheckoutUser();
  const removeFromCart = useCartStore((s) => s.removeItem);
  const pay = usePaymentForm();
  const [waafiDialog, setWaafiDialog] = useState<WaafiDialogState<BookWaafiResult>>(null);
  const [manualDone, setManualDone] = useState<ManualOrder | null>(null);

  const { data: book, isLoading, isError } = useQuery({
    queryKey: ["checkout-book", slug, authed],
    queryFn: () => booksApi.get(slug).then((r) => r.data),
    retry: false,
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["books"] });
    await qc.invalidateQueries({ queryKey: ["checkout-book", slug] });
  };

  const waafi = useMutation({
    mutationFn: async (phone: string) => (await booksApi.payWaafi(book!.id, phone)).data as BookWaafiResult,
    onSuccess: async (result) => {
      if (result.outcome === "approved") removeFromCart("book", book!.id);
      setWaafiDialog({ phase: "done", result });
      await qc.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (err: unknown) => {
      setWaafiDialog({ phase: "error", message: getApiErrorMessage(err, "Could not start the payment. Please try again.") });
    },
  });

  const manual = useMutation({
    mutationFn: async () => (await booksApi.payManual(book!.id, pay.senderPhone.trim(), pay.payRef.trim() || undefined)).data,
    onSuccess: async (order) => {
      removeFromCart("book", book!.id);
      setManualDone({
        kind: "book",
        title: book!.title,
        amount: formatMinor(book!.price, book!.currency),
        senderPhone: pay.senderPhone.trim(),
        reference: pay.payRef.trim(),
        paymentId: String(order?.id ?? ""),
      });
      await qc.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, "Could not submit the payment request")),
  });

  const backHref = `/dashboard/books?book=${encodeURIComponent(slug)}`;
  const readHref = `/dashboard/books?read=${encodeURIComponent(slug)}`;
  const nextHere = encodeURIComponent(`/checkout?book=${encodeURIComponent(slug)}`);

  if (isLoading || restoring) {
    return (
      <>
        <CheckoutHeader cancelHref={backHref} />
        <CheckoutSkeleton />
      </>
    );
  }

  if (isError || !book) {
    return (
      <Centered backHref="/dashboard/books">
        <BookOpen className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden />
        <p className="mt-3 font-semibold">This book is not available.</p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/dashboard/books">Browse books</Link>
        </Button>
      </Centered>
    );
  }

  if (book.is_free) {
    return (
      <Centered backHref={backHref}>
        <BookCover book={book} className="mx-auto h-28 w-[84px]" />
        <p className="mt-4 font-semibold">“{book.title}” is free.</p>
        <p className="mt-1 text-sm text-muted-foreground">{authed ? "Open it from the Books page." : "Sign in or create an account to read it."}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {authed ? (
            <Button asChild className={PRIMARY}>
              <Link href={readHref}>Read the book</Link>
            </Button>
          ) : (
            <>
              <Button asChild className={PRIMARY}>
                <Link href={`/login?next=${encodeURIComponent(readHref)}`}>Sign in</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/register?next=${encodeURIComponent(readHref)}`}>Create account</Link>
              </Button>
            </>
          )}
        </div>
      </Centered>
    );
  }

  if (book.owned) {
    return (
      <Centered backHref={backHref}>
        <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
        <p className="mt-3 font-semibold">You already have “{book.title}”.</p>
        <Button asChild className={`mt-6 ${PRIMARY}`}>
          <Link href={readHref}>Read the book</Link>
        </Button>
      </Centered>
    );
  }

  const price = formatMinor(book.price, book.currency);
  const busy = waafi.isPending || manual.isPending;

  const submit = () => {
    if (pay.method === "wafi") {
      pay.setWafiPhoneTouched(true);
      if (!isValidSomaliMobile(pay.wafiPhone)) {
        toast.error("Enter your 9-digit mobile wallet number, e.g. 61 234 5678.");
        return;
      }
      setWaafiDialog({ phase: "waiting", phone: pay.wafiPhone.trim(), amount: price });
      waafi.mutate(pay.wafiPhone.trim());
      return;
    }
    if (!isValidSomaliMobile(pay.senderPhone)) {
      toast.error("Enter the 9-digit number you paid from, e.g. 61 234 5678.");
      return;
    }
    manual.mutate();
  };

  return (
    <div className="flex min-h-svh flex-col bg-[#f8fafc] dark:bg-[#0a121f]">
      <CheckoutHeader cancelHref={backHref} />

      <main className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-5 sm:px-6 sm:py-6 lg:min-h-0 lg:py-7">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-3 gap-1 self-start text-[#0B1F3A]/80 hover:bg-[#0B1F3A]/10 hover:text-[#0B1F3A] dark:text-[#FF8A66]/85 dark:hover:bg-[#123252]/10 dark:hover:text-[#FF8A66] sm:mb-4"
          asChild
        >
          <Link href={backHref}>
            <ChevronLeft className="h-4 w-4" />
            Back to books
          </Link>
        </Button>

        <h1 className="text-2xl font-bold tracking-tight text-[#0B1F3A] dark:text-white sm:text-3xl">Checkout</h1>
        <p className="mt-1 text-sm text-muted-foreground">Secure checkout — one book in your order.</p>

        <div className="mt-5 grid grid-cols-1 gap-6 lg:mt-6 lg:grid-cols-2 lg:items-start lg:gap-8 xl:gap-10">
          <div className="flex min-w-0 flex-col gap-5 lg:gap-6">
            {book.payment_pending ? (
              <div className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <p className="leading-relaxed">
                  A payment for this book is <strong>being verified</strong>. If you already sent the money, there is no need to pay again — we
                  open the book as soon as the transfer is checked.
                </p>
              </div>
            ) : null}

            <PaymentMethodSection form={pay} amountLabel={price} itemNoun="book" />

            <section className="space-y-3 lg:hidden">
              <h2 className="text-base font-semibold text-[#0B1F3A] dark:text-white">Your book</h2>
              <div className="flex gap-3 rounded-xl border border-[#0B1F3A]/12 bg-white p-3 shadow-sm ring-1 ring-[#0B1F3A]/[0.06] dark:border-white/20 dark:bg-[#061528]/80 dark:ring-[#E84A27]/10 sm:gap-4 sm:p-4">
                <BookCover book={book} className="h-20 w-[60px]" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-3 font-semibold leading-snug text-foreground">{book.title}</p>
                  {book.author ? <p className="mt-0.5 text-xs text-muted-foreground">{book.author}</p> : null}
                  <p className="mt-2 text-lg font-bold text-foreground">{price}</p>
                </div>
              </div>
            </section>
          </div>

          <aside className="lg:sticky lg:top-[4.75rem] lg:max-h-[calc(100svh-5.25rem)] lg:overflow-y-auto lg:overscroll-contain">
            <div className="rounded-2xl border border-[#0B1F3A]/12 bg-white/95 p-5 shadow-[0_12px_40px_-16px_rgba(232,93,4,0.18)] ring-1 ring-[#0B1F3A]/[0.06] dark:border-white/20 dark:bg-[#0B1F3A]/90 dark:shadow-[0_16px_48px_-20px_rgba(0,0,0,0.45)] dark:ring-[#E84A27]/10 sm:p-6">
              <h2 className="text-base font-semibold text-[#0B1F3A] dark:text-white">Order summary</h2>

              <div className="mt-4 hidden gap-3 rounded-xl border border-[#0B1F3A]/10 bg-[#f5f8fd]/80 p-3 dark:border-white/20 dark:bg-[#0c1929]/50 lg:flex">
                <BookCover book={book} className="h-20 w-[60px]" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{book.title}</p>
                  {book.author ? <p className="mt-0.5 text-xs text-muted-foreground">{book.author}</p> : null}
                  <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" aria-hidden /> PDF · read online or download
                  </p>
                </div>
              </div>

              <dl className="mt-4 space-y-2.5 text-sm lg:mt-5">
                <div className="flex justify-between gap-4 text-muted-foreground">
                  <dt>Subtotal</dt>
                  <dd>{price}</dd>
                </div>
                <div className="border-t border-border pt-2.5">
                  <div className="flex justify-between gap-4 text-base font-bold text-foreground">
                    <dt>Total</dt>
                    <dd>{price}</dd>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">1 book in this order</p>
                </div>
              </dl>

              <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                By paying you agree to our terms. With WaafiPay the book opens as soon as you confirm with your PIN.
              </p>

              {!authed ? (
                <div className="mt-5 space-y-2.5">
                  <Button asChild size="lg" className={`h-12 w-full rounded-xl text-base ${PRIMARY}`}>
                    <Link href={`/login?next=${nextHere}`}>Sign in to pay</Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full border-2 border-[#0B1F3A]/30 text-[#0B1F3A] hover:bg-[#0B1F3A]/5 dark:border-white/40 dark:text-[#FF8A66] dark:hover:bg-[#123252]/10">
                    <Link href={`/register?next=${nextHere}`}>Create account</Link>
                  </Button>
                </div>
              ) : (
                <Button size="lg" className={`mt-5 h-11 w-full rounded-xl text-[15px] sm:h-12 sm:text-base ${PRIMARY}`} disabled={busy} onClick={submit}>
                  {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                  {pay.method === "wafi" ? `Pay ${price}` : "Submit payment request"}
                </Button>
              )}
            </div>
          </aside>
        </div>
      </main>

      <WaafiDialog
        state={waafiDialog}
        onClose={() => {
          setWaafiDialog(null);
          void refresh();
        }}
        successLabel="Read the book"
        onSuccess={() => {
          setWaafiDialog(null);
          router.push(readHref);
        }}
      />
      <ManualOrderDialog
        order={manualDone}
        closeLabel="Go to my books"
        onClose={() => {
          setManualDone(null);
          router.push(backHref);
        }}
      />
    </div>
  );
}
