"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAdminOnlyPage } from "@/hooks/use-admin-only";
import { useAuthStore } from "@/store/auth-store";
import { usersApi } from "@/services/api/users";
import { isAdminUser } from "@/lib/auth-routing";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ChevronLeft, ChevronRight, Users, Loader2, KeyRound, Eye, EyeOff, RefreshCw, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, getInitials, formatDate, getApiErrorMessage } from "@/lib/utils";
import type { User } from "@/types";

type RoleSlug = "admin" | "instructor" | "student";

const USER_COLS = "lg:grid-cols-[minmax(0,1fr)_150px_200px_110px_40px]";

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint32Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/** Admin sets a new password (e.g. a migrated instructor who lost their WordPress password). */
function SetPasswordDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(true);
  useEffect(() => {
    if (user) {
      setPassword(randomPassword());
      setShow(true);
    }
  }, [user]);

  const mut = useMutation({
    mutationFn: () => usersApi.setPassword(user!.id, password),
    onSuccess: () => {
      toast.success(`New password saved for ${user?.name}. Share it with them privately.`);
      onClose();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not set the password")),
  });

  const ok = password.length >= 8;
  return (
    <Dialog open={!!user} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set a new password</DialogTitle>
          <DialogDescription>
            For <b className="text-foreground">{user?.name}</b> ({user?.email}). Their old password stops working and they are
            signed out everywhere. They can sign in with their e-mail or username
            {user?.username ? <> (<b className="text-foreground">{user.username}</b>)</> : null}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-xl pr-24 font-mono"
              autoComplete="new-password"
            />
            <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 gap-0.5">
              <button
                type="button"
                title={show ? "Hide" : "Show"}
                onClick={() => setShow((s) => !s)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                type="button"
                title="Generate"
                onClick={() => setPassword(randomPassword())}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Copy"
                onClick={() => {
                  navigator.clipboard?.writeText(password).then(() => toast.success("Copied"), () => undefined);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
          <p className={cn("text-xs", ok ? "text-muted-foreground" : "text-destructive")}>At least 8 characters.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-brand text-brand-foreground hover:bg-brand-hover"
            disabled={!ok || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <KeyRound className="mr-1.5 h-4 w-4" />}
            Save password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ROLE_META: Record<RoleSlug, { label: string; cls: string }> = {
  admin: { label: "Admin", cls: "border-brand/30 bg-brand/10 text-brand" },
  instructor: {
    label: "Instructor",
    cls: "border-brand-navy/25 bg-brand-navy/10 text-brand-navy dark:border-white/20 dark:bg-white/10 dark:text-white",
  },
  student: { label: "Student", cls: "border-border bg-muted text-muted-foreground" },
};

/** Stored slug "user" surfaces as "student" in the UI. */
function displayRole(u: User): RoleSlug {
  const r = (u.role_slug ?? u.role ?? "user").toLowerCase();
  if (r === "admin") return "admin";
  if (r === "instructor") return "instructor";
  return "student";
}

export default function UsersPage() {
  const { ready } = useAdminOnlyPage();
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const isAdmin = isAdminUser(me);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState(""); // debounced, searched on the server
  const [roleTab, setRoleTab] = useState<string>("all");
  const [pwUser, setPwUser] = useState<User | null>(null);
  const pageSize = 20;

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["users", page, pageSize, q, roleTab],
    queryFn: () => usersApi.list(page, pageSize, { q, role: roleTab }).then((r) => r.data),
    enabled: ready && isAdmin,
    placeholderData: keepPreviousData,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["users"] });

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: RoleSlug }) => usersApi.updateRole(id, role),
    onSuccess: () => {
      toast.success("Role updated");
      refetch();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not update role")),
  });

  const activeMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => usersApi.setActive(id, active),
    onSuccess: (_d, v) => {
      toast.success(v.active ? "User activated" : "User deactivated");
      refetch();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not update status")),
  });

  const filtered = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  if (!ready) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin ? "Manage roles and activate or deactivate accounts." : "Platform users."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <Users className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-lg font-bold text-foreground">{total.toLocaleString()}</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {roleTab === "all" ? "Total users" : `${ROLE_META[roleTab as RoleSlug].label}s`}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex max-w-full gap-1 self-start overflow-x-auto rounded-xl border border-border bg-card p-1">
          {[
            { value: "all", label: "All" },
            { value: "admin", label: "Admins" },
            { value: "instructor", label: "Instructors" },
            { value: "student", label: "Students" },
          ].map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => {
                setRoleTab(t.value);
                setPage(1);
              }}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold transition",
                roleTab === t.value ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, email or username…"
            className="h-10 rounded-xl pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {isFetching && !isLoading ? (
            <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[64px] w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">No users found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div
            className={cn(
              "hidden items-center gap-5 border-b border-border bg-muted/50 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground lg:grid",
              USER_COLS,
            )}
          >
            <span>User</span>
            <span>Role</span>
            <span>Status</span>
            <span className="text-right">Joined</span>
            <span className="sr-only">Actions</span>
          </div>
          <ul className="divide-y divide-border/70">
            {filtered.map((user: User) => {
              const role = displayRole(user);
              const active = user.is_active !== false;
              const isSelf = me?.id === user.id;
              const busy =
                (roleMut.isPending && roleMut.variables?.id === user.id) ||
                (activeMut.isPending && activeMut.variables?.id === user.id);

              return (
                <li
                  key={user.id}
                  className={cn(
                    "flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3.5 transition-colors hover:bg-muted/30 sm:px-5 lg:grid",
                    USER_COLS,
                    !active && "opacity-75",
                  )}
                >
                  {/* user */}
                  <div className="flex w-full min-w-0 items-center gap-3 lg:w-auto">
                    <Avatar className="h-10 w-10 shrink-0 ring-2 ring-background">
                      {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={user.name} /> : null}
                      <AvatarFallback className="bg-brand-navy/10 text-xs font-bold text-brand-navy dark:bg-white/10 dark:text-white">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-[14.5px] font-semibold text-foreground">
                        <span className="truncate">{user.name}</span>
                        {isSelf && (
                          <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase text-brand">
                            You
                          </span>
                        )}
                      </p>
                      <p className="truncate text-[12.5px] text-muted-foreground">
                        {user.email}
                        {user.username ? <span className="text-muted-foreground/70"> · @{user.username}</span> : null}
                      </p>
                    </div>
                  </div>

                  {/* role */}
                  <div className="shrink-0">
                    {isAdmin && !isSelf ? (
                      <Select
                        value={role}
                        onValueChange={(val) => roleMut.mutate({ id: user.id, role: val as RoleSlug })}
                        disabled={busy}
                      >
                        <SelectTrigger className={cn("h-9 w-[140px] rounded-full border font-semibold capitalize", ROLE_META[role].cls)}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="student">Student</SelectItem>
                          <SelectItem value="instructor">Instructor</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={cn("inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold", ROLE_META[role].cls)}>
                        {ROLE_META[role].label}
                      </span>
                    )}
                  </div>

                  {/* status */}
                  <div className="flex shrink-0 items-center gap-2.5">
                    {isAdmin && !isSelf ? (
                      <Switch
                        checked={active}
                        disabled={busy}
                        onCheckedChange={(checked) => activeMut.mutate({ id: user.id, active: checked })}
                        aria-label="Toggle account active"
                      />
                    ) : null}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold",
                        active
                          ? "border-success/40 bg-success-soft text-success"
                          : "border-destructive/40 bg-destructive/10 text-destructive",
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-success" : "bg-destructive")} />
                      {active ? "Active" : "Disabled"}
                    </span>
                    {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  </div>

                  {/* joined */}
                  <p className="ml-auto whitespace-nowrap text-[13px] text-muted-foreground lg:ml-0 lg:text-right">
                    {user.created_at ? formatDate(user.created_at) : "—"}
                  </p>

                  {/* actions */}
                  <div className="flex justify-end">
                    {isAdmin && !isSelf ? (
                      <button
                        type="button"
                        onClick={() => setPwUser(user)}
                        title="Set a new password"
                        aria-label={`Set a new password for ${user.name}`}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-brand transition hover:bg-brand/20"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="h-9 w-9" aria-hidden />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      <SetPasswordDialog user={pwUser} onClose={() => setPwUser(null)} />
    </div>
  );
}
