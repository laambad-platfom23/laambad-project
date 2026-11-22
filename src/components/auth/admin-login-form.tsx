"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useAuthStore } from "@/store/auth-store";
import { authApi } from "@/services/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, LineChart, Loader2, Lock, Mail, Moon, Shield, Sun, Users } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { getApiErrorMessage } from "@/lib/utils";
import { safeNextPath } from "@/lib/safe-redirect";

/** One bordered shell per field (icon + input + action), so autofill and focus colour the whole field. */
const staffShell =
  "flex h-[52px] items-center gap-2.5 rounded-xl border border-input bg-background px-3.5 transition " +
  "focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 [--autofill-bg:hsl(var(--background))]";
const staffInput =
  "h-full flex-1 border-0 bg-transparent p-0 text-[15px] text-foreground shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0";

/** Which staff role this sign-in page is for. */
export type LoginAudience = "admin" | "instructor";

const AUDIENCE_COPY: Record<LoginAudience, { tag: string; title: string; subtitle: string; cardTitle: string; cardDesc: string }> = {
  admin: {
    tag: "Administrator access",
    title: "Administrator sign in",
    subtitle: "Manage the whole platform — users, courses, payments, and settings.",
    cardTitle: "Administrator credentials",
    cardDesc: "Administrators only",
  },
  instructor: {
    tag: "Instructor access",
    title: "Instructor sign in",
    subtitle: "Create and manage your courses, lessons, quizzes, and students.",
    cardTitle: "Instructor credentials",
    cardDesc: "Teachers only",
  },
};

export function AdminLoginForm({ audience = "admin" }: { audience?: LoginAudience } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const { login, setUser, logout } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const copy = AUDIENCE_COPY[audience];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      const { data } = await authApi.login({
        email: email.trim(),
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

      const role = (profile?.role ?? profile?.role_slug ?? "").toString().toLowerCase();
      const allowed = audience === "admin" ? role === "admin" : role === "instructor" || role === "admin";
      if (!allowed) {
        logout();
        toast.error(
          audience === "admin"
            ? "This account is not an administrator. Administrators only."
            : "This account is not an instructor. Ask an admin for instructor access."
        );
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      toast.success(audience === "admin" ? "Welcome, administrator" : "Welcome, instructor");
      const next = safeNextPath(searchParams.get("next"));
      router.push(next ?? "/dashboard");
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Invalid credentials"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-svh w-full grid-cols-1 bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-brand-navy px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand/25 hidden" aria-hidden />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-white/[0.06] hidden" aria-hidden />
        <div className="relative z-10">
          <Logo size="lg" href="/" variant="dark" className="transition-opacity hover:opacity-90" />
        </div>
        <div className="relative z-10 max-w-md">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
            <Shield className="h-3.5 w-3.5 text-brand-orange-bright" aria-hidden />
            {copy.tag}
          </p>
          <h1 className="mt-5 text-[2.1rem] font-extrabold leading-[1.12] tracking-tight">{copy.title}</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/75">{copy.subtitle}</p>
          <ul className="mt-9 space-y-4">
            {(audience === "admin"
              ? [
                  { icon: Users, t: "Learners & enrollments", d: "Students, progress, payments and certificates" },
                  { icon: LineChart, t: "Platform insight", d: "Live numbers from your Laambad data" },
                  { icon: Shield, t: "Roles & access", d: "Administrator and instructor tooling" },
                ]
              : [
                  { icon: LineChart, t: "Your courses", d: "Lessons, quizzes and curriculum in one place" },
                  { icon: Users, t: "Your students", d: "Enrollments, questions and progress" },
                  { icon: Shield, t: "Secure access", d: "Instructor accounts only" },
                ]
            ).map(({ icon: Icon, t, d }) => (
              <li key={t} className="flex items-start gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <Icon className="h-[18px] w-[18px] text-brand-orange-bright" aria-hidden />
                </span>
                <span className="pt-0.5">
                  <span className="block font-semibold">{t}</span>
                  <span className="mt-0.5 block text-sm text-white/65">{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-xs text-white/45">© Laambad · staff area</p>
      </section>

      {/* Form panel */}
      <section className="relative flex min-h-svh flex-col px-5 py-6 sm:px-10 lg:min-h-0">
        <div className="flex items-center justify-between">
          <div className="lg:hidden">
            <Logo size="sm" href="/" />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto h-10 w-10 rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-accent"
            aria-label="Toggle theme"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Sun className="h-5 w-5 dark:hidden" />
            <Moon className="hidden h-5 w-5 dark:block" />
          </Button>
        </div>

        <div className="animate-fade-in-up mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-12">
          <div className="mb-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand">{copy.tag}</p>
            <h2 className="mt-2 text-[1.75rem] font-extrabold leading-tight tracking-tight text-foreground">
              Welcome back
            </h2>
            <p className="mt-2 text-[15px] text-muted-foreground">{copy.cardDesc} — sign in with your staff account.</p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-6 rounded-2xl border border-border bg-card px-6 py-8 shadow-[0_20px_50px_-28px_rgba(11,31,58,0.45)] dark:shadow-[0_20px_50px_-28px_rgba(0,0,0,0.8)] sm:px-7 sm:py-9"
          >
            <div className="space-y-2">
              <Label htmlFor="admin-email" className="text-sm font-semibold text-foreground">
                Email or username
              </Label>
              <div className={staffShell}>
                <Mail className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />
                <Input
                  id="admin-email"
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  placeholder="you@laambad.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className={staffInput}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password" className="text-sm font-semibold text-foreground">
                Password
              </Label>
              <div className={staffShell}>
                <Lock className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />
                <Input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className={staffInput}
                />
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="flex justify-end">
              <a href="/forgot-password" className="text-[13px] font-semibold text-brand underline-offset-4 hover:underline">
                Forgot password?
              </a>
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="mt-2 h-[52px] w-full rounded-xl bg-brand text-[15px] font-bold text-brand-foreground shadow-[0_14px_30px_-12px_rgba(232,74,39,0.6)] transition hover:bg-brand-hover disabled:opacity-70"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in to dashboard
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-between text-sm">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 font-medium text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to site
            </Link>
            <Link href="/login" className="rounded-lg px-2 py-1.5 font-semibold text-brand hover:underline">
              Student sign-in
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
