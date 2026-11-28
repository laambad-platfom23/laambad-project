"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { coursesApi, type CouponPreviewResponse } from "@/services/api/courses";
import { paymentsApi, type InitiatePaymentBody, type WaafiPayResult } from "@/services/api/payments";
import { enrollmentsApi } from "@/services/api/enrollments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Course } from "@/types";
import { getApiErrorMessage } from "@/lib/utils";
import { useCartStore } from "@/store/cart-store";
import { courseCoverRawUrl, publicCourseCoverImageUrlFromRaw } from "@/lib/course-cover";
import { BookCheckout } from "@/components/checkout/book-checkout";
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

function CheckoutCoverThumb({ course }: { course: Course }) {
  const raw = courseCoverRawUrl(course);
  const publicUrl = publicCourseCoverImageUrlFromRaw(raw);
  const src = publicUrl ?? (raw?.startsWith("http") ? raw : null);
  if (!src) {
    return (
      <div className="h-14 w-24 shrink-0 rounded-md bg-zinc-300/50 dark:bg-[#0B1F3A]/70" />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-14 w-24 shrink-0 rounded-md object-cover" />
  );
}

function CheckoutInner() {
  const searchParams = useSearchParams();
  const courseId = searchParams.get("courseId")?.trim() ?? "";
  const slug = searchParams.get("slug")?.trim() ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { authed, restoring } = useCheckoutUser();
  const hasKey = !!slug || !!courseId;
  const [country, setCountry] = useState("SO");
  const pay = usePaymentForm();
  const { method: payMethod, wafiPhone, senderPhone, payRef } = pay;
  const removeFromCart = useCartStore((s) => s.removeItem);
  const [waafiDialog, setWaafiDialog] = useState<WaafiDialogState<WaafiPayResult>>(null);
  const [manualDone, setManualDone] = useState<ManualOrder | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponPreview, setCouponPreview] = useState<CouponPreviewResponse | null>(null);

  const { data: course, isLoading } = useQuery({
    queryKey: ["checkout-course", slug, courseId],
    queryFn: () => {
      if (slug) {
        return coursesApi.publicGetBySlug(slug).then((r) => r.data as Course);
      }
      return coursesApi.get(courseId).then((r) => r.data as Course);
    },
    enabled: hasKey,
  });

  const applyCouponMutation = useMutation({
    mutationFn: async (code: string) => {
      if (!course?.id) throw new Error("missing course");
      const trimmed = code.trim();
      if (!trimmed) throw new Error("empty");
      const { data } = await coursesApi.previewCoupon(course.id, trimmed);
      return data;
    },
    onSuccess: (data) => {
      if (data.valid) {
        setCouponPreview(data);
        toast.success(data.code ? `Coupon ${data.code} applied` : "Coupon applied");
      } else {
        setCouponPreview(null);
        toast.error(data.message || "Invalid or expired coupon");
      }
    },
    onError: (err: unknown) => {
      toast.error(getApiErrorMessage(err, "Could not apply coupon"));
    },
  });

  // manual request (EVC to the institute number) → an admin approves it on the Payments page
  const initiate = useMutation({
    mutationFn: async (opts?: { coupon_code?: string }) => {
      if (!course?.id) throw new Error("missing course");
      const body: InitiatePaymentBody = { provider: "offline" };
      if (opts?.coupon_code) body.coupon_code = opts.coupon_code;
      if (senderPhone.trim()) body.sender_phone = senderPhone.trim();
      if (payRef.trim()) body.reference = payRef.trim();
      const { data } = await paymentsApi.initiate(course.id, body);
      return data;
    },
    onSuccess: async (payment) => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      // ordered: it leaves the cart (the request is on the Payments page now)
      removeFromCart("course", course!.id);
      if (payment.status === "paid") {
        toast.success("You're enrolled!");
        router.push(`/learn/${encodeURIComponent(course!.slug)}`);
        return;
      }
      // Show the WhatsApp contact so the student can send the proof of transfer to the admin right away.
      setManualDone({
        kind: "course",
        title: course!.title,
        amount: formatMinor(totalMinor, currency),
        senderPhone: senderPhone.trim(),
        reference: payRef.trim(),
        paymentId: String((payment as { id?: string }).id ?? ""),
      });
    },
    onError: (err: unknown) => {
      toast.error(getApiErrorMessage(err, "Could not submit the payment request"));
    },
  });

  // WaafiPay: the request stays open until the payer confirms with the PIN on the phone
  const waafi = useMutation({
    mutationFn: async (opts: { phone: string; coupon_code?: string }) => {
      if (!course?.id) throw new Error("missing course");
      const { data } = await paymentsApi.payWaafi(course.id, opts);
      return data;
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      if (result.outcome === "approved") {
        removeFromCart("course", course!.id);
        await queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
        await queryClient.invalidateQueries({ queryKey: ["course-enrollment-access"] });
      }
      setWaafiDialog({ phase: "done", result });
    },
    onError: (err: unknown) => {
      setWaafiDialog({ phase: "error", message: getApiErrorMessage(err, "Could not start the payment. Please try again.") });
    },
  });

  const freeEnroll = useMutation({
    mutationFn: async () => {
      if (!course?.id) throw new Error("missing course");
      await enrollmentsApi.enroll(course.id);
    },
    onSuccess: async () => {
      removeFromCart("course", course!.id);
      await queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["course-enrollment-access"] });
      toast.success("You're enrolled!");
      router.push(`/learn/${encodeURIComponent(course!.slug)}`);
    },
    onError: (err: unknown) => {
      const msg = getApiErrorMessage(err, "Could not enroll");
      if (/already/i.test(msg)) {
        router.push(`/learn/${encodeURIComponent(course!.slug)}`);
        return;
      }
      toast.error(msg);
    },
  });

  const cancelHref = course ? `/courses/${encodeURIComponent(course.slug)}` : "/";

  const pricing = useMemo(() => {
    const p = course?.active_pricing;
    if (!p) return null;
    const list = p.price;
    const effective = p.effective_amount ?? p.price;
    const currency = p.currency || "USD";
    const hasDiscount = !p.is_free && list > effective;
    const offPct =
      hasDiscount && list > 0 ? Math.round(((list - effective) / list) * 100) : 0;
    const offAmount = hasDiscount ? list - effective : 0;
    return {
      p,
      list,
      effective,
      currency,
      hasDiscount,
      offPct,
      offAmount,
      isFree: p.is_free || effective <= 0,
    };
  }, [course]);

  useEffect(() => {
    setCouponInput("");
    setCouponPreview(null);
  }, [course?.id]);

  if (!hasKey) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-muted-foreground">No course selected.</p>
        <Button
          asChild
          className="mt-4 border-[#0B1F3A]/30 text-[#0B1F3A] hover:bg-[#0B1F3A]/5 dark:border-white/40 dark:text-[#FF8A66]"
          variant="outline"
        >
          <Link href="/courses">Browse catalog</Link>
        </Button>
      </div>
    );
  }

  if (isLoading || restoring || !course || !pricing) {
    return <CheckoutSkeleton />;
  }

  const { list, effective, currency, hasDiscount, offPct, offAmount, isFree } = pricing;

  const totalMinor =
    couponPreview?.valid && typeof couponPreview.amount_minor === "number"
      ? couponPreview.amount_minor
      : effective;

  if (isFree) {
    return (
      <>
        <CheckoutHeader cancelHref={cancelHref} />
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-muted-foreground">
            This course is free — {authed ? "enroll to start learning." : "sign in or create an account, then enroll."}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {authed ? (
              <Button
                className="bg-[#0B1F3A] dark:bg-brand dark:hover:bg-brand-hover font-bold text-white shadow-md hover:bg-[#123252]"
                disabled={freeEnroll.isPending}
                onClick={() => freeEnroll.mutate()}
              >
                {freeEnroll.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Enroll for free
              </Button>
            ) : (
              <>
                <Button
                  asChild
                  className="bg-[#0B1F3A] dark:bg-brand dark:hover:bg-brand-hover font-bold text-white shadow-md hover:bg-[#123252]"
                >
                  <Link href={`/register?next=${encodeURIComponent(`/courses/${course.slug}`)}`}>
                    Create account
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  asChild
                  className="border-2 border-[#0B1F3A]/35 text-[#0B1F3A] hover:bg-[#0B1F3A]/5 dark:border-[#FF6B45]/40 dark:text-[#FF8A66]"
                >
                  <Link href={`/login?next=${encodeURIComponent(`/courses/${course.slug}`)}`}>Sign in</Link>
                </Button>
              </>
            )}
          </div>
          <Button variant="ghost" asChild className="mt-4">
            <Link href={`/courses/${encodeURIComponent(course.slug)}`}>Back to course</Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className="flex min-h-svh flex-col bg-[#f8fafc] dark:bg-[#0a121f]">
      <CheckoutHeader cancelHref={cancelHref} />

      <main className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-5 sm:px-6 sm:py-6 lg:min-h-0 lg:py-7">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-3 gap-1 text-[#0B1F3A]/80 hover:bg-[#0B1F3A]/10 hover:text-[#0B1F3A] dark:text-[#FF8A66]/85 dark:hover:bg-[#123252]/10 dark:hover:text-[#FF8A66] sm:mb-4"
          asChild
        >
          <Link href={cancelHref}>
            <ChevronLeft className="h-4 w-4" />
            Back to course
          </Link>
        </Button>

        <h1 className="text-2xl font-bold tracking-tight text-[#0B1F3A] dark:text-white sm:text-3xl">Checkout</h1>
        <p className="mt-1 text-sm text-muted-foreground">Secure checkout — one course in your order.</p>

        <div className="mt-5 grid grid-cols-1 gap-6 lg:mt-6 lg:grid-cols-2 lg:items-start lg:gap-8 xl:gap-10">
          {/* Left column — billing + payment */}
          <div className="flex min-w-0 flex-col gap-5 lg:gap-6">
            <section className="rounded-2xl border border-[#0B1F3A]/10 bg-white/90 p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-white/20 dark:bg-[#132948]/80 dark:ring-white/[0.04] sm:p-5">
              <h2 className="text-base font-semibold text-[#0B1F3A] dark:text-white">Billing address</h2>
              <div className="mt-4 space-y-2">
                <Label htmlFor="country" className="text-sm text-muted-foreground">
                  Country
                </Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger
                    id="country"
                    className="w-full max-w-none border-[#0B1F3A]/20 bg-white dark:border-white/25 dark:bg-[#143d6e]/70"
                  >
                    <SelectValue placeholder="Country" />
                  </SelectTrigger>
                  <SelectContent className="dark:border-white/25 dark:bg-[#0B1F3A] dark:text-white">
                    <SelectItem value="SO">Somalia</SelectItem>
                    <SelectItem value="KE">Kenya</SelectItem>
                    <SelectItem value="ET">Ethiopia</SelectItem>
                    <SelectItem value="US">United States</SelectItem>
                    <SelectItem value="GB">United Kingdom</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Taxes and invoicing follow your country when your payment provider is connected.
                </p>
              </div>
            </section>

            <PaymentMethodSection form={pay} amountLabel={formatMinor(totalMinor, currency)} itemNoun="course" />

            <section className="space-y-3 lg:hidden">
              <h2 className="text-base font-semibold text-[#0B1F3A] dark:text-white">Your course</h2>
              <div className="flex gap-3 rounded-xl border border-[#0B1F3A]/12 bg-white p-3 shadow-sm ring-1 ring-[#0B1F3A]/[0.06] dark:border-white/20 dark:bg-[#061528]/80 dark:ring-[#E84A27]/10 sm:gap-4 sm:p-4">
                <CheckoutCoverThumb course={course} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug text-foreground line-clamp-3">{course.title}</p>
                  <div className="mt-2 flex flex-wrap items-baseline gap-2">
                    <span className="text-lg font-bold text-foreground">{formatMinor(effective, currency)}</span>
                    {hasDiscount ? (
                      <span className="text-sm text-muted-foreground line-through">
                        {formatMinor(list, currency)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Right column — summary (desktop: aligned height + sticky) */}
          <aside className="lg:sticky lg:top-[4.75rem] lg:max-h-[calc(100svh-5.25rem)] lg:overflow-y-auto lg:overscroll-contain">
            <div className="rounded-2xl border border-[#0B1F3A]/12 bg-white/95 p-5 shadow-[0_12px_40px_-16px_rgba(232,93,4,0.18)] ring-1 ring-[#0B1F3A]/[0.06] dark:border-white/20 dark:bg-[#0B1F3A]/90 dark:shadow-[0_16px_48px_-20px_rgba(0,0,0,0.45)] dark:ring-[#E84A27]/10 sm:p-6">
              <h2 className="text-base font-semibold text-[#0B1F3A] dark:text-white">Order summary</h2>

              <div className="mt-4 hidden gap-3 rounded-xl border border-[#0B1F3A]/10 bg-[#f5f8fd]/80 p-3 dark:border-white/20 dark:bg-[#0c1929]/50 lg:flex">
                <CheckoutCoverThumb course={course} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{course.title}</p>
                </div>
              </div>

              <dl className="mt-4 space-y-2.5 text-sm lg:mt-5">
                {hasDiscount ? (
                  <>
                    <div className="flex justify-between gap-4 text-muted-foreground">
                      <dt>Original price</dt>
                      <dd>{formatMinor(list, currency)}</dd>
                    </div>
                    <div className="flex justify-between gap-4 font-medium text-[#0B1F3A] dark:text-[#FF8A66]">
                      <dt>
                        Discount{offPct > 0 ? ` (${offPct}% off)` : ""}
                      </dt>
                      <dd>−{formatMinor(offAmount, currency)}</dd>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between gap-4 text-muted-foreground">
                    <dt>Subtotal</dt>
                    <dd>{formatMinor(effective, currency)}</dd>
                  </div>
                )}

                {couponPreview?.valid && couponPreview.saved_minor > 0 ? (
                  <div className="flex justify-between gap-4 text-sm font-medium text-[#0B1F3A] dark:text-[#FF8A66]">
                    <dt>
                      Coupon ({couponPreview.code})
                      {couponPreview.discount_percent != null ? (
                        <span className="text-muted-foreground"> · {couponPreview.discount_percent}% off</span>
                      ) : null}
                    </dt>
                    <dd>−{formatMinor(couponPreview.saved_minor, currency)}</dd>
                  </div>
                ) : null}

                <div className="border-t border-border pt-2.5">
                  <div className="flex justify-between gap-4 text-base font-bold text-foreground">
                    <dt>Total</dt>
                    <dd>{formatMinor(totalMinor, currency)}</dd>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">1 course in this order</p>
                </div>
              </dl>

              {authed ? (
                <div className="mt-3 rounded-lg border border-[#0B1F3A]/15 bg-[#f5f8fd]/90 px-2.5 py-2 dark:border-white/20 dark:bg-[#143d6e]/50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Promo code
                    </span>
                    {couponPreview?.valid ? (
                      <button
                        type="button"
                        className="text-[10px] font-medium text-[#0B1F3A] hover:underline dark:text-[#FF8A66]"
                        onClick={() => {
                          setCouponPreview(null);
                          setCouponInput("");
                        }}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Input
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      placeholder="Code"
                      className="h-8 min-w-0 flex-1 border-[#0B1F3A]/20 bg-white px-2.5 text-xs placeholder:text-muted-foreground/70 dark:border-white/15 dark:bg-[#143d6e]/70"
                      disabled={applyCouponMutation.isPending}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          applyCouponMutation.mutate(couponInput);
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 shrink-0 border-[#0B1F3A]/25 bg-[#0B1F3A]/10 px-3 text-xs font-semibold text-[#0B1F3A] hover:bg-[#0B1F3A]/15 dark:border-white/35 dark:bg-[#E84A27]/15 dark:text-[#FF8A66] dark:hover:bg-[#123252]/25"
                      disabled={applyCouponMutation.isPending || !couponInput.trim()}
                      onClick={() => applyCouponMutation.mutate(couponInput)}
                    >
                      {applyCouponMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Apply"
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}

              <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                By paying you agree to our terms. Your provider processes payment when connected.
              </p>

              {!authed ? (
                <div className="mt-5 space-y-2.5">
                  <Button
                    asChild
                    className="h-12 w-full rounded-xl bg-[#0B1F3A] dark:bg-brand dark:hover:bg-brand-hover text-base font-bold text-white shadow-lg shadow-[#0B1F3A]/20 hover:bg-[#123252]"
                    size="lg"
                  >
                    <Link
                      href={`/login?next=${encodeURIComponent(`/checkout?slug=${encodeURIComponent(course.slug)}`)}`}
                    >
                      Sign in to pay
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    asChild
                    className="w-full border-2 border-[#0B1F3A]/30 text-[#0B1F3A] hover:bg-[#0B1F3A]/5 dark:border-white/40 dark:text-[#FF8A66] dark:hover:bg-[#123252]/10"
                  >
                    <Link
                      href={`/register?next=${encodeURIComponent(`/checkout?slug=${encodeURIComponent(course.slug)}`)}`}
                    >
                      Create account
                    </Link>
                  </Button>
                </div>
              ) : (
                <Button
                  className="mt-5 h-11 w-full rounded-xl bg-[#0B1F3A] dark:bg-brand dark:hover:bg-brand-hover text-[15px] font-bold text-white shadow-lg shadow-[#0B1F3A]/25 transition hover:bg-[#123252] hover:shadow-[0_0_28px_-6px_rgba(11,31,58,0.40)] sm:h-12 sm:text-base"
                  size="lg"
                  disabled={initiate.isPending || freeEnroll.isPending || waafi.isPending}
                  onClick={() => {
                    const coupon_code = couponPreview?.valid && couponPreview.code ? couponPreview.code : undefined;
                    if (totalMinor <= 0) {
                      // a 100% coupon: the server checks the coupon, records the order and opens the course
                      // (calling "enroll" without the coupon was refused with 402 — Phase 2 test)
                      if (coupon_code) initiate.mutate({ coupon_code });
                      else freeEnroll.mutate();
                      return;
                    }
                    if (payMethod === "wafi") {
                      pay.setWafiPhoneTouched(true);
                      if (!isValidSomaliMobile(wafiPhone)) {
                        toast.error("Enter your 9-digit mobile wallet number, e.g. 61 234 5678.");
                        return;
                      }
                      setWaafiDialog({
                        phase: "waiting",
                        phone: wafiPhone.trim(),
                        amount: formatMinor(totalMinor, currency),
                      });
                      waafi.mutate({ phone: wafiPhone.trim(), coupon_code });
                      return;
                    }
                    if (senderPhone.trim() && !isValidSomaliMobile(senderPhone)) {
                      toast.error("Enter the 9-digit number you paid from, e.g. 61 234 5678.");
                      return;
                    }
                    initiate.mutate(coupon_code ? { coupon_code } : undefined);
                  }}
                >
                  {initiate.isPending || freeEnroll.isPending || waafi.isPending ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <Lock className="mr-2 h-4 w-4" />
                  )}
                  {totalMinor <= 0
                    ? "Enroll for free"
                    : payMethod === "wafi"
                      ? `Pay ${formatMinor(totalMinor, currency)}`
                      : "Submit payment request"}
                </Button>
              )}

              <div className="mt-5 border-t border-border pt-4">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[#0B1F3A] dark:text-[#FF8A66]" />
                  30-day money-back
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  Full refund within 30 days if you are not satisfied.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>
      <WaafiDialog
        state={waafiDialog}
        onClose={() => setWaafiDialog(null)}
        successLabel="Start learning"
        onSuccess={(r) => {
          setWaafiDialog(null);
          router.push(`/learn/${encodeURIComponent(r.course_slug || course.slug)}`);
        }}
      />
      <ManualOrderDialog
        order={manualDone}
        closeLabel="Go to my payments"
        onClose={() => {
          setManualDone(null);
          router.push("/dashboard/payments");
        }}
      />
    </div>
  );
}

export function CheckoutExperience() {
  return (
    <Suspense
      fallback={
        <>
          <header className="border-b border-[#0B1F3A]/12 bg-white/90 dark:border-white/20 dark:bg-[#1a2f4a]/90">
            <div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6">
              <Skeleton className="h-8 w-28" />
            </div>
          </header>
          <CheckoutSkeleton />
        </>
      }
    >
      <CheckoutSwitch />
    </Suspense>
  );
}

/** /checkout?book=<slug> buys a book; /checkout?slug=<slug> (or ?courseId=) a course. */
function CheckoutSwitch() {
  const book = useSearchParams().get("book")?.trim();
  return book ? <BookCheckout slug={book} /> : <CheckoutInner />;
}
