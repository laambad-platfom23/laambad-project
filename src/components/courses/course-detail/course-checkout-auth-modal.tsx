"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Logo } from "@/components/ui/logo";
import { useAuthStore } from "@/store/auth-store";
import { authApi } from "@/services/api/auth";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { getApiErrorMessage, cn } from "@/lib/utils";

const MIN_PASSWORD_LEN = 8;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
] as const;

/** White fields on blue dark body — readable in both themes */
const fieldBase =
  "border-[#0B1F3A]/20 bg-white text-[#0f172a] placeholder:text-slate-500 focus-visible:ring-[#0B1F3A]/30 dark:border-white/30 dark:bg-white dark:text-[#0f172a] dark:placeholder:text-slate-500 dark:focus-visible:ring-[#E84A27]/40";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after successful sign-in or sign-up (tokens + profile loaded). */
  onAuthenticated: () => void | Promise<void>;
  courseTitle?: string;
  /** Free course: clarify that an account is still required to enroll and watch */
  accountRequiredForFree?: boolean;
};

export function CourseCheckoutAuthModal({
  open,
  onOpenChange,
  onAuthenticated,
  courseTitle,
  accountRequiredForFree,
}: Props) {
  const queryClient = useQueryClient();
  const { login, setUser, logout } = useAuthStore();

  const [tab, setTab] = useState<"signin" | "signup">("signin");

  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [showInPw, setShowInPw] = useState(false);
  const [signInLoading, setSignInLoading] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showUpPw, setShowUpPw] = useState(false);
  const [signUpLoading, setSignUpLoading] = useState(false);

  const resetTransient = () => {
    setSignInLoading(false);
    setSignUpLoading(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetTransient();
    onOpenChange(next);
  };

  const finishAuth = async () => {
    await queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
    await Promise.resolve(onAuthenticated());
    handleOpenChange(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInEmail.trim() || !signInPassword) {
      toast.error("Enter email and password");
      return;
    }
    setSignInLoading(true);
    try {
      const { data } = await authApi.login({
        email: signInEmail.trim().toLowerCase(),
        password: signInPassword,
      });
      login(data.access_token || data.token, data.refresh_token);
      try {
        const me = await authApi.me();
        setUser(me.data);
      } catch {
        logout();
        toast.error("Signed in but profile could not load. Try again.");
        return;
      }
      toast.success("Signed in successfully");
      await finishAuth();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Invalid credentials"));
    } finally {
      setSignInLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
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

    setSignUpLoading(true);
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
      try {
        const me = await authApi.me();
        setUser(me.data);
      } catch {
        logout();
        toast.error("Account created but profile could not load. Please sign in.");
        return;
      }
      toast.success("Account created");
      await finishAuth();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Registration failed"));
    } finally {
      setSignUpLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[min(92vh,900px)] gap-0 overflow-hidden border-0 p-0 shadow-2xl sm:max-w-[440px]",
          "z-[200] data-[state=open]:animate-in",
          /* Avoid default near-black dialog shell in dark mode */
          "bg-transparent dark:!bg-[#0B1F3A]",
        )}
        onPointerDownOutside={(e) => {
          if (signInLoading || signUpLoading) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (signInLoading || signUpLoading) e.preventDefault();
        }}
      >
        <div className="relative border-b border-white/15 bg-[#0B1F3A] px-6 pb-5 pt-6 text-white">
          <div className="absolute inset-x-0 bottom-0 h-px bg-white/20" aria-hidden />
          <div className="flex flex-col items-center gap-3">
            <Logo size="sm" href="/" variant="dark" />
            <DialogHeader className="space-y-1 text-center sm:text-center">
              <DialogTitle className="text-xl font-bold tracking-tight text-white sm:text-[1.35rem]">
                Continue with Laambad
              </DialogTitle>
              <DialogDescription className="text-sm text-white/75">
                {courseTitle ? (
                  <>
                    Sign in or create an account to continue with{" "}
                    <span className="font-medium text-[#FF6B45]">{courseTitle}</span>
                    {accountRequiredForFree ? (
                      <span className="mt-2 block text-[13px] text-white/85">
                        This course is free, but you still need an account to enroll and watch lessons.
                      </span>
                    ) : null}
                  </>
                ) : (
                  "Sign in or create an account to continue"
                )}
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        <div className="bg-[#f8fafc] px-4 pb-5 pt-4 dark:bg-[#0B1F3A] sm:px-6">
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as "signin" | "signup")}
            className="w-full"
          >
            <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl border border-[#0B1F3A]/15 bg-white p-1 shadow-sm dark:border-white/35 dark:bg-[#0B1F3A]/70">
              <TabsTrigger
                value="signin"
                className="rounded-lg text-sm font-semibold text-[#64748b] data-[state=active]:bg-[#0B1F3A] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground dark:text-white/70 dark:data-[state=active]:bg-[#0B1F3A] dark:data-[state=active]:text-white dark:data-[state=inactive]:text-white/65"
              >
                Sign in
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="rounded-lg text-sm font-semibold text-[#64748b] data-[state=active]:bg-[#0B1F3A] data-[state=active]:text-white data-[state=inactive]:text-muted-foreground dark:text-white/70 dark:data-[state=active]:bg-[#0B1F3A] dark:data-[state=active]:text-white dark:data-[state=inactive]:text-white/65"
              >
                Sign up
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-4 outline-none">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="modal-email" className="text-foreground/90 dark:text-white">
                    Email
                  </Label>
                  <Input
                    id="modal-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                    disabled={signInLoading}
                    className={cn("h-11", fieldBase)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="modal-password" className="text-foreground/90 dark:text-white">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="modal-password"
                      type={showInPw ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      disabled={signInLoading}
                      className={cn("h-11 pr-11", fieldBase)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-11 text-muted-foreground hover:bg-transparent dark:text-white/55"
                      onClick={() => setShowInPw(!showInPw)}
                    >
                      {showInPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={signInLoading}
                  className="h-11 w-full bg-[#0B1F3A] dark:bg-brand dark:hover:bg-brand-hover text-[15px] font-bold text-white shadow-md transition hover:bg-[#061528]"
                >
                  {signInLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Sign in
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-4 max-h-[min(52vh,420px)] overflow-y-auto pr-1 outline-none sm:max-h-[min(58vh,480px)]">
              <form onSubmit={handleSignUp} className="space-y-3 pb-1">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-1">
                    <Label htmlFor="su-name" className="dark:text-white/85">
                      Full name
                    </Label>
                    <Input
                      id="su-name"
                      autoComplete="name"
                      placeholder="Your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={signUpLoading}
                      className={cn("h-10 sm:h-11", fieldBase)}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-1">
                    <Label htmlFor="su-email" className="dark:text-white/85">
                      Email
                    </Label>
                    <Input
                      id="su-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={signUpLoading}
                      className={cn("h-10 sm:h-11", fieldBase)}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-1">
                    <Label htmlFor="su-phone" className="dark:text-white/85">
                      Phone
                    </Label>
                    <Input
                      id="su-phone"
                      type="tel"
                      autoComplete="tel"
                      placeholder="+252 …"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={signUpLoading}
                      className={cn("h-10 sm:h-11", fieldBase)}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-1">
                    <Label htmlFor="su-gender" className="dark:text-white/85">
                      Gender
                    </Label>
                    <Select value={gender || undefined} onValueChange={setGender} disabled={signUpLoading}>
                      <SelectTrigger id="su-gender" className={cn("h-10 sm:h-11", fieldBase)}>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent className="z-[250] dark:border-white/20 dark:bg-[#0B1F3A] dark:text-white">
                        {GENDER_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="su-user" className="dark:text-white/85">
                    Username
                  </Label>
                  <Input
                    id="su-user"
                    autoComplete="username"
                    placeholder="unique_handle"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={signUpLoading}
                    className={cn("h-10 sm:h-11", fieldBase)}
                  />
                  <p className="text-[11px] text-muted-foreground dark:text-white/45">
                    3–32 characters: letters, numbers, . _ -
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="su-pw" className="dark:text-white/85">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="su-pw"
                      type={showUpPw ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder={`At least ${MIN_PASSWORD_LEN} characters`}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={signUpLoading}
                      className={cn("h-10 pr-11 sm:h-11", fieldBase)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 dark:text-white/55"
                      onClick={() => setShowUpPw(!showUpPw)}
                    >
                      {showUpPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={signUpLoading}
                  className="mt-1 h-11 w-full bg-[#0B1F3A] dark:bg-brand dark:hover:bg-brand-hover text-[15px] font-bold text-white shadow-md transition hover:bg-[#061528]"
                >
                  {signUpLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Create account
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
