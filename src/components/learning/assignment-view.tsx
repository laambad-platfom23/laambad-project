"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Award, CalendarClock, ClipboardList, FileUp, Loader2, Lock, Paperclip, Pencil, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { CourseDescriptionBlocks } from "@/components/courses/course-description-blocks";
import { assignmentApi, FILE_ACCEPT, uploadFile, type AssignmentDetail, type FileRef } from "@/services/api/course-items";
import { AssignmentStatusChip, DirectFileRow, dueLabel } from "@/components/learning/item-ui";
import { cn, formatDateTime, getApiErrorMessage } from "@/lib/utils";

const MAX_FILES = 5;

/** A student's view of one assignment: the brief, then the answer form or the result. */
export function AssignmentView({ assignmentId, onBack, backLabel }: { assignmentId: string; onBack?: () => void; backLabel?: string }) {
  const qc = useQueryClient();
  const { data: a, isLoading, isError, error } = useQuery({
    queryKey: ["assignment", assignmentId],
    queryFn: () => assignmentApi.get(assignmentId).then((r) => r.data),
  });
  const [editing, setEditing] = useState(false);

  if (isLoading) return <Skeleton className="h-80 w-full rounded-2xl" />;
  if (isError || !a) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
        {getApiErrorMessage(error, "This assignment is not available.")}
      </div>
    );
  }

  const due = dueLabel(a.due_at);
  const s = a.submission;
  const showForm = !a.is_staff && !a.locked && (a.status === "not_submitted" || (a.status === "submitted" && editing));

  const onSaved = (fresh: AssignmentDetail) => {
    qc.setQueryData(["assignment", assignmentId], fresh);
    qc.invalidateQueries({ queryKey: ["learning-items", fresh.course.id] });
    qc.invalidateQueries({ queryKey: ["my-assignments"] });
    qc.invalidateQueries({ queryKey: ["my-streak"] });
    setEditing(false);
  };

  return (
    <div className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <ClipboardList className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Assignment{a.lesson_title ? ` · ${a.lesson_title}` : a.section_title ? ` · ${a.section_title}` : ""}
          </p>
          <h2 className="text-xl font-bold leading-tight">{a.title}</h2>
        </div>
        {onBack ? (
          <Button variant="ghost" size="sm" className="shrink-0" onClick={onBack}>
            {backLabel ?? "Back"}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <AssignmentStatusChip status={a.status} grade={s?.grade ?? null} max={a.max_points} passed={s?.passed ?? null} />
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
          {a.max_points} points{a.pass_points != null ? ` · pass ${a.pass_points}` : ""}
        </span>
        {due ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
              due.past && a.status === "not_submitted" ? "bg-destructive/10 text-destructive" : "bg-muted"
            )}
          >
            <CalendarClock className="h-3 w-3" /> Due {due.text}
          </span>
        ) : null}
      </div>

      {a.description_blocks?.length ? (
        <CourseDescriptionBlocks blocks={a.description_blocks} className="text-[15px]" />
      ) : a.description_text ? (
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-muted-foreground">{a.description_text}</p>
      ) : null}

      {a.files.length ? (
        <div className="overflow-hidden rounded-xl border">
          <p className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Paperclip className="h-3.5 w-3.5" /> Files from your instructor
          </p>
          <ul className="divide-y">
            {a.files.map((f) => (
              <DirectFileRow key={f.url} f={f} />
            ))}
          </ul>
        </div>
      ) : null}

      {a.is_staff ? (
        <div className="rounded-xl border border-brand/30 bg-brand-soft px-4 py-3 text-sm">
          You teach this course: students submit their answers here.{" "}
          <Link href={`/dashboard/assignments?assignment=${a.id}`} className="font-semibold text-brand underline underline-offset-2">
            See and grade the submissions
          </Link>
        </div>
      ) : a.locked ? (
        <div className="flex items-center gap-3 rounded-xl bg-muted px-4 py-3 text-sm">
          <Lock className="h-4 w-4 shrink-0" />
          This course opens lessons in order. Complete the earlier lessons to unlock this assignment.
        </div>
      ) : null}

      {s && !showForm ? <SubmissionResult a={a} onEdit={a.status === "submitted" && !a.locked ? () => setEditing(true) : undefined} /> : null}

      {showForm ? (
        <SubmitForm
          a={a}
          initial={editing && s ? { body: s.body ?? "", files: s.files } : { body: "", files: [] }}
          onCancel={editing ? () => setEditing(false) : undefined}
          onSaved={onSaved}
        />
      ) : null}
    </div>
  );
}

function SubmissionResult({ a, onEdit }: { a: AssignmentDetail; onEdit?: () => void }) {
  const s = a.submission!;
  return (
    <div className="space-y-3">
      {a.status === "graded" ? (
        <div className={cn("rounded-2xl p-5 text-center", s.passed === false ? "bg-destructive/10" : "bg-success-soft")}>
          {s.passed === false ? <XCircle className="mx-auto h-10 w-10 text-destructive" /> : <Award className="mx-auto h-10 w-10 text-success" />}
          <p className="mt-1 text-3xl font-extrabold tabular-nums">
            {s.grade} / {a.max_points}
          </p>
          <p className="text-sm font-semibold">
            {s.passed === true ? "Passed — well done!" : s.passed === false ? `Not passed — the pass mark is ${a.pass_points}` : "Graded"}
          </p>
          {s.feedback ? (
            <p className="mx-auto mt-3 max-w-xl whitespace-pre-wrap rounded-xl bg-background/70 px-4 py-3 text-left text-sm">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Feedback from your instructor</span>
              {s.feedback}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm">
          <span>
            Submitted {formatDateTime(s.submitted_at)}
            {s.late ? <span className="ml-1 font-semibold text-destructive">(late)</span> : null} — waiting for your instructor to grade it.
          </span>
          {onEdit ? (
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" /> Edit answer
            </Button>
          ) : null}
        </div>
      )}
      <div className="rounded-xl border">
        <p className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your answer</p>
        {s.body ? <p className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed">{s.body}</p> : null}
        {s.files.length ? (
          <ul className="divide-y border-t">
            {s.files.map((f) => (
              <DirectFileRow key={f.url} f={f} />
            ))}
          </ul>
        ) : null}
        {!s.body && !s.files.length ? <p className="px-4 py-3 text-sm text-muted-foreground">No text or file was kept for this answer.</p> : null}
      </div>
    </div>
  );
}

function SubmitForm({
  a,
  initial,
  onCancel,
  onSaved,
}: {
  a: AssignmentDetail;
  initial: { body: string; files: FileRef[] };
  onCancel?: () => void;
  onSaved: (fresh: AssignmentDetail) => void;
}) {
  const [body, setBody] = useState(initial.body);
  const [files, setFiles] = useState<FileRef[]>(initial.files);
  const [uploading, setUploading] = useState<{ name: string; pct: number } | null>(null);
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const due = dueLabel(a.due_at);

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const room = MAX_FILES - files.length;
    const picked = Array.from(list).slice(0, Math.max(0, room));
    if (list.length > room) toast.message(`You can attach up to ${MAX_FILES} files.`);
    for (const f of picked) {
      setUploading({ name: f.name, pct: 0 });
      try {
        const ref = await uploadFile(f, { purpose: "submission", assignment_id: a.id }, (pct) => setUploading({ name: f.name, pct }));
        setFiles((cur) => [...cur, ref]);
      } catch (e) {
        toast.error(getApiErrorMessage(e, e instanceof Error ? e.message : "Upload failed"));
      }
    }
    setUploading(null);
    if (input.current) input.current.value = "";
  };

  const send = async () => {
    if (!body.trim() && !files.length) {
      toast.error("Write your answer or attach a file first.");
      return;
    }
    setSending(true);
    try {
      const { data } = await assignmentApi.submit(a.id, { body: body.trim(), files });
      toast.success(a.status === "submitted" ? "Your answer was updated" : "Assignment submitted — good work!");
      onSaved(data);
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not submit the assignment"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <p className="text-sm font-semibold">{a.status === "submitted" ? "Edit your answer" : "Your answer"}</p>
      {due?.past ? (
        <p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" /> The due date has passed — you can still submit, it will be marked late.
        </p>
      ) : null}
      <Textarea
        rows={6}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your answer here (optional if you attach a file)…"
        maxLength={20000}
        className="resize-y"
      />
      {files.length ? (
        <ul className="divide-y rounded-lg border">
          {files.map((f) => (
            <DirectFileRow key={f.url} f={f} onRemove={() => setFiles((cur) => cur.filter((x) => x.url !== f.url))} />
          ))}
        </ul>
      ) : null}
      {uploading ? (
        <div className="space-y-1 rounded-lg bg-muted/60 px-3 py-2 text-xs">
          <p className="truncate">Uploading {uploading.name}…</p>
          <Progress value={uploading.pct} className="h-1.5" />
        </div>
      ) : null}
      <input ref={input} type="file" multiple accept={FILE_ACCEPT} className="hidden" onChange={(e) => addFiles(e.target.files)} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={!!uploading || files.length >= MAX_FILES} onClick={() => input.current?.click()}>
          <FileUp className="h-4 w-4" /> Attach file
        </Button>
        <span className="text-xs text-muted-foreground">PDF, Word, Excel, PowerPoint, images, ZIP… up to 50 MB each, {MAX_FILES} files</span>
        <div className="ml-auto flex gap-2">
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={sending}>
              Cancel
            </Button>
          ) : null}
          <Button type="button" onClick={send} disabled={sending || !!uploading} className="bg-brand text-white hover:bg-brand-hover">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {a.status === "submitted" ? "Save answer" : "Submit assignment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
