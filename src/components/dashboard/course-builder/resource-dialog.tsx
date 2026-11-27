"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp, FolderOpen, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COURSE_FILE_ACCEPT, resourceApi, uploadFile, type BuilderResource, type FileRef } from "@/services/api/course-items";
import { FileBadge, fmtSize } from "@/components/learning/item-ui";
import { cn, getApiErrorMessage } from "@/lib/utils";
import type { LessonOption } from "@/components/dashboard/course-builder/lesson-items";

const COURSE_LEVEL = "__course__";

/** Add a file / link under a lesson (or for the whole course), or rename / move one. */
export function ResourceDialog({
  open,
  onOpenChange,
  courseId,
  lessonId,
  resource,
  lessonOptions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  courseId: string;
  /** where a new resource goes (null = course materials) */
  lessonId: string | null;
  /** edit this one instead of adding */
  resource: BuilderResource | null;
  lessonOptions: LessonOption[];
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"file" | "link">("file");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<FileRef | null>(null);
  const [place, setPlace] = useState<string>(COURSE_LEVEL);
  const [uploading, setUploading] = useState<{ name: string; pct: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMode(resource?.kind ?? "file");
    setTitle(resource?.title ?? "");
    setUrl(resource?.kind === "link" ? resource.url : "");
    setFile(null);
    setPlace((resource ? resource.lesson_id : lessonId) ?? COURSE_LEVEL);
    setUploading(null);
  }, [open, resource, lessonId]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setUploading({ name: f.name, pct: 0 });
    try {
      const ref = await uploadFile(f, { purpose: "course-file", course_id: courseId }, (pct) => setUploading({ name: f.name, pct }));
      setFile(ref);
      if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      toast.error(getApiErrorMessage(e, e instanceof Error ? e.message : "Upload failed"));
    } finally {
      setUploading(null);
      if (input.current) input.current.value = "";
    }
  };

  const save = async () => {
    const lesson = place === COURSE_LEVEL ? null : place;
    setSaving(true);
    try {
      if (resource) {
        if (!title.trim()) throw new Error("Give the resource a name.");
        await resourceApi.update(resource.id, { title: title.trim(), lesson_id: lesson });
        toast.success("Resource saved");
      } else if (mode === "file") {
        if (!file) throw new Error("Upload a file first.");
        await resourceApi.create(courseId, { lesson_id: lesson, title: title.trim(), kind: "file", url: file.url, file_name: file.name, size: file.size ?? undefined });
        toast.success("File added");
      } else {
        const u = url.trim();
        if (!/^https?:\/\/\S+$/i.test(u)) throw new Error("Enter a link that starts with https://");
        await resourceApi.create(courseId, { lesson_id: lesson, title: title.trim(), kind: "link", url: u });
        toast.success("Link added");
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(getApiErrorMessage(e, e instanceof Error ? e.message : "Could not save the resource"));
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || !!uploading;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-brand" />
            {resource ? "Edit resource" : "Add a resource"}
          </DialogTitle>
          <DialogDescription>Slides, PDFs, Word / Excel files, data files or a link. Students find it under the lesson and in the Resources tab.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!resource ? (
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(["file", "link"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition",
                    mode === m ? "bg-background shadow-sm" : "text-muted-foreground"
                  )}
                >
                  {m === "file" ? <FileUp className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                  {m === "file" ? "Upload a file" : "Add a link"}
                </button>
              ))}
            </div>
          ) : null}

          {!resource && mode === "file" ? (
            <div className="space-y-2">
              <input ref={input} type="file" accept={COURSE_FILE_ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
              {file ? (
                <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  <FileBadge mime={file.mime} name={file.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{fmtSize(file.size)}</span>
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => input.current?.click()} disabled={busy}>
                    Change
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  disabled={busy}
                  className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-sm text-muted-foreground hover:border-brand/50 hover:bg-brand-soft/40"
                >
                  <FileUp className="h-6 w-6 text-brand" />
                  <span className="font-medium text-foreground">Choose a file</span>
                  <span className="text-xs">PDF, Word, PowerPoint, Excel, ZIP, images, audio, MP4 — up to 200 MB</span>
                </button>
              )}
              {uploading ? (
                <div className="space-y-1 rounded-lg bg-muted/60 px-3 py-2 text-xs">
                  <p className="truncate">Uploading {uploading.name}…</p>
                  <Progress value={uploading.pct} className="h-1.5" />
                </div>
              ) : null}
            </div>
          ) : null}

          {!resource && mode === "link" ? (
            <div className="space-y-1.5">
              <Label htmlFor="rs-url">Link</Label>
              <Input id="rs-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="rs-title">Name shown to students</Label>
            <Input id="rs-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lecture slides" maxLength={255} />
          </div>

          <div className="space-y-1.5">
            <Label>Where</Label>
            <Select value={place} onValueChange={setPlace}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={COURSE_LEVEL}>Course materials (whole course)</SelectItem>
                {lessonOptions.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.sectionTitle} › {l.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={busy} className="bg-brand text-white hover:bg-brand-hover">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {resource ? "Save" : "Add"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
