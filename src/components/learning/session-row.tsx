"use client";

import { Trash2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LiveSession } from "@/services/api/course-features";
import { cn } from "@/lib/utils";

function when(s: LiveSession) {
  const d = new Date(s.starts_at);
  return d.toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** One live session: time, course, join button (link from 15 minutes before), cancel for staff. */
export function SessionRow({ s, staff, onCancel }: { s: LiveSession; staff?: boolean; onCancel?: () => void }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3 px-4 py-3", s.is_live && "bg-success-soft")}>
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", s.is_live ? "bg-success text-white" : "bg-brand-soft text-brand")}>
        <Video className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{s.title}</p>
        <p className="text-xs text-muted-foreground">
          {s.course_title ? `${s.course_title} · ` : ""}
          {when(s)} · {s.duration_min} min {s.is_live ? "· LIVE now" : ""}
        </p>
      </div>
      {s.meet_url ? (
        <Button asChild size="sm" className={cn(s.is_live && "bg-success hover:bg-success/90")}>
          <a href={s.meet_url} target="_blank" rel="noopener noreferrer">
            Join on Google Meet
          </a>
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground">Link opens 15 min before</span>
      )}
      {staff && onCancel ? (
        <Button size="sm" variant="outline" className="text-destructive" onClick={onCancel} aria-label="Cancel session">
          <Trash2 className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}

