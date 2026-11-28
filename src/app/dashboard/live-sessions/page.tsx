"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, CheckCircle2, ExternalLink, Info, Loader2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { coursesApi } from "@/services/api/courses";
import { liveApi } from "@/services/api/course-features";
import { SessionRow } from "@/components/learning/session-row";
import { useAuthStore } from "@/store/auth-store";
import { isStaffUser } from "@/lib/auth-routing";
import { getApiErrorMessage } from "@/lib/utils";
import { normalizeMeetUrl } from "@/lib/meet-url";
import { toast } from "sonner";

/** A5: live classes on Google Meet. Instructors connect Google and schedule; students join. */
function LiveSessionsInner() {
  const user = useAuthStore((s) => s.user);
  const staff = isStaffUser(user);
  const params = useSearchParams();
  const qc = useQueryClient();

  useEffect(() => {
    const g = params.get("google");
    if (g === "connected") toast.success("Google account connected");
    if (g === "failed") toast.error("Google connection failed — please try again");
    if (g === "no_calendar") toast.error("Google Calendar was not allowed — connect again and tick the Google Calendar box.", { duration: 10_000 });
  }, [params]);

  const mine = useQuery({ queryKey: ["live-mine"], queryFn: () => liveApi.mine().then((r) => r.data), enabled: !!user });
  const cancel = useMutation({
    mutationFn: (id: string) => liveApi.cancel(id),
    onSuccess: () => {
      toast.success("Session cancelled — students were told");
      qc.invalidateQueries({ queryKey: ["live-mine"] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not cancel")),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Video className="h-7 w-7 text-primary" /> Live sessions
        </h1>
        <p className="mt-1 text-muted-foreground">Live classes on Google Meet. The join button appears 15 minutes before the start.</p>
      </div>
      {staff ? <InstructorTools /> : null}
      <div>
        <p className="mb-2 text-sm font-semibold">Upcoming</p>
        {mine.isLoading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : !mine.data?.length ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">No live sessions scheduled.</CardContent>
          </Card>
        ) : (
          <div className="divide-y overflow-hidden rounded-xl border bg-card">
            {mine.data.map((s) => (
              <SessionRow key={s.id} s={s} staff={staff} onCancel={() => window.confirm(`Cancel "${s.title}"?`) && cancel.mutate(s.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InstructorTools() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const status = useQuery({ queryKey: ["google-status"], queryFn: () => liveApi.googleStatus().then((r) => r.data) });
  const courses = useQuery({
    queryKey: ["live-my-courses", user?.id],
    queryFn: () => coursesApi.list(1, 100, user?.role !== "admin").then((r) => r.data.data ?? []),
  });
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");
  const [duration, setDuration] = useState("60");
  const [manualUrl, setManualUrl] = useState("");

  const connect = useMutation({
    mutationFn: () => liveApi.googleConnect().then((r) => r.data.url),
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Google is not available")),
  });
  const disconnect = useMutation({
    mutationFn: () => liveApi.googleDisconnect(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["google-status"] }),
  });
  const g = status.data;
  // without a Google connection the instructor pastes a Meet link (any usual form is accepted)
  const meetUrl = normalizeMeetUrl(manualUrl);
  const badLink = !!manualUrl.trim() && !meetUrl;
  const needsLink = !g?.connected;
  const create = useMutation({
    mutationFn: () =>
      liveApi.create(courseId, {
        title,
        description: description || undefined,
        starts_at: new Date(start).toISOString(),
        duration_min: Number(duration),
        meet_url: needsLink && meetUrl ? meetUrl : undefined,
      }),
    onSuccess: () => {
      toast.success("Session scheduled — students of the course were told");
      setTitle("");
      setDescription("");
      setStart("");
      setManualUrl("");
      qc.invalidateQueries({ queryKey: ["live-mine"] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not schedule the session")),
  });

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="space-y-3 rounded-xl border px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Google account</p>
              <p className="text-xs text-muted-foreground">
                {!g
                  ? "…"
                  : !g.configured
                    ? "Google Meet is not set up on the server yet — paste a Meet link below for now."
                    : g.connected
                      ? `Connected as ${g.email ?? "your Google account"} — Meet links are created automatically.`
                      : "Connect once: the Meet link is created in your Google Calendar for every session. Or paste a Meet link below."}
              </p>
            </div>
            {g?.configured ? (
              g.connected ? (
                <Button size="sm" variant="outline" onClick={() => disconnect.mutate()}>
                  <CheckCircle2 className="h-4 w-4 text-success" /> Disconnect
                </Button>
              ) : (
                <Button size="sm" onClick={() => connect.mutate()} disabled={connect.isPending}>
                  {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Connect Google
                </Button>
              )
            ) : null}
          </div>
          {g?.configured && !g.connected ? (
            <div className="flex gap-2.5 rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-foreground/85">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <p>
                Google may show <strong>“Google hasn&apos;t verified this app”</strong>. This is Laambad&apos;s own Google sign-in: click{" "}
                <strong>Advanced</strong> → <strong>Go to … (unsafe)</strong>, tick the <strong>Google Calendar</strong> box, then press{" "}
                <strong>Continue</strong>.
              </p>
            </div>
          ) : null}
        </div>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!create.isPending) create.mutate();
          }}
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Course</Label>
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Choose a course…</option>
              {(courses.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 3 Q&A" maxLength={255} />
          </div>
          <div className="space-y-1.5">
            <Label>Starts (your local time)</Label>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Duration (minutes)</Label>
            <Input type="number" min={10} max={480} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Description (optional)</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {needsLink ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="meet-url">Google Meet link</Label>
              <Input
                id="meet-url"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://meet.google.com/abc-defg-hij"
                aria-invalid={badLink}
                className={badLink ? "border-destructive focus-visible:ring-destructive" : undefined}
              />
              {badLink ? (
                <p className="text-xs text-destructive">This is not a Google Meet link. It looks like https://meet.google.com/abc-defg-hij</p>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Open Google Meet → <strong>New meeting</strong> → <strong>Create a meeting for later</strong>, copy the link and paste it here.{" "}
                  <a
                    href="https://meet.google.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                  >
                    Open Google Meet <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </p>
              )}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={!courseId || !title.trim() || !start || create.isPending || (needsLink && !meetUrl)}>
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Schedule session
            </Button>
            {needsLink && !meetUrl && g ? (
              <span className="text-xs text-muted-foreground">
                {g.configured ? "Connect Google or paste a Meet link to schedule." : "Paste a Meet link to schedule."}
              </span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LiveSessionsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
      <LiveSessionsInner />
    </Suspense>
  );
}
