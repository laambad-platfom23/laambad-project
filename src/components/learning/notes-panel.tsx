"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookMarked, Clock, Loader2, NotebookPen, Pencil, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { notesApi, type Note } from "@/services/api/course-extras";
import { playback } from "@/components/learning/watch-tracker";
import { cn, formatDateTime, getApiErrorMessage } from "@/lib/utils";

export function clockOf(secs: number) {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

export function useLessonNotes(lessonId: string | null | undefined) {
  return useQuery({
    queryKey: ["notes", "lesson", lessonId],
    queryFn: () => notesApi.list({ lesson_id: lessonId! }).then((r) => r.data.data),
    enabled: !!lessonId,
    staleTime: 60_000,
  });
}

/** Under the video: write a note (it remembers the video time) and see this lesson's notes. */
export function NotesPanel({ lessonId }: { lessonId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useLessonNotes(lessonId);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    try {
      const at = playback.seconds >= 1 ? Math.floor(playback.seconds) : null;
      await notesApi.create({ lesson_id: lessonId, body, position_secs: at });
      setDraft("");
      qc.invalidateQueries({ queryKey: ["notes"] });
      toast.success(at != null ? `Note saved at ${clockOf(at)}` : "Note saved");
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not save the note"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-3 shadow-sm">
        <Textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void save();
            }
          }}
          placeholder="Type your note here to save for later…"
          maxLength={10000}
          className="resize-y border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> The note keeps the video time. Ctrl + Enter saves.
          </p>
          <Button type="button" size="sm" onClick={save} disabled={saving || !draft.trim()} className="bg-brand text-white hover:bg-brand-hover">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save note
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          Notes on this lesson <span className="font-normal text-muted-foreground">({data?.length ?? 0})</span>
        </p>
        <Link href="/dashboard/notes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
          <BookMarked className="h-4 w-4" /> My notebook
        </Link>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data?.length ? (
        <div className="rounded-xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
          <NotebookPen className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          No notes yet. Write what you want to remember from this lesson — it is saved in your notebook.
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((n) => (
            <NoteItem key={n.id} n={n} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** One note with edit / delete (also used by the notebook page). */
export function NoteItem({ n, showPlace }: { n: Note; showPlace?: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(n.body);
  const [busy, setBusy] = useState(false);

  const update = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await notesApi.update(n.id, text.trim());
      qc.invalidateQueries({ queryKey: ["notes"] });
      setEditing(false);
      toast.success("Note updated");
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not update the note"));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm("Delete this note?")) return;
    setBusy(true);
    try {
      await notesApi.remove(n.id);
      qc.invalidateQueries({ queryKey: ["notes"] });
      toast.success("Note deleted");
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not delete the note"));
      setBusy(false);
    }
  };

  return (
    <li className="rounded-xl border bg-card p-3.5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {n.position_secs != null ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 font-semibold tabular-nums text-brand">
            <Clock className="h-3 w-3" /> {clockOf(n.position_secs)}
          </span>
        ) : null}
        {showPlace ? (
          <Link
            href={`/learn/${encodeURIComponent(n.course.slug)}?lesson=${n.lesson.id}&tab=notes`}
            className={cn("min-w-0 truncate font-medium text-foreground hover:underline", n.lesson.deleted && "pointer-events-none line-through")}
          >
            {n.lesson.title}
          </Link>
        ) : null}
        <span>{formatDateTime(n.created_at)}</span>
        <span className="ml-auto flex items-center gap-0.5">
          {!editing ? (
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)} aria-label="Edit note">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" disabled={busy} onClick={remove} aria-label="Delete note">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </span>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={10000} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(false); setText(n.body); }} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={update} disabled={busy || !text.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{n.body}</p>
      )}
    </li>
  );
}
