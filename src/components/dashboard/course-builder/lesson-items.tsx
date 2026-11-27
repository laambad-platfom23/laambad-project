"use client";

import { createContext, useContext, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BrainCircuit, ClipboardList, ExternalLink, FolderOpen, Loader2, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  assignmentApi,
  courseItemsApi,
  resourceApi,
  staffQuizApi,
  type BuilderAssignment,
  type BuilderItems,
  type BuilderQuiz,
  type BuilderResource,
  type ResourceFile,
} from "@/services/api/course-items";
import { FileBadge, fmtSize, openResource } from "@/components/learning/item-ui";
import { mergeByOrder } from "@/components/learning/learn-panels";
import { QuizEditorDialog } from "@/components/dashboard/course-builder/quiz-editor-dialog";
import { AssignmentEditorDialog } from "@/components/dashboard/course-builder/assignment-editor-dialog";
import { ResourceDialog } from "@/components/dashboard/course-builder/resource-dialog";
import { cn, getApiErrorMessage } from "@/lib/utils";

export type LessonOption = { id: string; title: string; sectionTitle: string };

type DialogState =
  | { kind: "quiz"; id: string | null; lessonId: string | null }
  | { kind: "assignment"; id: string | null; lessonId: string | null }
  | { kind: "resource"; resource: BuilderResource | null; lessonId: string | null }
  | null;

type Ctx = {
  courseId: string;
  items: BuilderItems | undefined;
  loading: boolean;
  lessonOptions: LessonOption[];
  open: (d: DialogState) => void;
  refresh: () => void;
};
const BuilderCtx = createContext<Ctx | null>(null);

function useBuilder() {
  const c = useContext(BuilderCtx);
  if (!c) throw new Error("BuilderItemsProvider missing");
  return c;
}

/** Loads the course's quizzes / assignments / resources once and owns the three editor dialogs. */
export function BuilderItemsProvider({
  courseId,
  lessonOptions,
  children,
}: {
  courseId: string;
  lessonOptions: LessonOption[];
  children: React.ReactNode;
}) {
  const qc = useQueryClient();
  const { data: items, isLoading } = useQuery({
    queryKey: ["builder-items", courseId],
    queryFn: () => courseItemsApi.builder(courseId).then((r) => r.data),
    enabled: !!courseId,
  });
  const [dlg, setDlg] = useState<DialogState>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["builder-items", courseId] });
    qc.invalidateQueries({ queryKey: ["learning-items", courseId] });
    qc.invalidateQueries({ queryKey: ["courses"] });
  };
  const close = (o: boolean) => {
    if (!o) setDlg(null);
  };
  return (
    <BuilderCtx.Provider value={{ courseId, items, loading: isLoading, lessonOptions, open: setDlg, refresh }}>
      {children}
      <QuizEditorDialog
        open={dlg?.kind === "quiz"}
        onOpenChange={close}
        courseId={courseId}
        quizId={dlg?.kind === "quiz" ? dlg.id : null}
        lessonId={dlg?.kind === "quiz" ? dlg.lessonId : null}
        lessonOptions={lessonOptions}
        onSaved={refresh}
      />
      <AssignmentEditorDialog
        open={dlg?.kind === "assignment"}
        onOpenChange={close}
        courseId={courseId}
        assignmentId={dlg?.kind === "assignment" ? dlg.id : null}
        lessonId={dlg?.kind === "assignment" ? dlg.lessonId : null}
        lessonOptions={lessonOptions}
        onSaved={refresh}
      />
      <ResourceDialog
        open={dlg?.kind === "resource"}
        onOpenChange={close}
        courseId={courseId}
        lessonId={dlg?.kind === "resource" ? dlg.lessonId : null}
        resource={dlg?.kind === "resource" ? dlg.resource : null}
        lessonOptions={lessonOptions}
        onSaved={refresh}
      />
    </BuilderCtx.Provider>
  );
}

// ───────────────────────── rows ─────────────────────────

function useRemove() {
  const { refresh } = useBuilder();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (id: string, confirmText: string, call: () => Promise<unknown>, done: string) => {
    if (!window.confirm(confirmText)) return;
    setBusy(id);
    try {
      await call();
      toast.success(done);
      refresh();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not delete"));
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

function Row({
  icon,
  tone,
  title,
  meta,
  badges,
  actions,
}: {
  icon: React.ReactNode;
  tone: "quiz" | "assignment" | "file";
  title: string;
  meta?: React.ReactNode;
  badges?: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          tone === "quiz" && "bg-brand-soft text-brand",
          tone === "assignment" && "bg-[#0B1F3A]/10 text-[#0B1F3A] dark:bg-white/10 dark:text-white"
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{title}</span>
          {badges}
        </span>
        {meta ? <span className="block truncate text-xs text-muted-foreground">{meta}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-0.5">{actions}</span>
    </li>
  );
}

const Draft = () => <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold uppercase text-muted-foreground">Draft</span>;
const OldSite = () => <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold uppercase text-muted-foreground">Old site</span>;

function QuizRowB({ q }: { q: BuilderQuiz }) {
  const { open } = useBuilder();
  const { busy, run } = useRemove();
  return (
    <Row
      tone="quiz"
      icon={<BrainCircuit className="h-4 w-4" />}
      title={q.title}
      badges={!q.published ? <Draft /> : null}
      meta={`Quiz · ${q.question_count} questions · pass ${q.pass_percent}%${q.time_limit_secs ? ` · ${Math.round(q.time_limit_secs / 60)} min` : ""}${q.attempt_count ? ` · ${q.attempt_count} attempts` : ""}`}
      actions={
        <>
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => open({ kind: "quiz", id: q.id, lessonId: q.lesson_id })}>
            <Pencil className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Edit</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            disabled={busy === q.id}
            onClick={() =>
              run(
                q.id,
                q.attempt_count
                  ? `Delete “${q.title}”? Students took it ${q.attempt_count} times — their attempts are kept but the quiz disappears.`
                  : `Delete “${q.title}”?`,
                () => staffQuizApi.remove(q.id),
                "Quiz deleted"
              )
            }
            aria-label="Delete quiz"
          >
            {busy === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        </>
      }
    />
  );
}

function AssignmentRowB({ a }: { a: BuilderAssignment }) {
  const { open } = useBuilder();
  const { busy, run } = useRemove();
  return (
    <Row
      tone="assignment"
      icon={<ClipboardList className="h-4 w-4" />}
      title={a.title}
      badges={
        <>
          {!a.published ? <Draft /> : null}
          {a.ungraded_count ? (
            <span className="rounded-full bg-warning-soft px-1.5 py-px text-[10px] font-semibold text-warning">{a.ungraded_count} to grade</span>
          ) : null}
        </>
      }
      meta={`Assignment · ${a.max_points} points${a.pass_points != null ? ` · pass ${a.pass_points}` : ""}${a.due_at ? ` · due ${new Date(a.due_at).toLocaleDateString()}` : ""}${a.file_count ? ` · ${a.file_count} file${a.file_count === 1 ? "" : "s"}` : ""}`}
      actions={
        <>
          {a.submission_count ? (
            <Button asChild variant="ghost" size="sm" className="h-8 px-2">
              <Link href={`/dashboard/assignments?assignment=${a.id}`}>
                <Users className="h-3.5 w-3.5" /> {a.submission_count}
              </Link>
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => open({ kind: "assignment", id: a.id, lessonId: a.lesson_id })}>
            <Pencil className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Edit</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            disabled={busy === a.id}
            onClick={() =>
              run(
                a.id,
                a.submission_count
                  ? `Delete “${a.title}”? ${a.submission_count} students submitted it — their answers are kept but the assignment disappears.`
                  : `Delete “${a.title}”?`,
                () => assignmentApi.remove(a.id),
                "Assignment deleted"
              )
            }
            aria-label="Delete assignment"
          >
            {busy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        </>
      }
    />
  );
}

function ResourceRowB({ r }: { r: BuilderResource }) {
  const { open } = useBuilder();
  const { busy, run } = useRemove();
  return (
    <Row
      tone="file"
      icon={r.kind === "link" ? <ExternalLink className="h-4 w-4" /> : <FileBadge mime={r.mime} name={r.file_name || r.title} className="h-8 w-8 text-[9px]" />}
      title={r.title}
      meta={r.kind === "link" ? r.url.replace(/^https?:\/\//i, "") : `${r.file_name ?? "File"}${r.size ? ` · ${fmtSize(r.size)}` : ""}`}
      actions={
        <>
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" aria-label="Open">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => open({ kind: "resource", resource: r, lessonId: r.lesson_id })} aria-label="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            disabled={busy === r.id}
            onClick={() => run(r.id, `Remove “${r.title}”?`, () => resourceApi.remove(r.id), "Resource removed")}
            aria-label="Remove resource"
          >
            {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        </>
      }
    />
  );
}

function LegacyFileRowB({ f }: { f: ResourceFile }) {
  return (
    <Row
      tone="file"
      icon={<FileBadge mime={f.mime} name={f.name} className="h-8 w-8 text-[9px]" />}
      title={f.name}
      badges={<OldSite />}
      meta={f.size ? fmtSize(f.size) : "File from the old site"}
      actions={
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => openResource(f.download)} aria-label="Open">
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      }
    />
  );
}

// ───────────────────────── blocks used by the curriculum editor ─────────────────────────

/** Under a lesson: its quizzes, assignments and resources + the three "add" buttons. */
export function LessonItems({ lessonId }: { lessonId: string }) {
  const { items, open } = useBuilder();
  const quizzes = items?.quizzes.filter((q) => q.lesson_id === lessonId) ?? [];
  const assignments = items?.assignments.filter((a) => a.lesson_id === lessonId) ?? [];
  const resources = items?.resources.filter((r) => r.lesson_id === lessonId) ?? [];
  const legacy = items?.legacy_resources.lessons.find((l) => l.lesson_id === lessonId)?.files ?? [];
  const any = quizzes.length + assignments.length + resources.length + legacy.length > 0;
  return (
    <div className="space-y-2 pl-1 sm:pl-10">
      {any ? (
        <ul className="space-y-1.5">
          <ItemList quizzes={quizzes} assignments={assignments} />
          {resources.map((r) => (
            <ResourceRowB key={r.id} r={r} />
          ))}
          {legacy.map((f) => (
            <LegacyFileRowB key={f.id} f={f} />
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" variant="outline" size="sm" className="h-8 border-dashed" onClick={() => open({ kind: "quiz", id: null, lessonId })}>
          <Plus className="h-3.5 w-3.5" /> Quiz
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8 border-dashed" onClick={() => open({ kind: "assignment", id: null, lessonId })}>
          <Plus className="h-3.5 w-3.5" /> Assignment
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8 border-dashed" onClick={() => open({ kind: "resource", resource: null, lessonId })}>
          <Plus className="h-3.5 w-3.5" /> Resource
        </Button>
      </div>
    </div>
  );
}

/** Old-site quizzes / assignments that sit at the top of a topic (not under a lesson). */
export function TopicItems({ sectionId }: { sectionId: string }) {
  const { items } = useBuilder();
  const quizzes = items?.quizzes.filter((q) => q.placed && q.section_id === sectionId && !q.lesson_id) ?? [];
  const assignments = items?.assignments.filter((a) => a.placed && a.section_id === sectionId && !a.lesson_id) ?? [];
  if (!quizzes.length && !assignments.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In this topic</p>
      <ul className="space-y-1.5">
        <ItemList quizzes={quizzes} assignments={assignments} />
      </ul>
    </div>
  );
}

/** Quizzes and assignments in their shared order (the order students see). */
function ItemList({ quizzes, assignments }: { quizzes: BuilderQuiz[]; assignments: BuilderAssignment[] }) {
  return (
    <>
      {mergeByOrder(quizzes, assignments).map((x) =>
        x.kind === "quiz" ? <QuizRowB key={x.item.id} q={x.item} /> : <AssignmentRowB key={x.item.id} a={x.item} />
      )}
    </>
  );
}

/** Items whose topic is gone (or never existed): students do not see them until they get a lesson. */
export function UnplacedItems() {
  const { items } = useBuilder();
  const [open, setOpen] = useState(false);
  const quizzes = items?.quizzes.filter((q) => !q.placed) ?? [];
  const assignments = items?.assignments.filter((a) => !a.placed) ?? [];
  if (!quizzes.length && !assignments.length) return null;
  return (
    <div className="space-y-2 rounded-xl border border-warning/40 bg-warning-soft/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 text-warning" /> Not in the curriculum ({quizzes.length + assignments.length})
        </p>
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Show"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Students do not see these. They were in topics that no longer exist (several come from deleted copies of courses on the old site). Edit one
        and choose a lesson to show it, or delete it.
      </p>
      {open ? (
        <ul className="space-y-1.5">
          <ItemList quizzes={quizzes} assignments={assignments} />
        </ul>
      ) : null}
    </div>
  );
}

/** Course materials: resources for the whole course (not tied to a lesson). */
export function CourseMaterials() {
  const { items, open, loading } = useBuilder();
  const resources = items?.resources.filter((r) => !r.lesson_id) ?? [];
  const legacy = items?.legacy_resources.course ?? [];
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <FolderOpen className="h-4 w-4 text-brand" /> Course materials
          <span className="font-normal text-muted-foreground">· for the whole course</span>
        </p>
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => open({ kind: "resource", resource: null, lessonId: null })}>
          <Plus className="h-3.5 w-3.5" /> Resource
        </Button>
      </div>
      {loading ? <p className="text-xs text-muted-foreground">Loading…</p> : null}
      {resources.length || legacy.length ? (
        <ul className="space-y-1.5">
          {resources.map((r) => (
            <ResourceRowB key={r.id} r={r} />
          ))}
          {legacy.map((f) => (
            <LegacyFileRowB key={f.id} f={f} />
          ))}
        </ul>
      ) : !loading ? (
        <p className="text-xs text-muted-foreground">No course-wide files yet (syllabus, reading list, data sets…).</p>
      ) : null}
    </div>
  );
}
