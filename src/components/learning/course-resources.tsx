"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, FileText, FolderOpen, Loader2 } from "lucide-react";
import apiClient from "@/services/api/client";
import { getApiErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

type FileItem = { id: string; name: string; mime: string; size: number | null; download: string };
type Resources = {
  course: FileItem[];
  lessons: { lesson_id: string; lesson_title: string; files: FileItem[]; links: { name: string; url: string }[] }[];
  total: number;
};

function fmtSize(n: number | null) {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
function kind(mime: string, name: string) {
  const ext = name.split(".").pop()?.toUpperCase() ?? "";
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "Slides";
  if (mime.includes("spreadsheet") || mime.includes("csv") || mime.includes("excel")) return "Sheet";
  if (mime.includes("word")) return "Word";
  return ext.slice(0, 5) || "File";
}

/** Downloads for the lesson being watched + the course's general materials. */
export function CourseResources({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["course-resources", courseId],
    queryFn: () => apiClient.get<Resources>(`/api/v1/courses/${courseId}/resources`).then((r) => r.data),
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (!data || data.total === 0) return null;
  const lesson = data.lessons.find((l) => l.lesson_id === lessonId);
  if (!lesson && !data.course.length) return null;

  const download = async (f: FileItem) => {
    setBusy(f.id);
    // open the tab inside the click (pop-up blockers allow that), then point it at the file
    const tab = window.open("about:blank", "_blank");
    try {
      const { data: link } = await apiClient.get<{ url: string; name: string }>(f.download);
      if (tab) tab.location.href = link.url;
      else window.location.href = link.url;
    } catch (e) {
      tab?.close();
      toast.error(getApiErrorMessage(e, "Could not open the file"));
    } finally {
      setBusy(null);
    }
  };

  const Row = ({ f }: { f: FileItem }) => (
    <li>
      <button type="button" onClick={() => download(f)} disabled={!!busy} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-[10px] font-bold text-brand">
          {kind(f.mime, f.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{f.name}</span>
          {f.size ? <span className="text-xs text-muted-foreground">{fmtSize(f.size)}</span> : null}
        </span>
        {busy === f.id ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Download className="h-4 w-4 text-muted-foreground" />}
      </button>
    </li>
  );

  return (
    <div className="mt-3 shrink-0 overflow-hidden rounded-2xl border bg-card">
      {lesson ? (
        <>
          <p className="flex items-center gap-2 border-b px-4 py-2.5 text-sm font-semibold">
            <FileText className="h-4 w-4 text-brand" /> Lesson resources
          </p>
          <ul className="divide-y">
            {lesson.files.map((f) => (
              <Row key={f.id} f={f} />
            ))}
            {lesson.links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <ExternalLink className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.name}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {data.course.length ? (
        <details className={lesson ? "border-t" : ""} open={!lesson}>
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm font-semibold">
            <FolderOpen className="h-4 w-4 text-brand" /> Course materials ({data.course.length})
          </summary>
          <ul className="divide-y border-t">
            {data.course.map((f) => (
              <Row key={f.id} f={f} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
