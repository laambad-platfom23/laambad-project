"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { CodeInput } from "@/components/auth/code-input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useAuthStore } from "@/store/auth-store";
import { authApi } from "@/services/api/auth";
import { getApiErrorMessage } from "@/lib/utils";
import { defaultDashboardPathForUser } from "@/lib/auth-routing";
import { safeNextPath } from "@/lib/safe-redirect";

function VerifyEmailInner() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { user, isLoading, logout } = useAuth();
  const setUser = useAuthStore((s) => s.setUser);
  const next = safeNextPath(params.get("next"));
  const alreadySent = params.get("sent") === "1";

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(alreadySent ? 60 : 0);
  const [done, setDone] = useState(false);
  const autoSent = useRef(false);

  const goOn = () => router.replace(next ?? (user ? defaultDashboardPathForUser(user) : "/"));

  useEffect(() => {
    if (!isLoading && !user && typeof window !== "undefined" && !localStorage.getItem("access_token")) {
      router.replace(`/login?next=${encodeURIComponent(`/verify-email${next ? `?next=${encodeURIComponent(next)}` : ""}`)}`);
    }
  }, [isLoading, user, router, next]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async () => {
    setSending(true);
    try {
      const { data } = await authApi.sendVerificationCode();
      if (data.already_verified) {
        if (user) setUser({ ...user, email_verified: true });
        setDone(true);
        return;
      }
      toast.success("We sent a 6-digit code to your e-mail.");
      setCooldown(60);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not send the code."));
    } finally {
      setSending(false);
    }
  };

  // first visit: send a code automatically (unless sign-up just sent one)
  useEffect(() => {
    if (!user || autoSent.current) return;
    autoSent.current = true;
    if (user.email_verified) {
      setDone(true);
      return;
    }
    if (!alreadySent) void send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return toast.error("Enter the 6-digit code from the e-mail.");
    setBusy(true);
    try {
      await authApi.verifyEmail(code);
      if (user) setUser({ ...user, email_verified: true });
      await queryClient.invalidateQueries();
      setDone(true);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not verify the code."));
    } finally {
      setBusy(false);
    }
  };

  if (!user) return <Skeleton className="mx-auto h-[24rem] w-full max-w-[400px] rounded-[1.75rem]" />;

  return (
    <div className="mx-auto w-full max-w-[400px]">
      <div className="rounded-[1.75rem] border border-black/[0.04] bg-white p-7 text-center shadow-[0_22px_55px_-20px_rgba(11,31,58,0.35)] dark:border-white/15 dark:bg-[#061528] sm:p-8">
        {done ? (
          <>
            <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
            <h1 className="mt-3 text-xl font-bold text-[#0B1F3A] dark:text-white">E-mail verified</h1>
            <p className="mt-2 text-sm text-muted-foreground">Thank you. Your account is ready.</p>
            <Button className="mt-6 h-11 w-full rounded-full bg-brand font-bold text-white hover:bg-brand-hover" onClick={goOn}>
              Continue
            </Button>
          </>
        ) : (
          <>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10">
              <MailCheck className="h-6 w-6 text-brand" />
            </span>
            <h1 className="mt-3 text-xl font-bold text-[#0B1F3A] dark:text-white">Verify your e-mail</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Enter the 6-digit code we sent to <strong className="break-all text-foreground">{user.email}</strong>. Check spam too.
            </p>
            <form onSubmit={verify} className="mt-6 space-y-4 text-left">
              <CodeInput value={code} onChange={setCode} disabled={busy} autoFocus />
              <Button type="submit" disabled={busy || code.length !== 6} className="h-11 w-full rounded-full bg-brand font-bold text-white hover:bg-brand-hover">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Verify
              </Button>
            </form>
            <div className="mt-4 flex items-center justify-between text-[13px]">
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => logout()}>
                Use another account
              </button>
              <button
                type="button"
                className="font-semibold text-brand hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                disabled={sending || cooldown > 0}
                onClick={send}
              >
                {sending ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Send a new code"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthPageShell>
      <Suspense fallback={<Skeleton className="mx-auto h-[24rem] w-full max-w-[400px] rounded-[1.75rem]" />}>
        <VerifyEmailInner />
      </Suspense>
    </AuthPageShell>
  );
}
