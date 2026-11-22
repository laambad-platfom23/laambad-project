"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Circle, Play } from "lucide-react";
import type { Course, Lesson, Section } from "@/types";
import { cn } from "@/lib/utils";

export type SectionGroup = { section: Section; lessons: Lesson[] };

export function buildSectionGroups(course: Course | undefined): SectionGroup[] {
  if (!course?.sections?.length) return [];
  const sections = [...course.sections].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const out: SectionGroup[] = [];
  for (const sec of sections) {
    const lessons = [...(sec.lessons ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (lessons.length) out.push({ section: sec, lessons });
  }
  return out;
}

type ProgressEntry = { completed: boolean; percent: number };

type Props = {
  groups: SectionGroup[];
  activeLessonId: string | null;
  progressByLesson: Map<string, ProgressEntry>;
  polishLessonTitle: (t: string) => string;
  formatDuration: (min?: number) => string;
  onSelectLesson: (id: string) => void;
  /** `panel` = edge-to-edge LMS column (full height, no outer radius on large screens). */
  variant?: "embedded" | "panel";
};

const pad = (n: number) => String(n).padStart(2, "0");

/** "00:30:31 mins" like the old Tutor player. */
function clock(seconds?: number): string {
  if (!seconds || seconds <= 0) return "";
  const s = Math.round(seconds);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)} mins`;
}

function lessonSeconds(l: Lesson): number {
  return l.duration_seconds ?? (l.duration_minutes ? l.duration_minutes * 60 : 0);
}

function isDone(p?: ProgressEntry) {
  return !!p && (p.completed || p.percent >= 100);
}

/** Section status: empty ring → partial ring → green check (like the old player). */
function SectionStatus({ done, total }: { done: number; total: number }) {
  if (total > 0 && done >= total) return <DoneIcon className="h-[18px] w-[18px]" />;
  const r = 7.5;
  const len = 2 * Math.PI * r;
  const frac = total ? done / total : 0;
  return (
    <svg className="h-[18px] w-[18px] shrink-0 -rotate-90" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r={r} fill="none" strokeWidth="2.2" className="stroke-[#0B1F3A]/80 dark:stroke-white/70" strokeDasharray={frac > 0 ? "2.4 2.4" : undefined} />
      {frac > 0 ? (
        <circle cx="10" cy="10" r={r} fill="none" strokeWidth="2.6" strokeLinecap="round" strokeDasharray={`${len * frac} ${len}`} className="stroke-success" />
      ) : null}
    </svg>
  );
}

function DoneIcon({ className }: { className?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-success text-white", className)}>
      <Check className="h-[70%] w-[70%]" strokeWidth={3.2} />
    </span>
  );
}

export function CourseCurriculumSidebar({
  groups,
  activeLessonId,
  progressByLesson,
  polishLessonTitle,
  onSelectLesson,
  variant = "embedded",
}: Props) {
  const activeSectionId = useMemo(() => {
    for (const g of groups) {
      if (g.lessons.some((l) => l.id === activeLessonId)) return g.section.id;
    }
    return null;
  }, [groups, activeLessonId]);

  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!activeSectionId) return;
    setOpen((prev) => ({ ...prev, [activeSectionId]: true }));
  }, [activeSectionId]);

  // scroll the active lesson into view when it changes
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const t = setTimeout(() => activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 250);
    return () => clearTimeout(t);
  }, [activeLessonId]);

  const totals = useMemo(() => {
    let total = 0;
    let done = 0;
    for (const g of groups)
      for (const l of g.lessons) {
        total++;
        if (isDone(progressByLesson.get(l.id))) done++;
      }
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [groups, progressByLesson]);

  const isPanel = variant === "panel";

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-white dark:bg-[#0c1829]",
        isPanel
          ? "h-full border-t border-[#0B1F3A]/10 dark:border-white/15 lg:border-r lg:border-t-0"
          : "rounded-2xl border border-[#0B1F3A]/10 shadow-lg dark:border-white/15",
      )}
    >
      {/* progress */}
      <div className="shrink-0 border-b border-[#0B1F3A]/8 px-5 pb-4 pt-5 dark:border-white/10">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[17px] font-semibold text-[#0f172a] dark:text-white">
            <span className="tabular-nums">{totals.pct}%</span> Completed
          </p>
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {totals.done}/{totals.total} lessons
          </span>
        </div>
        <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-[#0B1F3A]/10 dark:bg-white/10">
          <div className="h-full rounded-full bg-success transition-all duration-700 ease-out" style={{ width: `${totals.pct}%` }} />
        </div>
      </div>

      {/* sections */}
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2",
          !isPanel && "max-h-[min(70vh,calc(100vh-8rem))] lg:max-h-[calc(100vh-7rem)]",
        )}
      >
        {groups.map(({ section, lessons }) => {
          const isOpen = open[section.id] ?? false;
          const doneCount = lessons.filter((l) => isDone(progressByLesson.get(l.id))).length;
          const secs = lessons.reduce((a, l) => a + lessonSeconds(l), 0);
          const hasActive = lessons.some((l) => l.id === activeLessonId);
          return (
            <div key={section.id} className="py-0.5">
              <button
                type="button"
                onClick={() => setOpen((p) => ({ ...p, [section.id]: !isOpen }))}
                aria-expanded={isOpen}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                  "hover:bg-[#0B1F3A]/[0.05] dark:hover:bg-white/5",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
                )}
              >
                <SectionStatus done={doneCount} total={lessons.length} />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-[15px] leading-snug text-[#0f172a] dark:text-white",
                      hasActive || isOpen ? "font-semibold" : "font-medium",
                    )}
                    title={section.title}
                  >
                    {section.title}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] tabular-nums text-muted-foreground">
                    {doneCount}/{lessons.length} {lessons.length === 1 ? "lesson" : "lessons"}
                    {secs ? ` · ${clock(secs).replace(" mins", "")}` : ""}
                  </span>
                </span>
                <ChevronDown
                  className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", !isOpen && "-rotate-90")}
                  aria-hidden
                />
              </button>

              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <div className="min-h-0 overflow-hidden">
                  <ul className="mb-2 ml-[21px] border-l-2 border-[#0B1F3A]/10 pl-3 dark:border-white/10">
                    {lessons.map((lesson) => {
                      const isActive = lesson.id === activeLessonId;
                      const done = isDone(progressByLesson.get(lesson.id));
                      const dur = clock(lessonSeconds(lesson));
                      const kind = lesson.video_provider || lesson.has_vdocipher || lesson.video_url ? "Video" : "Lesson";
                      return (
                        <li key={lesson.id}>
                          <button
                            ref={isActive ? activeRef : undefined}
                            type="button"
                            onClick={() => onSelectLesson(lesson.id)}
                            aria-current={isActive ? "true" : undefined}
                            className={cn(
                              "group flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-all",
                              isActive
                                ? "bg-brand/[0.08] ring-1 ring-brand/30 dark:bg-brand/15"
                                : "hover:bg-[#0B1F3A]/[0.05] dark:hover:bg-white/5",
                            )}
                          >
                            <span className="mt-0.5" aria-hidden>
                              {done ? (
                                <DoneIcon className="h-[22px] w-[22px]" />
                              ) : isActive ? (
                                <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand text-white">
                                  <Play className="ml-0.5 h-3 w-3 fill-current" />
                                </span>
                              ) : (
                                <Circle className="h-[22px] w-[22px] text-[#0B1F3A]/35 dark:text-white/35" strokeWidth={2} />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span
                                className={cn(
                                  "line-clamp-2 text-[14.5px] leading-snug",
                                  isActive ? "font-semibold text-[#0f172a] dark:text-white" : "text-[#1e293b] dark:text-white/85",
                                )}
                              >
                                {polishLessonTitle(lesson.title)}
                              </span>
                              <span className="mt-1 block text-[12px] tabular-nums text-muted-foreground">
                                {kind}
                                {dur ? ` - ${dur}` : ""}
                                {done ? <span className="ml-1.5 font-medium text-success">· Completed</span> : null}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
