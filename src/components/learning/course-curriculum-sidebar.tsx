"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Award, BrainCircuit, Check, ChevronDown, Circle, ClipboardList, Lock, Paperclip, Play } from "lucide-react";
import type { Course, Lesson, Section } from "@/types";
import type { LearnAssignment, LearnQuiz } from "@/services/api/course-items";
import { mergeByOrder, type ItemMaps } from "@/components/learning/learn-panels";
import { cn } from "@/lib/utils";

export type SectionGroup = { section: Section; lessons: Lesson[] };

/**
 * Topics in order with their lessons. A topic without lessons is kept when `keep` says it has other
 * items (A6: e.g. a "Final exam" topic that only holds a quiz) — before, such quizzes never showed.
 */
export function buildSectionGroups(course: Course | undefined, keep?: (sectionId: string) => boolean): SectionGroup[] {
  if (!course?.sections?.length) return [];
  const sections = [...course.sections].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const out: SectionGroup[] = [];
  for (const sec of sections) {
    const lessons = [...(sec.lessons ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (lessons.length || keep?.(sec.id)) out.push({ section: sec, lessons });
  }
  return out;
}

type ProgressEntry = { completed: boolean; percent: number };

export type ActiveItem = { kind: "quiz" | "assignment"; id: string } | null;

type Props = {
  groups: SectionGroup[];
  activeLessonId: string | null;
  progressByLesson: Map<string, ProgressEntry>;
  polishLessonTitle: (t: string) => string;
  formatDuration: (min?: number) => string;
  onSelectLesson: (id: string) => void;
  /** `panel` = edge-to-edge LMS column (full height, no outer radius on large screens). */
  variant?: "embedded" | "panel";
  /** A6: quizzes / assignments / resources under their lesson (and topic-level ones) */
  maps?: ItemMaps;
  activeItem?: ActiveItem;
  onOpenQuiz?: (id: string) => void;
  onOpenAssignment?: (id: string) => void;
  /** shown under the list (the "More" menu) */
  footer?: React.ReactNode;
};

/** A quiz / assignment of the topic: a row like a lesson (after its lesson, or at the end of the topic). */
function ItemRow({
  kind,
  item,
  active,
  onOpen,
}: {
  kind: "quiz" | "assignment";
  item: LearnQuiz | LearnAssignment;
  active: boolean;
  onOpen: () => void;
}) {
  const done = kind === "quiz" ? (item as LearnQuiz).passed : (item as LearnAssignment).status !== "not_submitted";
  const Icon = kind === "quiz" ? BrainCircuit : ClipboardList;
  let meta: string;
  if (kind === "quiz") {
    const q = item as LearnQuiz;
    meta = q.best_percent !== null ? `Quiz · best ${Math.round(q.best_percent)}%${q.passed ? " · passed" : ""}` : `Quiz · ${q.question_count} questions`;
  } else {
    const a = item as LearnAssignment;
    meta =
      a.status === "graded"
        ? `Assignment · ${a.grade} / ${a.max_points}`
        : a.status === "submitted"
          ? "Assignment · submitted"
          : `Assignment · ${a.max_points} points`;
  }
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        className={cn(
          "group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all",
          active ? "bg-brand/[0.08] ring-1 ring-brand/30 dark:bg-brand/15" : "hover:bg-[#0B1F3A]/[0.05] dark:hover:bg-white/5",
          item.locked && "opacity-60",
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md",
            done ? "bg-success text-white" : kind === "quiz" ? "bg-brand-soft text-brand" : "bg-[#0B1F3A]/10 text-[#0B1F3A] dark:bg-white/10 dark:text-white",
          )}
          aria-hidden
        >
          {item.locked ? <Lock className="h-3 w-3" /> : done ? (kind === "quiz" ? <Award className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" strokeWidth={3} />) : <Icon className="h-3.5 w-3.5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("line-clamp-2 text-[14.5px] leading-snug", active ? "font-semibold text-[#0f172a] dark:text-white" : "text-[#1e293b] dark:text-white/85")}>
            {item.title}
          </span>
          <span className="mt-1 block text-[12px] text-muted-foreground">{meta}</span>
        </span>
      </button>
    </li>
  );
}

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
  maps,
  activeItem = null,
  onOpenQuiz,
  onOpenAssignment,
  footer,
}: Props) {
  const activeSectionId = useMemo(() => {
    if (activeItem && maps) {
      // an open quiz / assignment keeps its topic open
      for (const [sid, v] of maps.bySection) {
        if ([...v.quizzes, ...v.assignments].some((x) => x.id === activeItem.id)) return sid;
      }
      for (const g of groups) {
        for (const l of g.lessons) {
          const e = maps.byLesson.get(l.id);
          if (e && [...e.quizzes, ...e.assignments].some((x) => x.id === activeItem.id)) return g.section.id;
        }
      }
    }
    for (const g of groups) {
      if (g.lessons.some((l) => l.id === activeLessonId)) return g.section.id;
    }
    return null;
  }, [groups, activeLessonId, activeItem, maps]);

  const openItem = (kind: "quiz" | "assignment", id: string) => (kind === "quiz" ? onOpenQuiz?.(id) : onOpenAssignment?.(id));
  // quizzes and assignments of one lesson share one order (as on the old site)
  const itemRows = (quizzes: LearnQuiz[], assignments: LearnAssignment[]) =>
    mergeByOrder(quizzes, assignments).map((x) => (
      <ItemRow
        key={x.item.id}
        kind={x.kind}
        item={x.item}
        active={activeItem?.id === x.item.id}
        onOpen={() => openItem(x.kind, x.item.id)}
      />
    ));

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
                    {lessons.length ? (
                      <>
                        {doneCount}/{lessons.length} {lessons.length === 1 ? "lesson" : "lessons"}
                        {secs ? ` · ${clock(secs).replace(" mins", "")}` : ""}
                      </>
                    ) : (
                      (() => {
                        const t = maps?.bySection.get(section.id);
                        const n = (t?.quizzes.length ?? 0) + (t?.assignments.length ?? 0);
                        return `${n} ${t?.quizzes.length && !t.assignments.length ? (n === 1 ? "quiz" : "quizzes") : n === 1 ? "activity" : "activities"}`;
                      })()
                    )}
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
                      const isActive = lesson.id === activeLessonId && !activeItem;
                      const done = isDone(progressByLesson.get(lesson.id));
                      const dur = clock(lessonSeconds(lesson));
                      const kind = lesson.video_provider || lesson.has_vdocipher || lesson.video_url ? "Video" : "Lesson";
                      const extras = maps?.byLesson.get(lesson.id);
                      const fileCount = (extras?.files.length ?? 0) + (extras?.links.length ?? 0);
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
                              ) : lesson.locked ? (
                                <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#0B1F3A]/10 text-[#0B1F3A]/60 dark:bg-white/10 dark:text-white/60" title="Complete the previous lesson first">
                                  <Lock className="h-3 w-3" />
                                </span>
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
                                {fileCount ? (
                                  <span className="ml-1.5 inline-flex items-center gap-0.5" title="Resources in this lesson">
                                    · <Paperclip className="h-3 w-3" />
                                    {fileCount}
                                  </span>
                                ) : null}
                                {done ? <span className="ml-1.5 font-medium text-success">· Completed</span> : null}
                              </span>
                            </span>
                          </button>
                          {/* Phase 2: the topic's quizzes / assignments placed after this lesson — rows of the topic, not under the lesson */}
                          {extras && (extras.quizzes.length || extras.assignments.length) ? <ul>{itemRows(extras.quizzes, extras.assignments)}</ul> : null}
                        </li>
                      );
                    })}
                    {/* the end of the topic */}
                    {maps?.bySection.get(section.id)
                      ? itemRows(maps.bySection.get(section.id)!.quizzes, maps.bySection.get(section.id)!.assignments)
                      : null}
                  </ul>
                </div>
              </div>
            </div>
          );
        })}
        {maps && (maps.loose.quizzes.length || maps.loose.assignments.length) ? (
          <div className="px-1 py-2">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">More activities</p>
            <ul>{itemRows(maps.loose.quizzes, maps.loose.assignments)}</ul>
          </div>
        ) : null}
      </div>
      {footer ? <div className="shrink-0 border-t border-[#0B1F3A]/8 p-2 dark:border-white/10">{footer}</div> : null}
    </div>
  );
}
