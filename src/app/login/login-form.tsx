"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useAuthStore } from "@/store/auth-store";
import { authApi } from "@/services/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { passkeysApi } from "@/services/api/student-features";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Fingerprint,
  Loader2,
  Lock,
  Mail,
  Moon,
  Sun,
} from "lucide-react";
import { cn, getApiErrorMessage } from "@/lib/utils";
import { defaultDashboardPathForUser, isStaffUser } from "@/lib/auth-routing";
import { safeNextPath } from "@/lib/safe-redirect";

function BrandCap({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 48"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M32 6L4 18l28 12 24-10.3V36h4V18L32 6Z" fill="#0B1F3A" className="dark:fill-white" />
      <path
        d="M12 22.5v10.2c0 3.4 8.2 6.3 20 6.3s20-2.9 20-6.3V22.5"
        stroke="#0B1F3A"
        className="dark:stroke-white"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M52 20v14" stroke="#E84A27" strokeWidth="3" strokeLinecap="round" />
      <circle cx="52" cy="36" r="3.2" fill="#E84A27" />
    </svg>
  );
}

const fieldShell =
  "flex h-[52px] items-center overflow-hidden rounded-full border border-[#B8C4D0] bg-white transition [--autofill-bg:#ffffff] focus-within:border-brand focus-within:shadow-[0_0_0_3px_rgba(232,74,39,0.15)] dark:border-white/25 dark:bg-[#050f1e] dark:[--autofill-bg:#050f1e] dark:focus-within:border-brand";

const fieldInput =
  "h-[52px] flex-1 rounded-none border-0 bg-transparent px-3.5 text-[15px] text-[#0B1F3A] shadow-none placeholder:text-[#A0AAB4] focus-visible:ring-0 dark:text-white dark:placeholder:text-white/45";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const { login, setUser, logout } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  useEffect(() => setPasskeySupported(browserSupportsWebAuthn()), []);

  /** After the server returned tokens (password or passkey): load the profile and go on. */
  const finishLogin = async (data: { access_token?: string; token?: string; refresh_token: string }) => {
    login((data.access_token || data.token)!, data.refresh_token);
    let profile;
    try {
      const me = await authApi.me();
      profile = me.data;
      setUser(profile);
    } catch {
      logout();
      toast.error("Signed in but could not load your profile. Try again.");
      return;
    }
    if (isStaffUser(profile)) {
      logout();
      toast.error("Staff and instructors must sign in at the dashboard — not on the student page.");
      router.push("/dashboard");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
    toast.success("Welcome back!");
    const nextPath = safeNextPath(searchParams.get("next"));
    if (profile.email_verified === false) {
      router.push(`/verify-email?next=${encodeURIComponent(nextPath ?? defaultDashboardPathForUser(profile))}`);
      return;
    }
    router.push(nextPath ?? defaultDashboardPathForUser(profile));
  };

  // A2: passkey sign-in (fingerprint / face / screen lock) — no e-mail or password typed
  const handlePasskey = async () => {
    setPasskeyLoading(true);
    try {
      const { data: opts } = await passkeysApi.loginOptions();
      const response = await startAuthentication({ optionsJSON: opts.options as never });
      const { data } = await passkeysApi.login(opts.challenge_id, response);
      await finishLogin(data);
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name !== "NotAllowedError" && name !== "AbortError") {
        toast.error(getApiErrorMessage(err, "Passkey sign-in failed"));
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      const { data } = await authApi.login({
        email: email.trim().toLowerCase(),
        password,
      });
      login(data.access_token || data.token, data.refresh_token);
      let profile;
      try {
        const me = await authApi.me();
        profile = me.data;
        setUser(profile);
      } catch {
        logout();
        toast.error("Signed in but could not load your profile. Try again.");
        return;
      }
      if (isStaffUser(profile)) {
        logout();
        toast.error("Staff and instructors must sign in at the dashboard — not on the student page.");
        router.push("/dashboard");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      toast.success("Welcome back!");
      const next = safeNextPath(searchParams.get("next"));
      if (profile.email_verified === false) {
        // first use of an unverified account: confirm the e-mail, then continue where they wanted to go
        router.push(`/verify-email?next=${encodeURIComponent(next ?? defaultDashboardPathForUser(profile))}`);
        return;
      }
      router.push(next ?? defaultDashboardPathForUser(profile));
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Invalid credentials"));
    } finally {
      setLoading(false);
    }
  };

  const next = searchParams.get("next");
  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : "/register";

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-[#EEF1F5] dark:bg-[#030A14]">
      <header className="relative z-20 flex shrink-0 items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B1F3A] transition hover:opacity-80 dark:text-white"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Home
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="rounded-full text-[#0B1F3A] hover:bg-black/5 dark:text-white dark:hover:bg-white/15"
          aria-label="Toggle theme"
        >
          <Sun className="h-5 w-5 dark:hidden" />
          <Moon className="hidden h-5 w-5 dark:block" />
        </Button>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1 sm:px-6">
        <div className="animate-fade-in-up w-full max-w-[340px] sm:max-w-[360px]">
          <div
            className={cn(
              "relative overflow-hidden rounded-[1.85rem] border border-black/[0.04] bg-white px-8 pb-9 pt-11",
              "shadow-[0_22px_55px_-20px_rgba(11,31,58,0.35)]",
              "dark:border-white/15 dark:bg-[#061528] dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.65)]",
              "sm:px-10 sm:pb-10 sm:pt-12",
            )}
          >
            <div className="relative z-10 flex flex-col items-center">
              <div className="mb-7 flex w-full flex-col items-center">
                <BrandCap className="mb-2 h-11 w-14" />

                <Link href="/" className="block" aria-label="Laambad home">
                  <span className="relative mx-auto block h-[36px] w-[200px] overflow-hidden sm:h-[40px] sm:w-[220px]">
                    <Image
                      src="/images/laambad-logo.png"
                      alt="Laambad"
                      width={220}
                      height={80}
                      className="h-auto w-full max-w-none object-contain object-top dark:hidden"
                      priority
                    />
                    <Image
                      src="/images/laambad-logo-dark.png"
                      alt="Laambad"
                      width={220}
                      height={80}
                      className="hidden h-auto w-full max-w-none object-contain object-top dark:block"
                      priority
                    />
                  </span>
                </Link>

                <div className="mt-3 flex w-full max-w-[17rem] items-center gap-2.5">
                  <span className="h-px flex-1 bg-[#0B1F3A] dark:bg-white/70" aria-hidden />
                  <p className="shrink-0 text-[13px] font-bold tracking-wide text-[#E84A27]">
                    E-learning platform
                  </p>
                  <span className="h-px flex-1 bg-[#0B1F3A] dark:bg-white/70" aria-hidden />
                </div>
              </div>

              <form onSubmit={handleSubmit} className="w-full space-y-3.5">
                <div className={fieldShell}>
                  <span className="flex h-full w-12 shrink-0 items-center justify-center text-[#0B1F3A] dark:text-brand">
                    <Mail className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />
                  </span>
                  <span className="h-5 w-px shrink-0 bg-[#C5CED8] dark:bg-white/25" aria-hidden />
                  <Input
                    id="email"
                    type="text"
                    inputMode="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    placeholder="Email or username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    aria-label="Email or username"
                    className={fieldInput}
                  />
                </div>

                <div className={fieldShell}>
                  <span className="flex h-full w-12 shrink-0 items-center justify-center text-[#0B1F3A] dark:text-brand">
                    <Lock className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />
                  </span>
                  <span className="h-5 w-px shrink-0 bg-[#C5CED8] dark:bg-white/25" aria-hidden />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    aria-label="Password"
                    className={cn(fieldInput, "pr-1")}
                  />
                  <button
                    type="button"
                    className="flex h-full w-11 shrink-0 items-center justify-center text-[#0B1F3A] transition hover:opacity-70 dark:text-white/70"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <div className="-mt-1 flex justify-end pr-2">
                  <Link href="/forgot-password" className="text-[13px] font-semibold text-brand underline-offset-4 hover:underline">
                    Forgot password?
                  </Link>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className={cn(
                    "group mt-1 h-[52px] w-full rounded-full border-0 text-[15px] font-bold !text-white",
                    "bg-brand hover:bg-brand-hover",
                    "shadow-[0_12px_24px_-10px_rgba(232,74,39,0.55)]",
                    "transition duration-300 hover:!text-white",
                    "disabled:opacity-70",
                  )}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Sign In
                  {!loading ? (
                    <ArrowRight
                      className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  ) : null}
                </Button>
              </form>

              {passkeySupported ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePasskey}
                  disabled={passkeyLoading || loading}
                  className="mt-3 h-[48px] w-full rounded-full border-[#B8C4D0] text-[14px] font-semibold text-[#0B1F3A] dark:border-white/25 dark:text-white"
                >
                  {passkeyLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Fingerprint className="mr-2 h-4 w-4" />}
                  Sign in with a passkey
                </Button>
              ) : null}

              <div className="relative z-20 mt-8 flex w-full items-center gap-2.5">
                <span className="h-px flex-1 bg-[#D0D7DE] dark:bg-white/20" aria-hidden />
                <p className="shrink-0 text-center text-[13px] text-[#0B1F3A] dark:text-white/75">
                  Don&apos;t have an account?{" "}
                  <Link
                    href={registerHref}
                    className="font-bold text-brand underline-offset-4 hover:underline"
                  >
                    Sign Up
                  </Link>
                </p>
                <span className="h-px flex-1 bg-[#D0D7DE] dark:bg-white/20" aria-hidden />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
