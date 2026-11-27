"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Megaphone, Pencil, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { announcementsApi, type Announcement } from "@/services/api/course-extras";
import { formatDateTime, getApiErrorMessage, getInitials, timeAgo } from "@/lib/utils";

/** Learn page → Announcements: the course's news, newest first; the course staff can post here. */
export function AnnouncementsPanel({ courseId }: { courseId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["announcements", courseId],
    queryFn: () => announcementsApi.forCourse(courseId).then((r) => r.data),
  });
  const list = data?.data ?? [];
  return (
    <div className="space-y-4">
      {data?.can_post ? <AnnouncementForm courseId={courseId} /> : null}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !list.length ? (
        <div className="rounded-2xl border border-dashed px-6 py-10 text-center">
          <Megaphone className="mx-auto h-9 w-9 text-muted-foreground/50" />
          <p className="mt-2 font-semibold">No announcements yet</p>
          <p className="mt-1 text-sm text-muted-foreground">News from your instructor about this course shows here.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((a) => (
            <AnnouncementCard key={a.id} a={a} canEdit={!!data?.can_post} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Staff: write a new announcement for one course (students are notified). */
export function AnnouncementForm({ courseId, onPosted }: { courseId: string; onPosted?: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const post = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Write a title and the announcement.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await announcementsApi.create(courseId, { title: title.trim(), body: body.trim() });
      toast.success(data.notified ? `Announcement posted — ${data.notified} students notified` : "Announcement posted");
      setTitle("");
      setBody("");
      qc.invalidateQueries({ queryKey: ["announcements"] });
      qc.invalidateQueries({ queryKey: ["learning-items", courseId] });
      onPosted?.();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not post the announcement"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Megaphone className="h-4 w-4 text-brand" /> New announcement
      </p>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. Live class on Saturday" maxLength={255} />
      <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the announcement for the students of this course…" maxLength={20000} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Every student of this course gets a notification.</p>
        <Button type="button" onClick={post} disabled={busy} className="bg-brand text-white hover:bg-brand-hover">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Post
        </Button>
      </div>
    </div>
  );
}

export function AnnouncementCard({ a, canEdit, showCourse }: { a: Announcement; canEdit?: boolean; showCourse?: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(a.title);
  const [body, setBody] = useState(a.body);
  const [busy, setBusy] = useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["announcements"] });
    qc.invalidateQueries({ queryKey: ["learning-items", a.course.id] });
  };
  const save = async () => {
    setBusy(true);
    try {
      await announcementsApi.update(a.id, { title: title.trim(), body: body.trim() });
      toast.success("Announcement updated");
      setEditing(false);
      refresh();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not update the announcement"));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete the announcement “${a.title}”?`)) return;
    setBusy(true);
    try {
      await announcementsApi.remove(a.id);
      toast.success("Announcement deleted");
      refresh();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not delete the announcement"));
      setBusy(false);
    }
  };
  return (
    <li className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <Avatar className="h-9 w-9 shrink-0">
          {a.author?.avatar_url ? <AvatarImage src={a.author.avatar_url} alt="" /> : null}
          <AvatarFallback className="bg-[#0B1F3A] text-xs font-semibold text-white">{getInitials(a.author?.name ?? "Laambad")}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          {showCourse ? (
            <Link
              href={`/learn/${encodeURIComponent(a.course.slug)}?tab=announcements`}
              className="block truncate text-xs font-semibold uppercase tracking-wide text-brand hover:underline"
            >
              {a.course.title}
            </Link>
          ) : null}
          {editing ? (
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} className="mt-1" />
          ) : (
            <p className="font-semibold leading-snug">{a.title}</p>
          )}
          <p className="text-xs text-muted-foreground" title={formatDateTime(a.created_at)}>
            {a.author?.name ?? "Laambad"} · {timeAgo(a.created_at)}
            {a.edited ? " · edited" : ""}
          </p>
        </div>
        {canEdit && !editing ? (
          <span className="flex shrink-0 items-center gap-0.5">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(true)} aria-label="Edit announcement">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              disabled={busy}
              onClick={remove}
              aria-label="Delete announcement"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </span>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={20000} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setEditing(false); setTitle(a.title); setBody(a.body); }}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={busy || !title.trim() || !body.trim()} onClick={save}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{a.body}</p>
      )}
    </li>
  );
}
