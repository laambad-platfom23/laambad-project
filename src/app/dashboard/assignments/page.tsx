"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, ChevronDown, ClipboardList, ExternalLink, Loader2, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { AssignmentView } from "@/components/learning/assignment-view";
import { AssignmentStatusChip, DirectFileRow, dueLabel } from "@/components/learning/item-ui";
import { assignmentApi, type MyAssignmentRow, type StaffAssignmentRow, type StaffSubmission } from "@/services/api/course-items";
import { useAuthStore } from "@/store/auth-store";
import { isStaffUser } from "@/lib/auth-routing";
import { cn, formatDateTime, getApiErrorMessage } from "@/lib/utils";

function AssignmentsInner() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Skeleton className="h-64 rounded-xl" />;
  return isStaffUser(user) ? <StaffAssignments /> : <StudentAssignments />;
}

// ───────────────────────── students ─────────────────────────

function StudentAssignments() {
  const router = useRouter();
  const params = useSearchParams();
  const open = params.get("assignment");
  const [filter, setFilter] = useState<"all" | "todo" | "submitted" | "graded">("all");
  const { data, isLoading } = useQuery({
    queryKey: ["my-assignments"],
    queryFn: () => assignmentApi.mine().then((r) => r.data.data),
  });

  if (open) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/assignments")}>
          <ArrowLeft className="h-4 w-4" /> All assignments
        </Button>
        <AssignmentView assignmentId={open} />
      </div>
    );
  }

  const list = data ?? [];
  const shown = list.filter((a) =>
    filter === "all" ? true : filter === "todo" ? a.status === "not_submitted" : filter === "submitted" ? a.status === "submitted" : a.status === "graded"
  );
  const byCourse = new Map<string, { title: string; slug: string; rows: MyAssignmentRow[] }>();
  for (const a of shown) {
    const g = byCourse.get(a.course.id) ?? { title: a.course.title, slug: a.course.slug, rows: [] };
    g.rows.push(a);
    byCourse.set(a.course.id, g);
  }
  const count = (s: MyAssignmentRow["status"]) => list.filter((a) => a.status === s).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ClipboardList className="h-7 w-7 text-primary" /> Assignments
        </h1>
        <p className="mt-1 text-muted-foreground">Every assignment of your courses: hand in your work and see your grades and feedback.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", `All (${list.length})`],
            ["todo", `To do (${count("not_submitted")})`],
            ["submitted", `Waiting for grade (${count("submitted")})`],
            ["graded", `Graded (${count("graded")})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition",
              filter === k ? "border-brand bg-brand text-white" : "hover:bg-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : !list.length ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            Your courses have no assignments yet.
          </CardContent>
        </Card>
      ) : !shown.length ? (
        <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <div className="space-y-4">
          {[...byCourse.entries()].map(([id, g]) => (
            <div key={id} className="overflow-hidden rounded-xl border bg-card">
              <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
                <p className="min-w-0 truncate font-semibold">{g.title}</p>
                <Link href={`/learn/${encodeURIComponent(g.slug)}?tab=assignments`} className="shrink-0 text-xs font-semibold text-brand hover:underline">
                  Open course
                </Link>
              </div>
              <ul className="divide-y">
                {g.rows.map((a) => {
                  const due = dueLabel(a.due_at);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => router.push(`/dashboard/assignments?assignment=${a.id}`)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                      >
                        <ClipboardList className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{a.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {a.lesson_title ?? a.section_title ?? ""}
                            {due ? <span className={cn(due.past && a.status === "not_submitted" && "text-destructive")}> · due {due.text}</span> : null}
                          </span>
                        </span>
                        <AssignmentStatusChip status={a.status} grade={a.grade} max={a.max_points} passed={a.passed} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── instructors / admins ─────────────────────────

function StaffAssignments() {
  const router = useRouter();
  const params = useSearchParams();
  const open = params.get("assignment");
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["staff-assignments"],
    queryFn: () => assignmentApi.staffList().then((r) => r.data.data),
  });

  if (open) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/assignments")}>
          <ArrowLeft className="h-4 w-4" /> All assignments
        </Button>
        <Submissions assignmentId={open} />
      </div>
    );
  }

  const term = q.trim().toLowerCase();
  const list = (data ?? []).filter((a) => !term || a.title.toLowerCase().includes(term) || a.course.title.toLowerCase().includes(term));
  const toGrade = (data ?? []).reduce((n, a) => n + a.ungraded_count, 0);
  const byCourse = new Map<string, { title: string; id: string; rows: StaffAssignmentRow[] }>();
  for (const a of list) {
    const g = byCourse.get(a.course.id) ?? { title: a.course.title, id: a.course.id, rows: [] };
    g.rows.push(a);
    byCourse.set(a.course.id, g);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ClipboardList className="h-7 w-7 text-primary" /> Assignments
          </h1>
          <p className="mt-1 text-muted-foreground">
            Grade your students&apos; work.{" "}
            {toGrade ? <span className="font-semibold text-warning">{toGrade} submissions are waiting for a grade.</span> : "Everything is graded."} New
            assignments are added in the Course Builder, under a lesson.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search assignments or courses" className="pl-9" />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : !list.length ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            No assignments yet. Open a course in the Course Builder and use “+ Assignment” under a lesson.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {[...byCourse.values()].map((g) => (
            <div key={g.id} className="overflow-hidden rounded-xl border bg-card">
              <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
                <p className="min-w-0 truncate font-semibold">{g.title}</p>
                <Link href={`/dashboard/courses/${g.id}/builder?step=curriculum`} className="shrink-0 text-xs font-semibold text-brand hover:underline">
                  Course Builder
                </Link>
              </div>
              <ul className="divide-y">
                {g.rows.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => router.push(`/dashboard/assignments?assignment=${a.id}`)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                    >
                      <ClipboardList className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-semibold">{a.title}</span>
                          {!a.published ? <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold uppercase text-muted-foreground">Draft</span> : null}
                          {!a.placed ? (
                            <span className="rounded-full bg-warning-soft px-1.5 text-[10px] font-semibold uppercase text-warning">Not in curriculum</span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {a.lesson_title ?? a.section_title ?? "—"} · {a.max_points} points
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs">
                        {a.ungraded_count ? (
                          <span className="rounded-full bg-warning-soft px-2 py-0.5 font-semibold text-warning">{a.ungraded_count} to grade</span>
                        ) : null}
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Users className="h-3.5 w-3.5" /> {a.submission_count}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Submissions({ assignmentId }: { assignmentId: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["assignment-submissions", assignmentId],
    queryFn: () => assignmentApi.submissions(assignmentId).then((r) => r.data),
  });
  const [show, setShow] = useState<"todo" | "all">("todo");
  if (isLoading) return <Skeleton className="h-72 rounded-xl" />;
  if (isError || !data) return <p className="rounded-xl border p-6 text-sm text-destructive">{getApiErrorMessage(error, "Could not load the submissions")}</p>;
  const a = data.assignment;
  const todo = data.data.filter((s) => !s.graded_at);
  const rows = show === "todo" ? todo : data.data;
  const due = dueLabel(a.due_at);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{a.course.title}</p>
        <h1 className="text-xl font-bold">{a.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
          <span>
            {a.max_points} points{a.pass_points != null ? ` · pass ${a.pass_points}` : ""}
          </span>
          {due ? (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" /> due {due.text}
            </span>
          ) : null}
          <Link href={`/learn/${encodeURIComponent(a.course.slug)}?assignment=${a.id}`} className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> View as student
          </Link>
        </p>
      </div>
      <div className="flex gap-2">
        {(
          [
            ["todo", `To grade (${todo.length})`],
            ["all", `All submissions (${data.data.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setShow(k)}
            className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", show === k ? "border-brand bg-brand text-white" : "hover:bg-muted")}
          >
            {label}
          </button>
        ))}
      </div>
      {!rows.length ? (
        <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          {show === "todo" ? "Nothing to grade — well done." : "No student has submitted this assignment yet."}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((s) => (
            <SubmissionCard key={s.id} s={s} max={a.max_points} assignmentId={assignmentId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SubmissionCard({ s, max, assignmentId }: { s: StaffSubmission; max: number; assignmentId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(!s.graded_at);
  const [grade, setGrade] = useState(s.grade == null ? "" : String(s.grade));
  const [feedback, setFeedback] = useState(s.feedback ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setGrade(s.grade == null ? "" : String(s.grade));
    setFeedback(s.feedback ?? "");
  }, [s.grade, s.feedback]);
  const long = (s.body?.length ?? 0) > 600;
  const [more, setMore] = useState(false);
  const body = useMemo(() => (s.body && long && !more ? `${s.body.slice(0, 600)}…` : s.body), [s.body, long, more]);

  const save = async () => {
    const g = Number(grade);
    if (grade.trim() === "" || !Number.isFinite(g) || g < 0 || g > max) {
      toast.error(`The grade must be between 0 and ${max}.`);
      return;
    }
    setSaving(true);
    try {
      await assignmentApi.grade(s.id, { grade: g, feedback: feedback.trim() });
      toast.success(`Graded ${s.student.name}: ${g} / ${max}`);
      qc.invalidateQueries({ queryKey: ["assignment-submissions", assignmentId] });
      qc.invalidateQueries({ queryKey: ["staff-assignments"] });
      qc.invalidateQueries({ queryKey: ["builder-items"] });
      setOpen(false);
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not save the grade"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="overflow-hidden rounded-xl border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand">
          {s.student.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{s.student.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {s.student.email} · {formatDateTime(s.submitted_at)}
            {s.late ? <span className="font-semibold text-destructive"> · late</span> : null}
          </span>
        </span>
        {s.graded_at ? (
          <AssignmentStatusChip status="graded" grade={s.grade} max={max} passed={s.passed} />
        ) : (
          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">To grade</span>
        )}
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="space-y-3 border-t px-4 py-4">
          {body ? (
            <div className="rounded-lg bg-muted/40 px-3 py-2.5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{body}</p>
              {long ? (
                <button type="button" onClick={() => setMore((m) => !m)} className="mt-1 text-xs font-semibold text-brand">
                  {more ? "Show less" : "Show all"}
                </button>
              ) : null}
            </div>
          ) : null}
          {s.files.length ? (
            <ul className="divide-y rounded-lg border">
              {s.files.map((f) => (
                <DirectFileRow key={f.url} f={f} />
              ))}
            </ul>
          ) : null}
          {!body && !s.files.length ? <p className="text-sm text-muted-foreground">No text or file was kept for this answer.</p> : null}
          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Grade (0–{max})</span>
              <Input type="number" min={0} max={max} value={grade} onChange={(e) => setGrade(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Feedback for the student (optional)</span>
              <Textarea rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What was good, what to improve…" />
            </label>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={save} disabled={saving} className="bg-brand text-white hover:bg-brand-hover">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {s.graded_at ? "Update grade" : "Save grade"}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export default function AssignmentsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
      <AssignmentsInner />
    </Suspense>
  );
}
