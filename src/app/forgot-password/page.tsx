"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Mail } from "lucide-react";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { CodeInput } from "@/components/auth/code-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { authApi } from "@/services/api/auth";
import { getApiErrorMessage } from "@/lib/utils";

const field =
  "h-11 rounded-xl text-[15px] focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:ring-offset-0";

function ForgotPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const linkEmail = params.get("email") ?? "";
  const linkCode = (params.get("code") ?? "").replace(/\D/g, "").slice(0, 6);

  const [step, setStep] = useState<"request" | "reset" | "done">(linkEmail && linkCode ? "reset" : "request");
  const [email, setEmail] = useState(linkEmail);
  const [code, setCode] = useState(linkCode);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const request = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const em = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(em)) {
      toast.error("Enter the e-mail address of your account.");
      return;
    }
    setBusy(true);
    try {
      await authApi.forgotPassword(em);
      toast.success("If an account exists for this e-mail, a code is on its way.");
      setStep("reset");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not send the code. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return toast.error("Enter the 6-digit code from the e-mail.");
    if (password.length < 8) return toast.error("The new password needs at least 8 characters.");
    if (password !== confirm) return toast.error("The two passwords do not match.");
    setBusy(true);
    try {
      await authApi.resetPassword({ email: email.trim().toLowerCase(), code, password });
      setStep("done");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not reset the password."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[400px]">
      <div className="rounded-[1.75rem] border border-black/[0.04] bg-white p-7 shadow-[0_22px_55px_-20px_rgba(11,31,58,0.35)] dark:border-white/15 dark:bg-[#061528] sm:p-8">
        {step === "done" ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
            <h1 className="mt-3 text-xl font-bold text-[#0B1F3A] dark:text-white">Password changed</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You can now sign in with your new password. For your safety you were signed out on every device.
            </p>
            <Button className="mt-6 h-11 w-full rounded-full bg-brand font-bold text-white hover:bg-brand-hover" onClick={() => router.push("/login")}>
              Sign in
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-6 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10">
                {step === "request" ? <Mail className="h-6 w-6 text-brand" /> : <KeyRound className="h-6 w-6 text-brand" />}
              </span>
              <h1 className="mt-3 text-xl font-bold text-[#0B1F3A] dark:text-white">
                {step === "request" ? "Forgot your password?" : "Set a new password"}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {step === "request" ? (
                  "Enter your account e-mail. We will send you a 6-digit code."
                ) : (
                  <>
                    Enter the code we sent to <strong className="text-foreground">{email || "your e-mail"}</strong>. Check spam too.
                  </>
                )}
              </p>
            </div>

            {step === "request" ? (
              <form onSubmit={request} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                    className={field}
                    autoFocus
                  />
                </div>
                <Button type="submit" disabled={busy} className="h-11 w-full rounded-full bg-brand font-bold text-white hover:bg-brand-hover">
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Send code
                </Button>
              </form>
            ) : (
              <form onSubmit={reset} className="space-y-4">
                {!linkEmail ? null : (
                  <p className="rounded-lg bg-muted px-3 py-2 text-center text-[13px] text-muted-foreground">{email}</p>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="code">Code</Label>
                  <CodeInput value={code} onChange={setCode} disabled={busy} autoFocus={!linkCode} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">New password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={show ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                      className={`${field} pr-11`}
                      autoFocus={!!linkCode}
                    />
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
                      aria-label={show ? "Hide password" : "Show password"}
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Repeat new password</Label>
                  <Input
                    id="confirm-password"
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    disabled={busy}
                    className={field}
                  />
                </div>
                <Button type="submit" disabled={busy} className="h-11 w-full rounded-full bg-brand font-bold text-white hover:bg-brand-hover">
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Change password
                </Button>
                <div className="flex items-center justify-between text-[13px]">
                  <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setStep("request")} disabled={busy}>
                    Change e-mail
                  </button>
                  <button type="button" className="font-semibold text-brand hover:underline" onClick={() => request()} disabled={busy}>
                    Send a new code
                  </button>
                </div>
              </form>
            )}

            <Link href="/login" className="mt-6 inline-flex w-full items-center justify-center gap-1.5 text-[13px] font-semibold text-[#0B1F3A] hover:underline dark:text-white">
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <AuthPageShell>
      <Suspense fallback={<Skeleton className="mx-auto h-[26rem] w-full max-w-[400px] rounded-[1.75rem]" />}>
        <ForgotPasswordInner />
      </Suspense>
    </AuthPageShell>
  );
}
