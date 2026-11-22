"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth-store";
import { authApi } from "@/services/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { cn, getApiErrorMessage } from "@/lib/utils";
import { defaultDashboardPathForUser } from "@/lib/auth-routing";
import { safeNextPath } from "@/lib/safe-redirect";
import { AuthPageShell } from "@/components/auth/auth-page-shell";

const MIN_PASSWORD_LEN = 8;

const authField =
  "h-11 rounded-xl border-input bg-background text-[15px] text-foreground placeholder:text-muted-foreground/70 " +
  "[--autofill-bg:hsl(var(--background))] focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:ring-offset-0 " +
  "focus:border-brand focus:ring-2 focus:ring-brand/20 focus:ring-offset-0";

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
] as const;

/** Matches typical handles; backend stores up to 100 chars, unique. */
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-sm font-semibold text-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { login, setUser, logout } = useAuthStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<string>("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameTrim = name.trim();
    const emailTrim = email.trim().toLowerCase();
    const phoneTrim = phone.trim();
    const userTrim = username.trim();

    if (!nameTrim || !emailTrim || !phoneTrim || !gender || !userTrim || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    if (!USERNAME_RE.test(userTrim)) {
      toast.error("Username: 3–32 characters, letters, numbers, . _ - only");
      return;
    }
    if (phoneTrim.length < 7) {
      toast.error("Enter a valid phone number");
      return;
    }
    if (password.length < MIN_PASSWORD_LEN) {
      toast.error(`Password must be at least ${MIN_PASSWORD_LEN} characters`);
      return;
    }

    setLoading(true);
    try {
      const { data } = await authApi.register({
        name: nameTrim,
        email: emailTrim,
        phone: phoneTrim,
        gender,
        username: userTrim,
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
        toast.error("Account created but profile could not load. Please sign in.");
        router.replace("/login");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      toast.success("Account created! Check your e-mail for the verification code.");
      const next = safeNextPath(searchParams.get("next"));
      // the sign-up already e-mailed a code (sent=1: the page does not send a second one)
      router.push(`/verify-email?sent=1&next=${encodeURIComponent(next ?? defaultDashboardPathForUser(profile))}`);
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Registration failed"));
    } finally {
      setLoading(false);
    }
  };

  const nextParam = searchParams.get("next");
  const loginHref = nextParam ? `/login?next=${encodeURIComponent(nextParam)}` : "/login";

  return (
    <AuthPageShell>
      <div className="animate-fade-in-up mx-auto w-full max-w-xl">
        <Card className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_60px_-30px_rgba(11,31,58,0.45)] dark:shadow-[0_24px_60px_-30px_rgba(0,0,0,0.8)]">
          <CardHeader className="relative flex items-center justify-center border-b border-border bg-muted/40 px-6 py-7 sm:py-8">
            <span className="absolute inset-x-0 top-0 h-1 bg-brand" aria-hidden />
            <Logo size="lg" href="/" align="center" />
          </CardHeader>
          <CardContent className="p-5 sm:p-7">
            <form
              onSubmit={handleSubmit}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-5"
            >
              <Field label="Full name" htmlFor="name">
                <Input
                  id="name"
                  autoComplete="name"
                  placeholder="Magacaaga oo buuxa"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  className={`${authField}`}
                />
              </Field>
              <Field label="Email" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="Iimaylkaaga"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className={`${authField}`}
                />
              </Field>
              <Field label="Phone" htmlFor="phone">
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="Lambarka taleefanka"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                  className={`${authField}`}
                />
              </Field>
              <Field label="Gender" htmlFor="gender">
                <Select value={gender || undefined} onValueChange={setGender} disabled={loading}>
                  <SelectTrigger id="gender" className={`w-full ${authField}`}>
                    <SelectValue placeholder="Dooro" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Username" htmlFor="username" className="sm:col-span-2">
                <Input
                  id="username"
                  autoComplete="username"
                  placeholder="Magaca isticmaalaha"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  className={`${authField}`}
                />
                <p className="text-[11px] leading-snug text-muted-foreground sm:text-xs">
                  3–32 characters: letters, numbers, and <span className="font-mono">.</span>{" "}
                  <span className="font-mono">_</span> <span className="font-mono">-</span>
                </p>
              </Field>

              <Field label="Password" htmlFor="password" className="sm:col-span-2">
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder={`Ugu yaraan ${MIN_PASSWORD_LEN} xaraf`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className={`pr-11 ${authField}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1.5 top-1/2 h-8 w-8 shrink-0 -translate-y-1/2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </Field>

              <div className="sm:col-span-2">
                <Button
                  type="submit"
                  size="lg"
                  disabled={loading}
                  className="mt-1 h-12 w-full rounded-xl bg-brand text-[15px] font-bold !text-white shadow-[0_14px_30px_-12px_rgba(232,74,39,0.6)] transition hover:bg-brand-hover hover:!text-white"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create account
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href={loginHref} className="font-semibold text-brand underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthPageShell>
  );
}
