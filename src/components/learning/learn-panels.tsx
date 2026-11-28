"use client";

import { CertificateChecklist } from "@/components/learning/certificate-checklist";
import { useMemo } from "react";
import { Award, BrainCircuit, CheckCircle2, ChevronRight, CircleDashed, ClipboardList, Clock, FileText, FolderOpen, HelpCircle, Lock, Paperclip } from "lucide-react";
import { CourseDescriptionBlocks } from "@/components/courses/course-description-blocks";
import { htmlToBlocks, looksLikeHtml } from "@/lib/wp-content";
import type { LearningItems, LearnAssignment, LearnQuiz, ResourceFile, ResourceLink } from "@/services/api/course-items";
import type { Lesson } from "@/types";
import { AssignmentStatusChip, ResourceFileRow, ResourceLinkRow, dueLabel } from "@/components/learning/item-ui";
import { cn } from "@/lib/utils";

export type LessonExtras = { quizzes: LearnQuiz[]; assignments: LearnAssignment[]; files: ResourceFile[]; links: ResourceLink[] };
export type ItemMaps = {
  byLesson: Map<string, LessonExtras>;
  /** topic-level quizzes / assignments (no lesson), shown at the top of the topic */
  bySection: Map<string, { quizzes: LearnQuiz[]; assignments: LearnAssignment[] }>;
  /** quizzes without any topic (listed at the end) */
  loose: { quizzes: LearnQuiz[]; assignments: LearnAssignment[] };
};

const EMPTY: LessonExtras = { quizzes: [], assignments: [], files: [], links: [] };

export function useItemMaps(items: LearningItems | undefined): ItemMaps {
  return useMemo(() => {
    const byLesson = new Map<string, LessonExtras>();
    const bySection = new Map<string, { quizzes: LearnQuiz[]; assignments: LearnAssignment[] }>();
    const loose = { quizzes: [] as LearnQuiz[], assignments: [] as LearnAssignment[] };
    const lessonEntry = (id: string) => {
      let e = byLesson.get(id);
      if (!e) byLesson.set(id, (e = { quizzes: [], assignments: [], files: [], links: [] }));
      return e;
    };
    const sectionEntry = (id: string) => {
      let e = bySection.get(id);
      if (!e) bySection.set(id, (e = { quizzes: [], assignments: [] }));
      return e;
    };
    for (const q of items?.quizzes ?? []) {
      if (q.lesson_id) lessonEntry(q.lesson_id).quizzes.push(q);
      else if (q.section_id) sectionEntry(q.section_id).quizzes.push(q);
      else loose.quizzes.push(q);
    }
    for (const a of items?.assignments ?? []) {
      if (a.lesson_id) lessonEntry(a.lesson_id).assignments.push(a);
      else if (a.section_id) sectionEntry(a.section_id).assignments.push(a);
      else loose.assignments.push(a);
    }
    for (const l of items?.resources.lessons ?? []) {
      const e = lessonEntry(l.lesson_id);
      e.files.push(...l.files);
      e.links.push(...l.links);
    }
    return { byLesson, bySection, loose };
  }, [items]);
}

export function extrasOf(maps: ItemMaps, lessonId: string | null | undefined): LessonExtras {
  return (lessonId && maps.byLesson.get(lessonId)) || EMPTY;
}

/** Quizzes and assignments of one lesson in their shared order (like Tutor's menu_order); stable. */
export function mergeByOrder<Q extends { sort_order?: number }, A extends { sort_order?: number }>(quizzes: Q[], assignments: A[]) {
  const all = [
    ...quizzes.map((item, i) => ({ kind: "quiz" as const, item, i })),
    ...assignments.map((item, i) => ({ kind: "assignment" as const, item, i: quizzes.length + i })),
  ];
  return all.sort((a, b) => (a.item.sort_order ?? 0) - (b.item.sort_order ?? 0) || a.i - b.i) as (
    | { kind: "quiz"; item: Q; i: number }
    | { kind: "assignment"; item: A; i: number }
  )[];
}

// ───────────────────────── rows ─────────────────────────

export function QuizItemRow({ q, onOpen, showPlace }: { q: LearnQuiz; onOpen: () => void; showPlace?: boolean }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/50", q.locked && "opacity-70")}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          {q.locked ? <Lock className="h-4 w-4" /> : <BrainCircuit className="h-[18px] w-[18px]" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{q.title}</span>
          <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {showPlace && (q.lesson_title || q.section_title) ? <span className="truncate">{q.lesson_title ?? q.section_title} ·</span> : null}
            <span>{q.question_count} questions</span>
            <span>· pass {q.pass_percent}%</span>
            {q.time_limit_secs ? (
              <span className="inline-flex items-center gap-0.5">
                · <Clock className="h-3 w-3" /> {Math.round(q.time_limit_secs / 60)} min
              </span>
            ) : null}
          </span>
        </span>
        {q.locked ? (
          <span className="text-xs text-muted-foreground">Locked</span>
        ) : q.best_percent !== null ? (
          <span className={cn("inline-flex items-center gap-1 text-sm font-semibold tabular-nums", q.passed ? "text-success" : "text-muted-foreground")}>
            {q.passed ? <Award className="h-4 w-4" /> : null}
            {Math.round(q.best_percent)}%
          </span>
        ) : (
          <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-white">Start</span>
        )}
      </button>
    </li>
  );
}

export function AssignmentItemRow({ a, onOpen, showPlace }: { a: LearnAssignment; onOpen: () => void; showPlace?: boolean }) {
  const due = dueLabel(a.due_at);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/50", a.locked && "opacity-70")}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0B1F3A]/8 text-[#0B1F3A] dark:bg-white/10 dark:text-white">
          {a.locked ? <Lock className="h-4 w-4" /> : <ClipboardList className="h-[18px] w-[18px]" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{a.title}</span>
          <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {showPlace && (a.lesson_title || a.section_title) ? <span className="truncate">{a.lesson_title ?? a.section_title} ·</span> : null}
            <span>{a.max_points} points</span>
            {due ? <span className={cn(due.past && a.status === "not_submitted" && "font-medium text-destructive")}>· due {due.text}</span> : null}
          </span>
        </span>
        {a.locked ? (
          <span className="text-xs text-muted-foreground">Locked</span>
        ) : (
          <AssignmentStatusChip status={a.status} grade={a.grade} max={a.max_points} passed={a.passed} />
        )}
      </button>
    </li>
  );
}

function Empty({ icon: Icon, title, text }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed px-6 py-10 text-center">
      <Icon className="mx-auto h-9 w-9 text-muted-foreground/50" />
      <p className="mt-2 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function groupBySection<T extends { section_id: string | null; section_title: string | null }>(list: T[]) {
  const out: { key: string; title: string; items: T[] }[] = [];
  for (const it of list) {
    const key = it.section_id ?? "__none__";
    let g = out.find((x) => x.key === key);
    if (!g) out.push((g = { key, title: it.section_title ?? "More", items: [] }));
    g.items.push(it);
  }
  return out;
}

// ───────────────────────── panels ─────────────────────────

/** "Overview": the lesson's notes and text, then everything that belongs to this lesson. */
export function OverviewPanel({
  lesson,
  extras,
  onOpenQuiz,
  onOpenAssignment,
}: {
  lesson: Lesson;
  extras: LessonExtras;
  onOpenQuiz: (id: string) => void;
  onOpenAssignment: (id: string) => void;
}) {
  const blocks = useMemo(() => (looksLikeHtml(lesson.content) ? htmlToBlocks(lesson.content!) : null), [lesson.content]);
  const plainContent = !blocks && lesson.content?.trim() ? lesson.content.trim() : null;
  const hasItems = extras.quizzes.length + extras.assignments.length + extras.files.length + extras.links.length > 0;
  return (
    <div className="space-y-4">
      {lesson.description ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{lesson.description}</p> : null}
      {blocks?.length ? <CourseDescriptionBlocks blocks={blocks} /> : plainContent ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{plainContent}</p> : null}
      {!lesson.description && !blocks?.length && !plainContent && !hasItems ? (
        <p className="text-sm text-muted-foreground">No notes for this lesson.</p>
      ) : null}
      {hasItems ? (
        <div className="overflow-hidden rounded-xl border">
          <p className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">In this lesson</p>
          <ul className="divide-y">
            {mergeByOrder(extras.quizzes, extras.assignments).map((x) =>
              x.kind === "quiz" ? (
                <QuizItemRow key={x.item.id} q={x.item} onOpen={() => onOpenQuiz(x.item.id)} />
              ) : (
                <AssignmentItemRow key={x.item.id} a={x.item} onOpen={() => onOpenAssignment(x.item.id)} />
              )
            )}
            {extras.files.map((f) => (
              <ResourceFileRow key={f.id} f={f} />
            ))}
            {extras.links.map((l, i) => (
              <ResourceLinkRow key={`${l.id ?? l.url}-${i}`} l={l} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function QuizzesPanel({ items, onOpen }: { items: LearningItems | undefined; onOpen: (id: string) => void }) {
  const list = items?.quizzes ?? [];
  if (!list.length) return <Empty icon={BrainCircuit} title="No quizzes in this course" text="When your instructor adds a quiz, it shows here and under its lesson." />;
  const passed = list.filter((q) => q.passed).length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {list.length} {list.length === 1 ? "quiz" : "quizzes"} · <span className="font-semibold text-success">{passed} passed</span>
      </p>
      {groupBySection(list).map((g) => (
        <div key={g.key} className="overflow-hidden rounded-xl border bg-card">
          <p className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</p>
          <ul className="divide-y">
            {g.items.map((q) => (
              <QuizItemRow key={q.id} q={q} onOpen={() => onOpen(q.id)} showPlace />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function AssignmentsPanel({ items, onOpen }: { items: LearningItems | undefined; onOpen: (id: string) => void }) {
  const list = items?.assignments ?? [];
  if (!list.length) {
    return <Empty icon={ClipboardList} title="No assignments in this course" text="When your instructor adds an assignment, it shows here and under its lesson." />;
  }
  const todo = list.filter((a) => a.status === "not_submitted").length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {list.length} {list.length === 1 ? "assignment" : "assignments"}
        {todo ? <span className="font-semibold text-brand"> · {todo} to do</span> : <span className="font-semibold text-success"> · all submitted</span>}
      </p>
      {groupBySection(list).map((g) => (
        <div key={g.key} className="overflow-hidden rounded-xl border bg-card">
          <p className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</p>
          <ul className="divide-y">
            {g.items.map((a) => (
              <AssignmentItemRow key={a.id} a={a} onOpen={() => onOpen(a.id)} showPlace />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function ResourcesPanel({ items, activeLessonId, onSelectLesson }: { items: LearningItems | undefined; activeLessonId: string | null; onSelectLesson?: (id: string) => void }) {
  const r = items?.resources;
  if (!r || r.total === 0) {
    return <Empty icon={FolderOpen} title="No resources yet" text="Files and links for this course (slides, PDFs, data files…) show here." />;
  }
  // the lesson being watched first, then the course materials, then every other lesson in order
  const current = r.lessons.find((l) => l.lesson_id === activeLessonId);
  const others = r.lessons.filter((l) => l.lesson_id !== activeLessonId);
  return (
    <div className="space-y-3">
      {current ? (
        <div className="overflow-hidden rounded-xl border border-brand/40 bg-card">
          <p className="flex items-center gap-2 border-b bg-brand-soft px-4 py-2 text-xs font-semibold uppercase tracking-wide text-brand">
            <FileText className="h-3.5 w-3.5" /> This lesson · {current.lesson_title}
          </p>
          <ul className="divide-y">
            {current.files.map((f) => (
              <ResourceFileRow key={f.id} f={f} />
            ))}
            {current.links.map((l, i) => (
              <ResourceLinkRow key={`${l.id ?? l.url}-${i}`} l={l} />
            ))}
          </ul>
        </div>
      ) : null}
      {r.course.length || r.course_links.length ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <p className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <FolderOpen className="h-3.5 w-3.5" /> Course materials
          </p>
          <ul className="divide-y">
            {r.course.map((f) => (
              <ResourceFileRow key={f.id} f={f} />
            ))}
            {r.course_links.map((l, i) => (
              <ResourceLinkRow key={`${l.id ?? l.url}-${i}`} l={l} />
            ))}
          </ul>
        </div>
      ) : null}
      {others.map((l) => (
        <div key={l.lesson_id} className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2">
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground" title={l.lesson_title}>
              {l.lesson_title}
            </p>
            {onSelectLesson ? (
              <button type="button" onClick={() => onSelectLesson(l.lesson_id)} className="inline-flex shrink-0 items-center text-xs font-semibold text-brand hover:underline">
                Go to lesson <ChevronRight className="h-3 w-3" />
              </button>
            ) : null}
          </div>
          <ul className="divide-y">
            {l.files.map((f) => (
              <ResourceFileRow key={f.id} f={f} />
            ))}
            {l.links.map((x, i) => (
              <ResourceLinkRow key={`${x.id ?? x.url}-${i}`} l={x} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Gradebook: every quiz and assignment result of the course in one place. */
export function GradebookPanel({
  items,
  onOpenQuiz,
  onOpenAssignment,
  courseId,
}: {
  items: LearningItems | undefined;
  onOpenQuiz: (id: string) => void;
  onOpenAssignment: (id: string) => void;
  /** Phase 2: shows "Your certificate" (what is left) on top */
  courseId?: string;
}) {
  const quizzes = items?.quizzes ?? [];
  const assignments = items?.assignments ?? [];
  if (!quizzes.length && !assignments.length) {
    return (
      <div className="space-y-4">
        {courseId ? <CertificateChecklist courseId={courseId} /> : null}
        <Empty icon={Award} title="Nothing graded in this course" text="Quiz scores and assignment grades show here." />
      </div>
    );
  }
  const qPassed = quizzes.filter((q) => q.passed).length;
  const aGraded = assignments.filter((a) => a.status === "graded").length;
  return (
    <div className="space-y-4">
      {courseId ? <CertificateChecklist courseId={courseId} /> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Quizzes passed" value={`${qPassed} / ${quizzes.length}`} />
        <Stat label="Quizzes taken" value={`${quizzes.filter((q) => q.attempts_used > 0).length} / ${quizzes.length}`} />
        <Stat label="Assignments graded" value={`${aGraded} / ${assignments.length}`} />
        <Stat label="Assignments to do" value={String(assignments.filter((a) => a.status === "not_submitted").length)} />
      </div>
      {quizzes.length ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <p className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quizzes</p>
          <ul className="divide-y text-sm">
            {quizzes.map((q) => (
              <li key={q.id}>
                <button type="button" onClick={() => onOpenQuiz(q.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50">
                  {q.passed ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  ) : q.attempts_used ? (
                    <HelpCircle className="h-4 w-4 shrink-0 text-warning" />
                  ) : (
                    <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{q.title}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {q.best_percent !== null ? `${Math.round(q.best_percent)}%` : "—"}
                    <span className="ml-2 text-xs">({q.attempts_used} {q.attempts_used === 1 ? "attempt" : "attempts"})</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {assignments.length ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <p className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assignments</p>
          <ul className="divide-y text-sm">
            {assignments.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => onOpenAssignment(a.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50">
                  <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{a.title}</span>
                  <AssignmentStatusChip status={a.status} grade={a.grade} max={a.max_points} passed={a.passed} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
