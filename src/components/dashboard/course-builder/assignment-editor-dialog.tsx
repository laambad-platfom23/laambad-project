"use client";

import { PositionSelect, positionPayload, positionValue, type TopicOption } from "@/components/dashboard/course-builder/position-select";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assignmentApi, COURSE_FILE_ACCEPT, uploadFile, type FileRef } from "@/services/api/course-items";
import { DirectFileRow } from "@/components/learning/item-ui";
import { getApiErrorMessage } from "@/lib/utils";

/** datetime-local value (local time) ↔ ISO */
function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AssignmentEditorDialog({
  open,
  onOpenChange,
  courseId,
  assignmentId,
  lessonId,
  sectionId,
  topics,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  courseId: string;
  /** null = a new assignment: after `lessonId`, or at the end of topic `sectionId` */
  assignmentId: string | null;
  lessonId: string | null;
  sectionId?: string | null;
  topics: TopicOption[];
  onSaved: () => void;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["assignment", assignmentId],
    queryFn: () => assignmentApi.get(assignmentId!).then((r) => r.data),
    enabled: open && !!assignmentId,
    staleTime: 0,
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pos, setPos] = useState("");
  const [due, setDue] = useState("");
  const [maxPoints, setMaxPoints] = useState("10");
  const [passPoints, setPassPoints] = useState("5");
  const [published, setPublished] = useState(true);
  const [files, setFiles] = useState<FileRef[]>([]);
  const [uploading, setUploading] = useState<{ name: string; pct: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (!assignmentId) {
      setTitle("");
      setDescription("");
      setPos(positionValue({ lesson_id: lessonId, section_id: sectionId }));
      setDue("");
      setMaxPoints("10");
      setPassPoints("5");
      setPublished(true);
      setFiles([]);
    } else if (data) {
      setTitle(data.title);
      setDescription(data.description ?? "");
      setPos(positionValue(data));
      setDue(toLocalInput(data.due_at));
      setMaxPoints(String(data.max_points));
      setPassPoints(data.pass_points == null ? "" : String(data.pass_points));
      setPublished(!!data.published);
      setFiles(data.files);
    }
  }, [open, assignmentId, data, lessonId, sectionId]);

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    for (const f of Array.from(list).slice(0, Math.max(0, 10 - files.length))) {
      setUploading({ name: f.name, pct: 0 });
      try {
        const ref = await uploadFile(f, { purpose: "course-file", course_id: courseId }, (pct) => setUploading({ name: f.name, pct }));
        setFiles((cur) => [...cur, ref]);
      } catch (e) {
        toast.error(getApiErrorMessage(e, e instanceof Error ? e.message : "Upload failed"));
      }
    }
    setUploading(null);
    if (input.current) input.current.value = "";
  };

  const save = async () => {
    if (!title.trim()) return toast.error("Give the assignment a title.");
    const place = positionPayload(pos);
    if (!place) return toast.error("Choose the topic of this assignment and where it goes.");
    const max = Number(maxPoints);
    if (!Number.isFinite(max) || max <= 0) return toast.error("Max points must be more than 0.");
    const pass = passPoints.trim() === "" ? null : Number(passPoints);
    if (pass != null && (!Number.isFinite(pass) || pass < 0 || pass > max)) return toast.error("Pass points must be between 0 and the max points.");
    setSaving(true);
    const payload = {
      ...place,
      title: title.trim(),
      description,
      due_at: due ? new Date(due).toISOString() : null,
      max_points: max,
      pass_points: pass,
      published,
      files,
    };
    try {
      if (assignmentId) await assignmentApi.update(assignmentId, payload);
      else await assignmentApi.create(courseId, payload);
      toast.success(assignmentId ? "Assignment saved" : "Assignment added to the topic");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not save the assignment"));
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || !!uploading;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[94dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="border-b px-5 py-4 sm:px-6">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5 text-brand" />
              {assignmentId ? "Edit assignment" : "New assignment"}
            </DialogTitle>
            <DialogDescription>Students answer with text and/or files; you grade it in Dashboard → Assignments.</DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          {assignmentId && isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : assignmentId && isError ? (
            <p className="text-sm text-destructive">{getApiErrorMessage(error, "Could not load the assignment")}</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="as-title">Title</Label>
                <Input id="as-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Write chapter one" maxLength={255} />
              </div>
              <div className="space-y-1.5">
                <Label>Topic and position</Label>
                <PositionSelect value={pos} onChange={setPos} topics={topics} />
                {data && !data.section_id ? (
                  <p className="text-xs text-warning">This assignment is not in the curriculum yet: students cannot see it until you choose a topic.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Assignments belong to a topic: right after one of its lessons, or at its end.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Instructions</Label>
                <RichTextEditor value={description} onChange={setDescription} placeholder="What should students do and hand in?" minHeight={160} />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="as-max">Max points</Label>
                  <Input id="as-max" type="number" min={1} max={1000} value={maxPoints} onChange={(e) => setMaxPoints(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="as-pass">Pass points (optional)</Label>
                  <Input id="as-pass" type="number" min={0} value={passPoints} onChange={(e) => setPassPoints(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="as-due">Due date (optional)</Label>
                  <Input id="as-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="block">Files for students (optional)</Label>
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
                <input ref={input} type="file" multiple accept={COURSE_FILE_ACCEPT} className="hidden" onChange={(e) => addFiles(e.target.files)} />
                <Button type="button" variant="outline" size="sm" disabled={busy || files.length >= 10} onClick={() => input.current?.click()}>
                  <FileUp className="h-4 w-4" /> Upload file
                </Button>
              </div>
              <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm">
                <span>
                  Published <span className="text-xs text-muted-foreground">(students can see and submit it)</span>
                </span>
                <Switch checked={published} onCheckedChange={setPublished} />
              </label>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t bg-muted/20 px-5 py-3 sm:px-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={busy || (!!assignmentId && !data)} className="bg-brand text-white hover:bg-brand-hover">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {assignmentId ? "Save assignment" : "Add assignment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
