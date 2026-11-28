"use client";

import { useEffect, useState, useRef, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { coursesApi } from "@/services/api/courses";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ListTree,
  Loader2,
  Plus,
  Trash2,
  Paperclip,
  Video,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lesson, Section } from "@/types";
import {
  attachmentsToRows,
  lessonSnapshot,
  parseLessonAttachments,
  rowsToPayload,
  type LessonFormRow,
} from "@/lib/lesson-form";
import {
  BuilderItemsProvider,
  CourseMaterials,
  AfterLessonItems,
  LessonItems,
  TopicItems,
  UnplacedItems,
  type LessonOption,
  type TopicOption,
} from "@/components/dashboard/course-builder/lesson-items";
import type { Course } from "@/types";
import { AssetUploadButton } from "@/components/dashboard/asset-upload-button";
import { useRegisterUnsaved } from "@/components/dashboard/course-builder/unsaved";

/** Phase 2: topics with their lessons, in order, for the "topic and position" picker. */
function topicOptionsOf(course: Course | undefined): TopicOption[] {
  return [...(course?.sections ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((s) => ({
      id: s.id,
      title: s.title,
      lessons: [...(s.lessons ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((l) => ({ id: l.id, title: l.title })),
    }));
}

/** Every lesson of the course, in order, for the "which lesson" pickers. */
function lessonOptionsOf(course: Course | undefined): LessonOption[] {
  return [...(course?.sections ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .flatMap((s) =>
      [...(s.lessons ?? [])]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((l) => ({ id: l.id, title: l.title, sectionTitle: s.title }))
    );
}

type Props = {
  courseId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Sections + lessons editor (existing data pre-filled, editable). Used inside the dialog and the Course Builder. */
export function CurriculumEditor({ courseId }: { courseId: string }) {
  return <CurriculumBody courseId={courseId} open />;
}

function CurriculumBody({ courseId, open }: { courseId: string | null; open: boolean }) {
  return <ManageCourseCurriculumInner courseId={courseId} open={open} onOpenChange={() => {}} bare />;
}

export function ManageCourseCurriculumDialog({ courseId, open, onOpenChange }: Props) {
  return <ManageCourseCurriculumInner courseId={courseId} open={open} onOpenChange={onOpenChange} />;
}

function ManageCourseCurriculumInner({ courseId, open, onOpenChange, bare = false }: Props & { bare?: boolean }) {
  const queryClient = useQueryClient();
  const enabled = Boolean(open && courseId);

  const { data: course, isLoading, isError } = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => coursesApi.get(courseId!).then((r) => r.data),
    enabled,
  });

  const toastedErr = useRef(false);
  useEffect(() => {
    if (isError && open) {
      if (!toastedErr.current) {
        toastedErr.current = true;
        toast.error("Failed to load course");
      }
    } else {
      toastedErr.current = false;
    }
  }, [isError, open]);

  const invalidate = () => {
    if (courseId) {
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
    }
    queryClient.invalidateQueries({ queryKey: ["courses"] });
  };

  const addSectionMutation = useMutation({
    mutationFn: async () => {
      if (!courseId || !course) throw new Error("missing");
      const n = course.sections?.length ?? 0;
      await coursesApi.addSection(courseId, { title: "New section", sort_order: n });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Section added");
    },
    onError: () => toast.error("Could not add section"),
  });

  const lessonOptions = lessonOptionsOf(course);
  const topicOptions = topicOptionsOf(course);

  // Course Builder: same editor without the dialog chrome
  if (bare) {
    return (
      <div>
          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          )}

          {!isLoading && course && (
            <BuilderItemsProvider courseId={course.id} lessonOptions={lessonOptions} topics={topicOptions}>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Add topics, then lessons inside each. Under every lesson you can add a <strong>quiz</strong>, an{" "}
                <strong>assignment</strong> or a <strong>resource</strong> (file or link) — students see it right under that lesson and
                in the course&apos;s Quizzes / Assignments / Resources tabs.
              </p>

              {(course.sections?.length ?? 0) === 0 && (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No sections yet. Add a section to start building the curriculum.
                </p>
              )}

              {(course.sections ?? []).map((section, si) => (
                <SectionCard
                  key={section.id}
                  courseId={course.id}
                  section={section}
                  index={si}
                  onInvalidate={invalidate}
                />
              ))}

              <Button
                type="button"
                variant="secondary"
                onClick={() => addSectionMutation.mutate()}
                disabled={addSectionMutation.isPending}
              >
                {addSectionMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Add section
              </Button>

              <CourseMaterials />
              <UnplacedItems />
            </div>
            </BuilderItemsProvider>
          )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[min(92vh,920px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl lg:max-w-5xl"
        )}
      >
        <div className="border-b bg-muted/30 px-6 py-4">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <ListTree className="h-5 w-5 text-primary" />
              Manage curriculum
            </DialogTitle>
            <DialogDescription>
              {isLoading ? (
                "Loading course…"
              ) : course ? (
                <>
                  <span className="font-medium text-foreground">{course.title}</span> — sections and lessons
                </>
              ) : (
                "Edit sections and lessons for this course."
              )}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          )}

          {!isLoading && course && (
            <BuilderItemsProvider courseId={course.id} lessonOptions={lessonOptions} topics={topicOptions}>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Add or edit sections (modules), then lessons inside each. Under every lesson you can add a quiz, an assignment or a
                resource.
              </p>

              {(course.sections?.length ?? 0) === 0 && (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No sections yet. Add a section to start building the curriculum.
                </p>
              )}

              {(course.sections ?? []).map((section, si) => (
                <SectionCard
                  key={section.id}
                  courseId={course.id}
                  section={section}
                  index={si}
                  onInvalidate={invalidate}
                />
              ))}

              <Button
                type="button"
                variant="secondary"
                onClick={() => addSectionMutation.mutate()}
                disabled={addSectionMutation.isPending}
              >
                {addSectionMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Add section
              </Button>

              <CourseMaterials />
              <UnplacedItems />
            </div>
            </BuilderItemsProvider>
          )}
        </div>

        <div className="border-t bg-muted/20 px-6 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionCard({
  courseId,
  section,
  index,
  onInvalidate,
}: {
  courseId: string;
  section: Section;
  index: number;
  onInvalidate: () => void;
}) {
  const [title, setTitle] = useState(section.title);
  const [moduleOpen, setModuleOpen] = useState(true);
  const [openLessonId, setOpenLessonId] = useState<string | null>(null);

  useEffect(() => {
    setTitle(section.title);
  }, [section.id, section.title]);

  const queryClient = useQueryClient();

  const saveSection = useMutation({
    mutationFn: async () => {
      const t = title.trim();
      if (!t) throw new Error("empty");
      await coursesApi.updateSection(section.id, { title: t, sort_order: section.sort_order });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast.success("Section saved");
    },
    onError: () => toast.error("Could not save section"),
  });

  const deleteSectionMutation = useMutation({
    mutationFn: async () => {
      await coursesApi.deleteSection(section.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast.success("Section removed");
    },
    onError: () => toast.error("Could not delete section"),
  });

  const addLessonMutation = useMutation({
    mutationFn: async () => {
      const n = section.lessons?.length ?? 0;
      const res = await coursesApi.addLesson(section.id, {
        title: "New lesson",
        description: "",
        content: "",
        video_provider: "",
        video_url: "",
        attachments: [],
        sort_order: n,
      });
      return res.data;
    },
    onSuccess: (newLesson) => {
      if (newLesson?.id) setOpenLessonId(newLesson.id);
      onInvalidate();
      toast.success("Lesson added");
    },
    onError: () => toast.error("Could not add lesson"),
  });

  const handleDeleteSection = () => {
    if (!globalThis.confirm("Delete this section and all its lessons?")) return;
    deleteSectionMutation.mutate();
  };

  // an edited topic title counts as unsaved until "Save section" (or "Save all") is pressed
  useRegisterUnsaved(
    `section:${section.id}`,
    !!title.trim() && title.trim() !== section.title,
    `Topic “${title.trim()}”`,
    () => saveSection.mutateAsync()
  );

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          onClick={() => setModuleOpen((o) => !o)}
          aria-expanded={moduleOpen}
          aria-label={moduleOpen ? "Collapse section" : "Expand section"}
        >
          {moduleOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
        <span className="text-xs font-semibold uppercase text-muted-foreground">Section {index + 1}</span>
        <Input
          className="max-w-md flex-1 font-medium"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Section title"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!title.trim() || title.trim() === section.title || saveSection.isPending}
          onClick={() => saveSection.mutate()}
        >
          {saveSection.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save section"}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={deleteSectionMutation.isPending}
          onClick={handleDeleteSection}
          aria-label="Delete section"
        >
          {deleteSectionMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>
      {moduleOpen && (
        <div className="ml-2 space-y-3 border-l-2 border-primary/20 pl-4">
          {(section.lessons ?? []).map((lesson, li) => (
            <Fragment key={lesson.id}>
              <LessonCard
                courseId={courseId}
                lesson={lesson}
                lessonIndex={li}
                onInvalidate={onInvalidate}
                initialCollapsed={lesson.id !== openLessonId}
              />
              {/* Phase 2: the topic's quizzes / assignments placed after this lesson */}
              <AfterLessonItems lessonId={lesson.id} />
            </Fragment>
          ))}
          <TopicItems sectionId={section.id} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addLessonMutation.mutate()}
            disabled={addLessonMutation.isPending}
          >
            {addLessonMutation.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1 h-4 w-4" />
            )}
            Add lesson
          </Button>
        </div>
      )}
    </div>
  );
}

const VIDEO_PROVIDERS = [
  { value: "__none__", label: "No video" },
  { value: "vdocipher", label: "VdoCipher (secure)" },
  { value: "youtube", label: "YouTube" },
  { value: "vimeo", label: "Vimeo" },
  { value: "loom", label: "Loom" },
  { value: "direct", label: "Direct file (MP4, etc.)" },
  { value: "embed", label: "Other / embed link" },
] as const;

function LessonCard({
  courseId,
  lesson,
  lessonIndex,
  onInvalidate,
  initialCollapsed = false,
}: {
  courseId: string;
  lesson: Lesson;
  lessonIndex: number;
  onInvalidate: () => void;
  /** Newly added lessons start folded; open the chevron to edit. */
  initialCollapsed?: boolean;
}) {
  const [expanded, setExpanded] = useState(!initialCollapsed);
  const [title, setTitle] = useState(lesson.title);
  const [description, setDescription] = useState(lesson.description ?? "");
  const [content, setContent] = useState(lesson.content ?? "");
  const [videoProvider, setVideoProvider] = useState(() => {
    const p = (lesson.video_provider ?? "").toLowerCase();
    return p && VIDEO_PROVIDERS.some((v) => v.value === p) ? p : "__none__";
  });
  const [videoUrl, setVideoUrl] = useState(lesson.video_url ?? "");
  const [vdoId, setVdoId] = useState(lesson.vdocipher_video_id ?? "");
  const [durationMin, setDurationMin] = useState(
    lesson.duration_seconds ? String(Math.round(lesson.duration_seconds / 60)) : ""
  );
  const [isPreview, setIsPreview] = useState(!!lesson.is_preview);
  const [attachmentRows, setAttachmentRows] = useState<LessonFormRow[]>(() =>
    attachmentsToRows(parseLessonAttachments(lesson.attachments_json))
  );

  useEffect(() => {
    setTitle(lesson.title);
    setDescription(lesson.description ?? "");
    setContent(lesson.content ?? "");
    const p = (lesson.video_provider ?? "").toLowerCase();
    setVideoProvider(p && VIDEO_PROVIDERS.some((v) => v.value === p) ? p : "__none__");
    setVideoUrl(lesson.video_url ?? "");
    setVdoId(lesson.vdocipher_video_id ?? "");
    setDurationMin(lesson.duration_seconds ? String(Math.round(lesson.duration_seconds / 60)) : "");
    setIsPreview(!!lesson.is_preview);
    setAttachmentRows(attachmentsToRows(parseLessonAttachments(lesson.attachments_json)));
  }, [lesson.id, lesson.title, lesson.description, lesson.content, lesson.video_provider, lesson.video_url, lesson.attachments_json, lesson.vdocipher_video_id, lesson.duration_seconds, lesson.is_preview]);

  const queryClient = useQueryClient();

  const saveLesson = useMutation({
    mutationFn: async () => {
      const t = title.trim();
      if (!t) throw new Error("empty");
      const isVdo = videoProvider === "vdocipher";
      if (isVdo && !/^[0-9a-f]{32}$/i.test(vdoId.trim())) throw new Error("vdo");
      const vp = videoProvider === "__none__" || isVdo ? "" : videoProvider;
      const mins = durationMin.trim() === "" ? null : Number(durationMin);
      await coursesApi.updateLesson(lesson.id, {
        title: t,
        description: description.trim(),
        content,
        video_provider: vp,
        video_url: isVdo ? "" : videoUrl.trim(),
        vdocipher_video_id: isVdo ? vdoId.trim() : null,
        duration_seconds: mins == null || Number.isNaN(mins) ? null : Math.round(mins * 60),
        is_preview: isPreview,
        attachments: rowsToPayload(attachmentRows),
        sort_order: lesson.sort_order,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      setExpanded(false);
      toast.success("Lesson saved");
    },
    onError: (e) =>
      toast.error(
        e instanceof Error && e.message === "vdo"
          ? "VdoCipher video ID must be 32 characters (0-9, a-f)"
          : "Could not save lesson"
      ),
  });

  const removeLesson = useMutation({
    mutationFn: async () => {
      await coursesApi.deleteLesson(lesson.id);
    },
    onSuccess: () => {
      onInvalidate();
      toast.success("Lesson removed");
    },
    onError: () => toast.error("Could not remove lesson"),
  });

  const serverSnap = lessonSnapshot(lesson);
  const localSnap = JSON.stringify({
    title: title.trim(),
    description: description.trim(),
    content,
    video_provider: videoProvider === "__none__" ? "" : videoProvider,
    video_url: videoUrl.trim(),
    attachments: rowsToPayload(attachmentRows),
    sort_order: lesson.sort_order,
  });
  const extrasServer = JSON.stringify([
    lesson.vdocipher_video_id ?? "",
    lesson.duration_seconds ? String(Math.round(lesson.duration_seconds / 60)) : "",
    !!lesson.is_preview,
  ]);
  const extrasLocal = JSON.stringify([videoProvider === "vdocipher" ? vdoId.trim() : "", durationMin.trim(), isPreview]);
  const dirty = localSnap !== serverSnap || extrasLocal !== extrasServer;
  // the builder lists unsaved lessons, saves them with "Save all" and before changing step
  useRegisterUnsaved(`lesson:${lesson.id}`, dirty && !!title.trim(), `Lesson “${title.trim()}”`, () => saveLesson.mutateAsync());

  const handleDeleteLesson = () => {
    if (!globalThis.confirm("Delete this lesson?")) return;
    removeLesson.mutate();
  };

  const videoHint =
    videoProvider === "youtube"
      ? "Paste watch URL (youtube.com/watch?v=…) or youtu.be/…"
      : videoProvider === "vimeo"
        ? "Paste vimeo.com/… link"
        : videoProvider === "loom"
          ? "Paste loom.com/share/… link"
          : videoProvider === "direct"
            ? "Direct URL to video file (e.g. .mp4)"
            : videoProvider === "embed"
              ? "Any embeddable page or iframe src URL"
              : "";

  return (
    <div className="space-y-4 rounded-xl border border-border/80 bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse lesson details" : "Expand lesson details"}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Lesson {lessonIndex + 1}
        </span>
        <Input
          className="max-w-md flex-1 font-medium"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Lesson title"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!title.trim() || !dirty || saveLesson.isPending}
          onClick={() => saveLesson.mutate()}
        >
          {saveLesson.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save lesson"}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={handleDeleteLesson}
          disabled={removeLesson.isPending}
          aria-label="Delete lesson"
        >
          {removeLesson.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {!expanded && (
        <p className="pl-10 text-xs text-muted-foreground">
          {description.trim() ? description.slice(0, 120) + (description.length > 120 ? "…" : "") : "Click the arrow to edit the description, content and video."}
        </p>
      )}

      {/* A6: quizzes, assignments and resources of this lesson */}
      <LessonItems lessonId={lesson.id} />

      {expanded && (
        <>
      <div className="space-y-2">
        <Label htmlFor={`ld-${lesson.id}`}>Short description</Label>
        <Textarea
          id={`ld-${lesson.id}`}
          rows={2}
          placeholder="What learners will do in this lesson (shown in outlines / previews)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="resize-y"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`lc-${lesson.id}`}>Lesson content</Label>
        <RichTextEditor
          id={`lc-${lesson.id}`}
          placeholder="Full lesson text: instructions, readings, headings, lists, links…"
          value={content}
          onChange={setContent}
          minHeight={200}
        />
      </div>

      <Separator />

      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Video className="h-4 w-4 text-primary" />
        Video
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select value={videoProvider} onValueChange={setVideoProvider}>
            <SelectTrigger>
              <SelectValue placeholder="Choose source" />
            </SelectTrigger>
            <SelectContent>
              {VIDEO_PROVIDERS.map((v) => (
                <SelectItem key={v.value} value={v.value}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {videoProvider === "vdocipher" ? (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={`lvdo-${lesson.id}`}>VdoCipher video ID</Label>
            <Input
              id={`lvdo-${lesson.id}`}
              value={vdoId}
              onChange={(e) => setVdoId(e.target.value)}
              placeholder="32-character ID from the VdoCipher dashboard"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Secure DRM playback: enrolled students get a one-time token from the server.
            </p>
          </div>
        ) : (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={`lv-${lesson.id}`}>Video URL</Label>
            <Input
              id={`lv-${lesson.id}`}
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder={videoHint || "Select a provider above, then paste the URL"}
              disabled={videoProvider === "__none__"}
            />
            {videoHint && videoProvider !== "__none__" && (
              <p className="text-xs text-muted-foreground">{videoHint}</p>
            )}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor={`ldur-${lesson.id}`}>Duration (minutes)</Label>
          <Input
            id={`ldur-${lesson.id}`}
            type="number"
            min={0}
            value={durationMin}
            onChange={(e) => setDurationMin(e.target.value)}
            placeholder="e.g. 12"
          />
        </div>
        <label className="flex items-center gap-2.5 self-end rounded-lg border border-border px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={isPreview}
            onChange={(e) => setIsPreview(e.target.checked)}
            className="h-4 w-4 accent-[hsl(var(--brand))]"
          />
          <span>
            <span className="font-medium text-foreground">Free preview</span>
            <span className="block text-xs text-muted-foreground">Visitors can watch without enrolling</span>
          </span>
        </label>
      </div>

      {attachmentRows.length ? (
        <>
      <Separator />

      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Paperclip className="h-4 w-4 text-primary" />
        Links saved with the older editor
      </div>
      <p className="text-xs text-muted-foreground">
        Students still see these. To add new files or links, use <strong>+ Resource</strong> under the lesson.
      </p>
      <div className="space-y-2">
        {attachmentRows.map((row) => (
          <div key={row.clientId} className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <Label className="text-xs">File name</Label>
              <Input
                value={row.name}
                onChange={(e) =>
                  setAttachmentRows((prev) =>
                    prev.map((r) => (r.clientId === row.clientId ? { ...r, name: e.target.value } : r))
                  )
                }
                placeholder="e.g. Lecture slides.pdf"
              />
            </div>
            <div className="min-w-0 flex-[2] space-y-1">
              <Label className="text-xs">URL</Label>
              <div className="flex flex-wrap gap-1.5">
                <Input
                  className="min-w-0 flex-1"
                  value={row.url}
                  onChange={(e) =>
                    setAttachmentRows((prev) =>
                      prev.map((r) => (r.clientId === row.clientId ? { ...r, url: e.target.value } : r))
                    )
                  }
                  placeholder="https://…"
                />
                <AssetUploadButton
                  label="Upload"
                  folder="curriculum"
                  className="shrink-0"
                  onUrl={(url, meta) => {
                    setAttachmentRows((prev) =>
                      prev.map((r) => {
                        if (r.clientId !== row.clientId) return r;
                        const guess = meta?.filename?.trim();
                        const name =
                          r.name.trim() || (guess ? guess.replace(/^.*[/\\]/, "") : "");
                        return { ...r, url, name };
                      })
                    );
                  }}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => setAttachmentRows((prev) => prev.filter((r) => r.clientId !== row.clientId))}
              aria-label="Remove attachment"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
        </>
      ) : null}
        </>
      )}
    </div>
  );
}
