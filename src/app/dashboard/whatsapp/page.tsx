"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { whatsappApi } from "@/services/api/student-features";
import { useAuthStore } from "@/store/auth-store";
import { isAdminUser } from "@/lib/auth-routing";
import { cn } from "@/lib/utils";

const SEGMENTS = [
  { id: "inactive", label: "Inactive learners", hint: "Enrolled, but no learning for N days" },
  { id: "not_started", label: "Not started", hint: "Enrolled, no lesson opened yet" },
  { id: "pending_payment", label: "Payment pending", hint: "A course payment waits for verification" },
  { id: "all", label: "Everyone who opted in", hint: "Write your own message" },
] as const;

/**
 * A2 admin: consent-based WhatsApp reminders. Only students who opted in (Settings → WhatsApp) are
 * listed. Each button opens WhatsApp with the message filled in; nothing is sent automatically.
 */
export default function WhatsappPage() {
  const user = useAuthStore((s) => s.user);
  const [segment, setSegment] = useState<string>("inactive");
  const [days, setDays] = useState(7);
  const [q, setQ] = useState("");
  const [opened, setOpened] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["wa-contacts", segment, days, q],
    queryFn: () => whatsappApi.contacts(segment, days, q).then((r) => r.data),
    enabled: isAdminUser(user),
  });

  if (!isAdminUser(user)) return <p className="py-16 text-center text-muted-foreground">Admins only.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <MessageCircle className="h-7 w-7 text-[#25D366]" />
          WhatsApp reminders
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-success" />
          Only students who gave consent are listed. Students can withdraw consent at any time in Settings.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSegment(s.id)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left text-sm transition",
              segment === s.id ? "border-brand bg-brand-soft font-semibold" : "hover:bg-muted/60"
            )}
          >
            {s.label}
            <span className="block text-[11px] font-normal text-muted-foreground">{s.hint}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name or e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {segment === "inactive" ? (
          <label className="flex items-center gap-2 text-sm">
            Inactive for
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 rounded-md border bg-background px-2">
              {[3, 7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {data ? <span className="text-sm text-muted-foreground">{data.total} students</span> : null}
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : !data?.data.length ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-sm text-muted-foreground">No students in this group.</CardContent>
        </Card>
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {data.data.map((c) => (
            <div key={c.user_id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {c.name} <span className="font-mono text-xs text-muted-foreground">{c.whatsapp_phone}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.active_courses} active courses · last learned {c.last_active_day ?? "never"}
                  {c.pending_payments ? ` · ${c.pending_payments} pending payment` : ""}
                </p>
                <p className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">“{c.message}”</p>
              </div>
              <Button
                asChild
                size="sm"
                variant={opened.has(c.user_id) ? "outline" : "default"}
                className={cn(!opened.has(c.user_id) && "bg-[#25D366] text-white hover:bg-[#1ebe5a]")}
              >
                <a
                  href={c.wa_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpened((s) => new Set(s).add(c.user_id))}
                >
                  <MessageCircle className="h-4 w-4" /> {opened.has(c.user_id) ? "Opened" : "Open WhatsApp"}
                </a>
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
