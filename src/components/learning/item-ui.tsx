"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Download, ExternalLink, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { courseItemsApi, type FileRef, type ResourceFile, type ResourceLink } from "@/services/api/course-items";
import { cn, getApiErrorMessage } from "@/lib/utils";

export function fmtSize(n: number | null | undefined) {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

/** Short label for a file: PDF, Word, Slides, Sheet, ZIP, Image… */
export function fileKind(mime: string | null | undefined, name: string) {
  const m = (mime ?? "").toLowerCase();
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (m.includes("pdf") || ext === "pdf") return "PDF";
  if (m.includes("presentation") || m.includes("powerpoint") || ["ppt", "pptx", "pps", "ppsx", "odp"].includes(ext)) return "Slides";
  if (m.includes("spreadsheet") || m.includes("excel") || m.includes("csv") || ["xls", "xlsx", "xlsm", "csv", "ods"].includes(ext)) return "Sheet";
  if (m.includes("word") || ["doc", "docx", "odt", "rtf"].includes(ext)) return "Word";
  if (["zip", "rar", "7z"].includes(ext)) return "ZIP";
  if (m.startsWith("image/")) return "Image";
  if (m.startsWith("audio/")) return "Audio";
  if (m.startsWith("video/")) return "Video";
  return ext ? ext.toUpperCase().slice(0, 5) : "File";
}

export function FileBadge({ mime, name, className }: { mime?: string | null; name: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-[10px] font-bold uppercase text-brand",
        className
      )}
    >
      {fileKind(mime, name)}
    </span>
  );
}

/** Open a course file: the address is asked for at click time (members only), in a new tab. */
export async function openResource(download: string) {
  // open the tab inside the click (pop-up blockers allow that), then point it at the file
  const tab = window.open("about:blank", "_blank");
  try {
    const { data } = await courseItemsApi.resourceLink(download);
    if (tab) tab.location.href = data.url;
    else window.location.href = data.url;
  } catch (e) {
    tab?.close();
    toast.error(getApiErrorMessage(e, "Could not open the file"));
  }
}

/** A downloadable course resource (old-site or builder file). */
export function ResourceFileRow({ f, compact }: { f: ResourceFile; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <li>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await openResource(f.download);
          setBusy(false);
        }}
        className={cn("flex w-full items-center gap-3 text-left hover:bg-muted/50", compact ? "px-3 py-2" : "px-4 py-2.5")}
      >
        <FileBadge mime={f.mime} name={f.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{f.name}</span>
          {f.size ? <span className="text-xs text-muted-foreground">{fmtSize(f.size)}</span> : null}
        </span>
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Download className="h-4 w-4 text-muted-foreground" />}
      </button>
    </li>
  );
}

export function ResourceLinkRow({ l, compact }: { l: ResourceLink; compact?: boolean }) {
  return (
    <li>
      <a
        href={l.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={cn("flex items-center gap-3 hover:bg-muted/50", compact ? "px-3 py-2" : "px-4 py-2.5")}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <ExternalLink className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{l.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{l.url.replace(/^https?:\/\//i, "")}</span>
        </span>
      </a>
    </li>
  );
}

/** A file with a direct address (assignment brief, an answer file). */
export function DirectFileRow({ f, onRemove }: { f: FileRef; onRemove?: () => void }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <FileBadge mime={f.mime} name={f.name} />
      <a href={f.url} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 flex-1 hover:underline">
        <span className="block truncate text-sm font-medium">{f.name}</span>
        {f.size ? <span className="text-xs text-muted-foreground">{fmtSize(f.size)}</span> : null}
      </a>
      {onRemove ? (
        <button type="button" onClick={onRemove} className="rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10">
          Remove
        </button>
      ) : (
        <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </li>
  );
}

export function LockedNote() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Lock className="h-3 w-3" /> Locked
    </span>
  );
}

/** Assignment status chip: To do / Submitted / 8 / 10. */
export function AssignmentStatusChip({
  status,
  grade,
  max,
  passed,
  className,
}: {
  status: "not_submitted" | "submitted" | "graded";
  grade: number | null;
  max: number;
  passed: boolean | null;
  className?: string;
}) {
  if (status === "graded") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
          passed === false ? "bg-destructive/10 text-destructive" : "bg-success-soft text-success",
          className
        )}
      >
        <CheckCircle2 className="h-3 w-3" />
        {grade} / {max}
      </span>
    );
  }
  if (status === "submitted") {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning", className)}>
        <Clock className="h-3 w-3" /> Waiting for grade
      </span>
    );
  }
  return <span className={cn("rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand", className)}>To do</span>;
}

export function dueLabel(due: string | null) {
  if (!due) return null;
  const d = new Date(due);
  const past = d.getTime() < Date.now();
  const text = d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return { text, past };
}
