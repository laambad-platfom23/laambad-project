"use client";

/**
 * Pieces shared by the course checkout and the book checkout: the payment methods (WaafiPay with the
 * PIN on the phone, or a manual EVC transfer an admin approves), the "check your phone" dialog, the
 * WhatsApp dialog after a manual order, the header and the loading skeleton.
 */
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Loader2, Lock, Smartphone, Wallet, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import { SODEMY_CONTACT } from "@/lib/sodemy-contact";
import { useAuth } from "@/hooks/use-auth";
import { MANUAL_PAYMENT, WAAFI_WALLETS } from "@/lib/payment-info";

/**
 * The checkout has no site header, and it is often opened directly (a refresh, the link after signing
 * in): restore the signed-in user from the saved token here, and say when that is still going on.
 */
export function useCheckoutUser() {
  const { user, isLoading } = useAuth();
  return { authed: !!user, restoring: !user && isLoading };
}

export function formatMinor(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase() || "USD",
  }).format(amount / 100);
}

/** Somali mobile: 9 digits (61/77 EVC Plus, 63 Zaad, 90 Sahal …); optional +252 / 0 prefix. Same rule as the server. */
export function isValidSomaliMobile(raw: string): boolean {
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
          active ? "border-[#E84A27] bg-[#E84A27] dark:border-[#FF6B45] dark:bg-[#FF6B45]" : "border-muted-foreground/40"
        )}
      >
        {active ? <span className="m-auto block h-1.5 w-1.5 rounded-full bg-white" /> : null}
      </span>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-medium text-foreground">
          {title}
          {badge ? (
            <span className="rounded-full bg-[#E84A27]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#E84A27] dark:bg-[#FF6B45]/15 dark:text-[#FF8A66]">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[12.5px] text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}

/** The payment form state (which method, the wallet number, the manual transfer details). */
export function usePaymentForm() {
  const [method, setMethod] = useState<"offline" | "wafi">("wafi");
  const [wafiPhone, setWafiPhone] = useState("");
  const [wafiPhoneTouched, setWafiPhoneTouched] = useState(false);
  const [senderPhone, setSenderPhone] = useState("");
  const [payRef, setPayRef] = useState("");
  return { method, setMethod, wafiPhone, setWafiPhone, wafiPhoneTouched, setWafiPhoneTouched, senderPhone, setSenderPhone, payRef, setPayRef };
}
export type PaymentForm = ReturnType<typeof usePaymentForm>;

/** "Payment method": WaafiPay (instant, PIN on the phone) or a manual EVC transfer to the institute number. */
export function PaymentMethodSection({ form, amountLabel, itemNoun }: { form: PaymentForm; amountLabel: string; itemNoun: "course" | "book" }) {
  const { method, setMethod, wafiPhone, setWafiPhone, wafiPhoneTouched, setWafiPhoneTouched, senderPhone, setSenderPhone, payRef, setPayRef } = form;
  return (
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
        <div
          className={cn(
            "border-l-[3px] border-l-transparent transition-colors",
            method === "wafi" && "border-l-[#E84A27] bg-[#0B1F3A]/[0.03] dark:bg-[#061528]"
          )}
        >
          <MethodButton
            active={method === "wafi"}
            onClick={() => setMethod("wafi")}
            icon={<Wallet className="h-5 w-5 shrink-0 text-muted-foreground" />}
            title="WaafiPay"
            subtitle={`${WAAFI_WALLETS} — pay now with your PIN`}
            badge="Instant"
          />
          {method === "wafi" ? (
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
                      wafiPhoneTouched && wafiPhone.trim() && !isValidSomaliMobile(wafiPhone) && "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                </div>
                {wafiPhoneTouched && wafiPhone.trim() && !isValidSomaliMobile(wafiPhone) ? (
                  <p className="text-xs text-destructive">Enter a 9-digit Somali mobile number, e.g. 61 234 5678.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* 2 — Manual: send to the institute number, an admin verifies and opens the item */}
        <div
          className={cn(
            "border-l-[3px] border-l-transparent transition-colors",
            method === "offline" && "border-l-[#E84A27] bg-[#0B1F3A]/[0.03] dark:bg-[#061528]"
          )}
        >
          <MethodButton
            active={method === "offline"}
            onClick={() => setMethod("offline")}
            icon={<Smartphone className="h-5 w-5 shrink-0 text-muted-foreground" />}
            title="Manual payment"
            subtitle={
              <>
                {MANUAL_PAYMENT.evc.label} <span className="font-mono font-medium text-foreground">{MANUAL_PAYMENT.evc.number}</span> ·{" "}
                {MANUAL_PAYMENT.bank.label} <span className="font-mono font-medium text-foreground">{MANUAL_PAYMENT.bank.account}</span> · approved by
                admin
              </>
            }
          />
          {method === "offline" ? (
            <div className="space-y-3 border-t border-[#0B1F3A]/10 bg-[#f8fafc] px-3 py-3 dark:border-white/15 dark:bg-[#0c1929]/55 sm:px-4">
              <p className="text-[13px] leading-snug text-muted-foreground">
                Send <strong className="text-foreground">{amountLabel}</strong> to one of these, then submit this form. We check the transfer and
                open your {itemNoun} — usually within a few business hours.
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                <li className="rounded-lg border border-[#0B1F3A]/12 bg-white px-3 py-2 dark:border-white/15 dark:bg-[#143d6e]/40">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{MANUAL_PAYMENT.evc.label}</span>
                  <span className="font-mono text-[15px] font-semibold text-foreground">{MANUAL_PAYMENT.evc.number}</span>
                </li>
                <li className="rounded-lg border border-[#0B1F3A]/12 bg-white px-3 py-2 dark:border-white/15 dark:bg-[#143d6e]/40">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {MANUAL_PAYMENT.bank.label} · account
                  </span>
                  <span className="font-mono text-[15px] font-semibold text-foreground">{MANUAL_PAYMENT.bank.account}</span>
                </li>
              </ul>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sender-phone" className="text-xs font-medium">
                    Number you paid from <span className="font-normal text-muted-foreground">(EVC Plus)</span>
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
                    Transaction ID / bank reference
                  </Label>
                  <Input
                    id="pay-ref"
                    placeholder="From the SMS or the bank receipt"
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
  );
}

export type WaafiResultLike = { outcome: "approved" | "declined" | "unknown"; message: string };

export type WaafiDialogState<R extends WaafiResultLike = WaafiResultLike> =
  | { phase: "waiting"; phone: string; amount: string }
  | { phase: "done"; result: R }
  | { phase: "error"; message: string }
  | null;

/** WaafiPay: "check your phone" while the PIN prompt is open, then the outcome. */
export function WaafiDialog<R extends WaafiResultLike>({
  state,
  onClose,
  successLabel,
  onSuccess,
}: {
  state: WaafiDialogState<R>;
  onClose: () => void;
  successLabel: string;
  onSuccess: (result: R) => void;
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
            {/* wrapped: "[&>button]:hidden" above hides the corner ✕, and would hide a bare button too */}
            <div className="mt-2">
              <Button className="w-full bg-brand-navy text-white hover:bg-brand-navy/90" onClick={() => onSuccess(result)}>
                {successLabel}
              </Button>
            </div>
          </>
        ) : result?.outcome === "unknown" ? (
          <>
            <Clock className="mx-auto h-14 w-14 text-warning" />
            <DialogTitle className="text-lg">Payment not confirmed yet</DialogTitle>
            <DialogDescription>{result.message}</DialogDescription>
            <div className="mt-2">
              <Button variant="outline" className="w-full" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-14 w-14 text-destructive" />
            <DialogTitle className="text-lg">Payment not completed</DialogTitle>
            <DialogDescription>{result?.message ?? (state?.phase === "error" ? state.message : "Please try again.")}</DialogDescription>
            <div className="mt-2">
              <Button variant="outline" className="w-full" onClick={onClose}>
                Try again
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export type ManualOrder = {
  kind: "course" | "book";
  title: string;
  amount: string;
  senderPhone: string;
  reference: string;
  paymentId: string;
};

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.48-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.57.93.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.23-9.43 9.44-9.43a9.4 9.4 0 0 1 9.43 9.44c0 5.2-4.24 9.43-9.44 9.43m8.03-17.47A11.3 11.3 0 0 0 12.05.7C5.79.7.7 5.79.7 12.04c0 2 .52 3.95 1.52 5.67L.6 23.6l6.02-1.58a11.3 11.3 0 0 0 5.42 1.38h.01c6.25 0 11.34-5.09 11.35-11.34 0-3.03-1.18-5.88-3.32-8.02" />
    </svg>
  );
}

/** After a manual (EVC to the institute number) order: one tap opens WhatsApp with the order details filled in. */
export function ManualOrderDialog({ order, onClose, closeLabel }: { order: ManualOrder | null; onClose: () => void; closeLabel: string }) {
  const waNumber = SODEMY_CONTACT.whatsappUrl.replace(/\D/g, "");
  const book = order?.kind === "book";
  const text = order
    ? [
        `Asc, waxaan iibsaday ${book ? "buug" : "koorso"} Laambad (Manual payment).`,
        `${book ? "Buugga" : "Koorsada"}: ${order.title}`,
        `Lacagta: ${order.amount}`,
        order.senderPhone ? `Lambarka aan ka diray: ${order.senderPhone}` : "",
        order.reference ? `Transaction ID: ${order.reference}` : "",
        order.paymentId ? `Order: ${order.paymentId.slice(0, 8)}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";
  const href = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
        <DialogTitle className="text-lg">Order submitted</DialogTitle>
        <DialogDescription className="text-[14px] leading-relaxed">
          Send us your payment confirmation on WhatsApp and we will open your {book ? "book" : "course"} as soon as we check the transfer.
        </DialogDescription>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] text-[15px] font-semibold text-white shadow-sm transition hover:bg-[#1ebe57]"
        >
          <WhatsAppIcon className="h-5 w-5" />
          Send on WhatsApp
        </a>
        <Button variant="outline" className="w-full" onClick={onClose}>
          {closeLabel}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function CheckoutHeader({ cancelHref }: { cancelHref: string }) {
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

export function CheckoutSkeleton() {
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
