"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronLeft,
  Clock,
  Loader2,
  Lock,
  ShieldCheck,
  Smartphone,
  Wallet,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { coursesApi, type CouponPreviewResponse } from "@/services/api/courses";
import { paymentsApi, type InitiatePaymentBody, type WaafiPayResult } from "@/services/api/payments";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
import { Logo } from "@/components/ui/logo";
import type { Course } from "@/types";
import { getApiErrorMessage } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { courseCoverRawUrl, publicCourseCoverImageUrlFromRaw } from "@/lib/course-cover";
import { cn } from "@/lib/utils";

function formatMinor(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase() || "USD",
  }).format(amount / 100);
}

/** Somali mobile: 9 digits (61/77 EVC, 62/65 eDahab, 63 Zaad, 90 Sahal …); optional +252 / 0 prefix. Same rule as the server. */
function isValidSomaliMobile(raw: string): boolean {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00252")) d = d.slice(5);
  else if (d.startsWith("252")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return /^(6[1-9]|7[0-9]|9[0-9])\d{7}$/.test(d);
}

function MethodButton({
  active,
  onClick,
  icon,
  title,
  subtitle,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: React.ReactNode;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex w-full items-start gap-3 px-3 py-3 text-left transition-colors sm:px-4"
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 rounded-full border-2",
          active ? "border-[#0B1F3A] bg-[#0B1F3A] dark:border-[#FF6B45]" : "border-muted-foreground/40"
        )}
      >
        {active ? <span className="m-auto block h-1.5 w-1.5 rounded-full bg-white" /> : null}
      </span>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-medium text-foreground">
          {title}
          {badge ? (
            <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[12.5px] text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}

type WaafiDialogState =
  | { phase: "waiting"; phone: string; amount: string }
  | { phase: "done"; result: WaafiPayResult }
  | { phase: "error"; message: string }
  | null;

function WaafiDialog({
  state,
  onClose,
  onOpenCourse,
}: {
  state: WaafiDialogState;
  onClose: () => void;
  onOpenCourse: (slug: string) => void;
}) {
  const waiting = state?.phase === "waiting";
  const result = state?.phase === "done" ? state.result : null;
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && !waiting && onClose()}>
      <DialogContent
        className="max-w-sm text-center [&>button]:hidden"
        onInteractOutside={(e) => waiting && e.preventDefault()}
        onEscapeKeyDown={(e) => waiting && e.preventDefault()}
      >
        {waiting && state?.phase === "waiting" ? (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand/10">
              <Smartphone className="h-8 w-8 animate-pulse text-brand" />
            </div>
            <DialogTitle className="text-lg">Check your phone</DialogTitle>
            <DialogDescription className="text-[14px] leading-relaxed">
              A payment request of <strong className="text-foreground">{state.amount}</strong> was sent to{" "}
              <strong className="font-mono text-foreground">{state.phone}</strong>. Enter your PIN to confirm.
            </DialogDescription>
            <p className="flex items-center justify-center gap-2 text-[12.5px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Waiting for confirmation… do not close this page.
            </p>
          </>
        ) : result?.outcome === "approved" ? (
          <>
            <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
            <DialogTitle className="text-lg">Payment successful</DialogTitle>
            <DialogDescription>{result.message}</DialogDescription>
            <Button className="mt-2 w-full bg-brand-navy text-white hover:bg-brand-navy/90" onClick={() => onOpenCourse(result.course_slug)}>
              Start learning
            </Button>
          </>
        ) : result?.outcome === "unknown" ? (
          <>
            <Clock className="mx-auto h-14 w-14 text-warning" />
            <DialogTitle className="text-lg">Payment not confirmed yet</DialogTitle>
            <DialogDescription>{result.message}</DialogDescription>
            <Button variant="outline" className="mt-2 w-full" onClick={onClose}>
              Close
            </Button>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-14 w-14 text-destructive" />
            <DialogTitle className="text-lg">Payment not completed</DialogTitle>
            <DialogDescription>
              {result?.message ?? (state?.phase === "error" ? state.message : "Please try again.")}
            </DialogDescription>
            <Button variant="outline" className="mt-2 w-full" onClick={onClose}>
              Try again
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

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

function CheckoutSkeleton() {
  return (
    <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-6xl flex-col px-4 py-6 sm:px-6">
      <Skeleton className="mb-4 h-8 w-40" />
      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8 lg:items-start">
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
        <Skeleton className="min-h-[280px] w-full rounded-2xl lg:sticky lg:top-[4.75rem]" />
      </div>
    </div>
  );
}

function CheckoutInner() {
  const searchParams = useSearchParams();
  const courseId = searchParams.get("courseId")?.trim() ?? "";
  const slug = searchParams.get("slug")?.trim() ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const authed = !!useAuthStore((s) => s.user);
  const hasKey = !!slug || !!courseId;
  const [country, setCountry] = useState("SO");
  const [payMethod, setPayMethod] = useState<"offline" | "wafi">("wafi");
  const [wafiPhone, setWafiPhone] = useState("");
  const [wafiPhoneTouched, setWafiPhoneTouched] = useState(false);
  const [senderPhone, setSenderPhone] = useState("");
  const [payRef, setPayRef] = useState("");
  const [waafiDialog, setWaafiDialog] = useState<WaafiDialogState>(null);
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
      await queryClient.invalidateQueries({ queryKey: ["my-payments"] });
      if (payment.status === "paid") {
        toast.success("You're enrolled!");
        router.push(`/learn/${encodeURIComponent(course!.slug)}`);
        return;
      }
      toast.success("Request submitted. We will open your course as soon as we confirm your transfer.");
      router.push("/dashboard/payments");
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
      await queryClient.invalidateQueries({ queryKey: ["my-payments"] });
      if (result.outcome === "approved") {
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

  if (isLoading || !course || !pricing) {
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

            <section className="rounded-2xl border border-[#0B1F3A]/10 bg-white/90 p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-white/20 dark:bg-[#132948]/80 dark:ring-white/[0.04] sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-[#0B1F3A] dark:text-white">Payment method</h2>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0B1F3A] dark:text-[#FF8A66]">
                  <Lock className="h-3 w-3" />
                  Encrypted
                </span>
              </div>

              <div className="mt-4 divide-y divide-[#0B1F3A]/10 overflow-hidden rounded-xl border border-[#0B1F3A]/12 bg-white shadow-sm dark:divide-white/10 dark:border-white/20 dark:bg-[#061528]/80">
                {/* 1 — WaafiPay: USSD prompt + PIN on the phone */}
                <div className={cn(payMethod === "wafi" && "bg-[#E84A27]/[0.07] dark:bg-[#061528]")}>
                  <MethodButton
                    active={payMethod === "wafi"}
                    onClick={() => setPayMethod("wafi")}
                    icon={<Wallet className="h-5 w-5 shrink-0 text-muted-foreground" />}
                    title="WaafiPay"
                    subtitle="EVC Plus · Zaad · Sahal · eDahab — pay now with your PIN"
                    badge="Instant"
                  />
                  {payMethod === "wafi" ? (
                    <div className="space-y-2.5 border-t border-[#0B1F3A]/10 bg-[#f8fafc] px-3 py-3 dark:border-white/15 dark:bg-[#0c1929]/55 sm:px-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="wafi-phone" className="text-xs font-medium">
                          Mobile wallet number
                        </Label>
                        <div className="flex">
                          <span className="inline-flex h-11 items-center rounded-l-md border border-r-0 border-[#0B1F3A]/20 bg-muted px-3 text-sm font-medium text-muted-foreground dark:border-white/15">
                            +252
                          </span>
                          <Input
                            id="wafi-phone"
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel-national"
                            placeholder="61 234 5678"
                            maxLength={20}
                            value={wafiPhone}
                            onChange={(e) => setWafiPhone(e.target.value)}
                            onBlur={() => setWafiPhoneTouched(true)}
                            className={cn(
                              "h-11 rounded-l-none border-[#0B1F3A]/20 bg-white dark:border-white/15 dark:bg-[#143d6e]/70",
                              wafiPhoneTouched &&
                                wafiPhone.trim() &&
                                !isValidSomaliMobile(wafiPhone) &&
                                "border-destructive focus-visible:ring-destructive"
                            )}
                          />
                        </div>
                        {wafiPhoneTouched && wafiPhone.trim() && !isValidSomaliMobile(wafiPhone) ? (
                          <p className="text-xs text-destructive">Enter a 9-digit Somali mobile number, e.g. 61 234 5678.</p>
                        ) : null}
                      </div>
                      <ol className="space-y-1 text-[12.5px] leading-snug text-muted-foreground">
                        <li>
                          <strong className="text-foreground">1.</strong> Press <strong className="text-foreground">Pay</strong> —
                          a payment request appears on your phone.
                        </li>
                        <li>
                          <strong className="text-foreground">2.</strong> Enter your wallet <strong className="text-foreground">PIN</strong> to
                          confirm. The course opens right away.
                        </li>
                      </ol>
                    </div>
                  ) : null}
                </div>

                {/* 2 — Manual: send to the institute number, an admin verifies and opens the course */}
                <div className={cn(payMethod === "offline" && "bg-[#E84A27]/[0.07] dark:bg-[#061528]")}>
                  <MethodButton
                    active={payMethod === "offline"}
                    onClick={() => setPayMethod("offline")}
                    icon={<Smartphone className="h-5 w-5 shrink-0 text-muted-foreground" />}
                    title="Manual payment"
                    subtitle={
                      <>
                        EVC Plus to <span className="font-mono font-medium text-foreground">+252 61 9993660</span> · approved by admin
                      </>
                    }
                  />
                  {payMethod === "offline" ? (
                    <div className="space-y-3 border-t border-[#0B1F3A]/10 bg-[#f8fafc] px-3 py-3 dark:border-white/15 dark:bg-[#0c1929]/55 sm:px-4">
                      <p className="text-[13px] leading-snug text-muted-foreground">
                        Send <strong className="text-foreground">{formatMinor(totalMinor, currency)}</strong> with{" "}
                        <strong className="text-foreground">EVC Plus</strong> to{" "}
                        <strong className="font-mono text-foreground">+252 61 9993660</strong>, then submit this form. We
                        check the transfer and open your course — usually within a few business hours.
                      </p>
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="sender-phone" className="text-xs font-medium">
                            Number you paid from
                          </Label>
                          <Input
                            id="sender-phone"
                            type="tel"
                            inputMode="numeric"
                            placeholder="61 234 5678"
                            maxLength={20}
                            value={senderPhone}
                            onChange={(e) => setSenderPhone(e.target.value)}
                            className={cn(
                              "h-10 border-[#0B1F3A]/20 bg-white dark:border-white/15 dark:bg-[#143d6e]/70",
                              senderPhone.trim() && !isValidSomaliMobile(senderPhone) && "border-destructive"
                            )}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="pay-ref" className="text-xs font-medium">
                            Transaction ID <span className="font-normal text-muted-foreground">(optional)</span>
                          </Label>
                          <Input
                            id="pay-ref"
                            placeholder="From the EVC SMS"
                            maxLength={64}
                            value={payRef}
                            onChange={(e) => setPayRef(e.target.value)}
                            className="h-10 border-[#0B1F3A]/20 bg-white dark:border-white/15 dark:bg-[#143d6e]/70"
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

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
                    if (totalMinor <= 0) {
                      freeEnroll.mutate();
                      return;
                    }
                    const coupon_code = couponPreview?.valid && couponPreview.code ? couponPreview.code : undefined;
                    if (payMethod === "wafi") {
                      setWafiPhoneTouched(true);
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
        onOpenCourse={(s) => {
          setWaafiDialog(null);
          router.push(`/learn/${encodeURIComponent(s)}`);
        }}
      />
    </div>
  );
}

function CheckoutHeader({ cancelHref }: { cancelHref: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#0B1F3A]/12 bg-white/90 shadow-[0_1px_0_rgba(232,93,4,0.06)] backdrop-blur-md dark:border-white/20 dark:bg-[#1a2f4a]/90 dark:shadow-[0_1px_0_rgba(232,93,4,0.08)]">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
        <Logo size="sm" href="/" />
        <Link
          href={cancelHref}
          className="text-sm font-semibold text-[#0B1F3A] transition-colors hover:text-[#FF8A66] dark:text-[#FF8A66] dark:hover:text-white"
        >
          Cancel
        </Link>
      </div>
    </header>
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
      <CheckoutInner />
    </Suspense>
  );
}
