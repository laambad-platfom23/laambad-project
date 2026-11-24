"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Map as MapIcon, Pencil, Plus, Route, Search, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { coursesApi } from "@/services/api/courses";
import { learningPathsApi, type LearningPath, type LearningPathInput } from "@/services/api/student-features";
import { useAuthStore } from "@/store/auth-store";
import { isAdminUser } from "@/lib/auth-routing";
import { getApiErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

/** A2: learning paths — students follow them; admins create / order / publish them. */
export default function LearningPathsPage() {
  const user = useAuthStore((s) => s.user);
  const admin = isAdminUser(user);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<LearningPath | "new" | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["learning-paths", user?.id],
    queryFn: () => learningPathsApi.list().then((r) => r.data),
    enabled: !!user,
  });

  const remove = useMutation({
    mutationFn: (id: string) => learningPathsApi.remove(id),
    onSuccess: () => {
      toast.success("Learning path removed");
      qc.invalidateQueries({ queryKey: ["learning-paths"] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not remove")),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Route className="h-7 w-7 text-primary" />
            Learning paths
          </h1>
          <p className="mt-1 text-muted-foreground">Step-by-step programs: take the courses in order to master a skill.</p>
        </div>
        {admin ? (
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> New path
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : !data?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center">
            <MapIcon className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 font-semibold">No learning paths yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {admin ? "Create the first path from your courses." : "New programs will appear here soon."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((p) => (
            <Card key={p.id} className="overflow-hidden">
              {p.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.cover_url} alt="" className="h-36 w-full object-cover" />
              ) : (
                <div className="flex h-24 items-center justify-center bg-brand-soft text-brand">
                  <Route className="h-8 w-8" />
                </div>
              )}
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/dashboard/learning-paths/${encodeURIComponent(p.slug)}`} className="font-semibold hover:underline">
                      {p.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {p.course_count} {p.course_count === 1 ? "course" : "courses"}
                      {p.level ? ` · ${p.level}` : ""}
                    </p>
                  </div>
                  {admin ? (
                    <Badge variant={p.status === "published" ? "default" : "secondary"}>{p.status}</Badge>
                  ) : null}
                </div>
                {p.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p> : null}
                {p.progress_percent !== undefined && p.course_count > 0 ? (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {p.finished_courses}/{p.course_count} courses finished
                      </span>
                      <span>{p.progress_percent}%</span>
                    </div>
                    <Progress value={p.progress_percent} className="h-2" />
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link href={`/dashboard/learning-paths/${encodeURIComponent(p.slug)}`}>View path</Link>
                  </Button>
                  {admin ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                        <Pencil className="h-4 w-4" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        disabled={remove.isPending}
                        onClick={() => window.confirm(`Remove "${p.title}"?`) && remove.mutate(p.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {admin && editing ? (
        <PathEditor
          path={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["learning-paths"] });
          }}
        />
      ) : null}
    </div>
  );
}

function PathEditor({ path, onClose, onSaved }: { path: LearningPath | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(path?.title ?? "");
  const [description, setDescription] = useState(path?.description ?? "");
  const [coverUrl, setCoverUrl] = useState(path?.cover_url ?? "");
  const [level, setLevel] = useState(path?.level ?? "");
  const [status, setStatus] = useState<"draft" | "published">((path?.status as "draft" | "published") ?? "draft");
  const [courses, setCourses] = useState<{ id: string; title: string }[]>(
    path?.courses.map((c) => ({ id: c.id, title: c.title })) ?? []
  );
  const [q, setQ] = useState("");

  const search = useQuery({
    queryKey: ["path-course-search", q],
    queryFn: () => coursesApi.list(1, 20, false, { q, status: "published" }).then((r) => r.data.data ?? []),
    enabled: q.trim().length >= 2,
  });

  const save = useMutation({
    mutationFn: () => {
      const data: LearningPathInput = {
        title,
        description: description || null,
        cover_url: coverUrl || null,
        level: level || null,
        status,
        course_ids: courses.map((c) => c.id),
      };
      return path ? learningPathsApi.update(path.id, data) : learningPathsApi.create(data);
    },
    onSuccess: () => {
      toast.success(path ? "Learning path saved" : "Learning path created");
      onSaved();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not save")),
  });

  const move = (i: number, d: -1 | 1) => {
    const next = [...courses];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setCourses(next);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{path ? "Edit learning path" : "New learning path"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lp-title">Title</Label>
            <Input id="lp-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lp-desc">Description</Label>
            <Textarea id="lp-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="lp-cover">Cover image URL (optional)</Label>
              <Input id="lp-cover" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lp-level">Level</Label>
              <select
                id="lp-level"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">—</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="all">All levels</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Courses (in order)</Label>
            {courses.length ? (
              <ol className="space-y-1.5">
                {courses.map((c, i) => (
                  <li key={c.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <span className="w-5 shrink-0 text-xs font-semibold text-muted-foreground">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => move(i, 1)}
                      disabled={i === courses.length - 1}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setCourses(courses.filter((x) => x.id !== c.id))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No courses yet — search below to add them.</p>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search published courses…" />
            </div>
            {q.trim().length >= 2 ? (
              <div className="max-h-48 overflow-y-auto rounded-lg border">
                {search.isLoading ? (
                  <p className="p-3 text-sm text-muted-foreground">Searching…</p>
                ) : !search.data?.length ? (
                  <p className="p-3 text-sm text-muted-foreground">No courses found.</p>
                ) : (
                  search.data.map((c) => {
                    const added = courses.some((x) => x.id === c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={added}
                        onClick={() => setCourses([...courses, { id: c.id, title: c.title }])}
                        className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/60 disabled:opacity-50"
                      >
                        <span className="truncate">{c.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{added ? "Added" : "Add"}</span>
                      </button>
                    );
                  })
                )}
              </div>
            ) : null}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={status === "published"}
              onChange={(e) => setStatus(e.target.checked ? "published" : "draft")}
            />
            Published (visible to students)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!title.trim() || save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
