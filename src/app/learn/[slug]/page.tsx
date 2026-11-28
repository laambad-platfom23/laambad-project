"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  ArrowLeft,
  Award,
  BookOpen,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FolderOpen,
  GraduationCap,
  Info,
  ListTree,
  Loader2,
  Lock,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  MoreHorizontal,
  NotebookPen,
  RotateCcw,
  Star,
  Trophy,
  Video,
} from "lucide-react";
import { learningApi } from "@/services/api/student-features";
import { coursesApi } from "@/services/api/courses";
import { dashboardApi } from "@/services/api/dashboard";
import { enrollmentsApi } from "@/services/api/enrollments";
import { courseItemsApi } from "@/services/api/course-items";
import { buildSectionGroups, CourseCurriculumSidebar, type ActiveItem } from "@/components/learning/course-curriculum-sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LessonVideoPlayer } from "@/components/learning/lesson-video-player";
import { LessonQAPanel } from "@/components/learning/lesson-qa-panel";
import { CourseLiveSessions } from "@/components/learning/course-live-sessions";
import { QuizPlayer } from "@/components/learning/quiz-player";
import { AssignmentView } from "@/components/learning/assignment-view";
import { NotesPanel, useLessonNotes } from "@/components/learning/notes-panel";
import { AnnouncementsPanel } from "@/components/learning/announcements-panel";
import { ReviewsPanel } from "@/components/learning/reviews-panel";
import { playback } from "@/components/learning/watch-tracker";
import {
  AssignmentsPanel,
  GradebookPanel,
  OverviewPanel,
  QuizzesPanel,
  ResourcesPanel,
  extrasOf,
  useItemMaps,
} from "@/components/learning/learn-panels";
import type { Course, Lesson, Section } from "@/types";
import { useAuthStore } from "@/store/auth-store";
import { useAuth } from "@/hooks/use-auth";
import { cn, getApiErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

function polishLessonTitle(title: string) {
  return title
    .replace(/\bIntrouciton\b/gi, "Introduction")
    .replace(/\bIntrodution\b/gi, "Introduction");
}

function flattenLessons(course: Course | undefined): { section: Section; lesson: Lesson }[] {
  if (!course?.sections?.length) return [];
  const sections = [...course.sections].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const out: { section: Section; lesson: Lesson }[] = [];
  for (const sec of sections) {
    const lessons = [...(sec.lessons ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    for (const lesson of lessons) {
      out.push({ section: sec, lesson });
    }
  }
  return out;
}

function formatDurationMinutes(min?: number): string {
  if (min == null || min <= 0) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const TABS = ["content", "overview", "notes", "quizzes", "assignments", "resources", "announcements", "reviews", "qa", "grades"] as const;
type TabKey = (typeof TABS)[number];

function LearnCoursePageInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const slug = typeof params.slug === "string" ? decodeURIComponent(params.slug) : "";
  const user = useAuthStore((s) => s.user);
  // The learn layout has no dashboard shell: load the signed-in user here (direct link / page refresh).
  useAuth();
  const authLoading = useAuthStore((s) => s.isLoading);

  const lessonFromQuery = searchParams.get("lesson")?.trim() ?? "";
  const quizFromQuery = searchParams.get("quiz")?.trim() ?? "";
  const assignmentFromQuery = searchParams.get("assignment")?.trim() ?? "";
  const tabFromQuery = searchParams.get("tab")?.trim() ?? "";
  const tab: TabKey = (TABS as readonly string[]).includes(tabFromQuery) ? (tabFromQuery as TabKey) : "overview";
  const activeItem: ActiveItem = quizFromQuery
    ? { kind: "quiz", id: quizFromQuery }
    : assignmentFromQuery
      ? { kind: "assignment", id: assignmentFromQuery }
      : null;

  const {
    data: course,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["learn-course", slug],
    queryFn: () => coursesApi.getBySlug(slug).then((r) => r.data as Course),
    enabled: !!slug && !!user,
    retry: false,
  });

  const isAdmin = (user?.role ?? user?.role_slug ?? "").toLowerCase() === "admin";
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["dashboard-overview", "enrollments", user?.id, slug],
    queryFn: () => dashboardApi.overview(slug).then((r) => r.data),
    enabled: !!slug && !!user && !isAdmin,
  });

  const enrollRowEarly = overview?.courses?.find((c) => c.course_slug === slug);
  const isInstructorEarly = !!(course && user?.id && course.instructor_id === user.id);
  const mayLearn = !!course && (isAdmin || isInstructorEarly || enrollRowEarly?.payment_status === "paid");

  // A6: quizzes, assignments and resources of the course (one request)
  const { data: items } = useQuery({
    queryKey: ["learning-items", course?.id],
    queryFn: () => courseItemsApi.learning(course!.id).then((r) => r.data),
    enabled: !!course?.id && mayLearn,
    retry: false,
    staleTime: 30_000,
  });
  const maps = useItemMaps(items);

  const flat = useMemo(() => flattenLessons(course), [course]);
  const sectionGroups = useMemo(
    () => buildSectionGroups(course, (sid) => !!maps.bySection.get(sid)),
    [course, maps]
  );

  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);

  useEffect(() => {
    setActiveLessonId(null);
  }, [slug]);

  useEffect(() => {
    if (!flat.length) return;
    const fromUrl =
      lessonFromQuery && flat.some((x) => x.lesson.id === lessonFromQuery) ? lessonFromQuery : null;
    let next = fromUrl;
    // an item link without a lesson (e.g. from a notification): open the lesson the item belongs to
    if (!next && activeItem) {
      const all = [...(items?.quizzes ?? []), ...(items?.assignments ?? [])];
      const owner = all.find((x) => x.id === activeItem.id)?.lesson_id;
      if (owner && flat.some((x) => x.lesson.id === owner)) next = owner;
    }
    setActiveLessonId(next ?? flat[0].lesson.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, lessonFromQuery, items]);

  const { data: progress } = useQuery({
    queryKey: ["course-progress", course?.id],
    queryFn: () => enrollmentsApi.getProgress(course!.id).then((r) => r.data),
    enabled: !!course?.id && !!user,
    retry: false,
  });

  const progressByLesson = useMemo(() => {
    const m = new Map<string, { completed: boolean; percent: number }>();
    for (const row of progress?.lessons ?? []) {
      m.set(row.lesson_id, { completed: row.completed, percent: row.completed_percent });
    }
    return m;
  }, [progress]);

  const selected = flat.find((x) => x.lesson.id === activeLessonId) ?? flat[0];

  // A7: a new lesson starts its video at 0 — notes must not take the previous video's time
  useEffect(() => {
    playback.reset();
  }, [activeLessonId]);
  const { data: lessonNotes } = useLessonNotes(mayLearn ? selected?.lesson.id : null);

  useEffect(() => {
    if (!user && !authLoading) {
      router.replace(`/login?next=${encodeURIComponent(`/learn/${encodeURIComponent(slug)}`)}`);
    }
  }, [user, authLoading, router, slug]);

  const mainRef = useRef<HTMLElement | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);

  /** Change the URL (lesson / quiz / assignment / tab) without a reload. */
  const go = (next: { lesson?: string | null; quiz?: string | null; assignment?: string | null; tab?: TabKey | null }, scroll: "top" | "tabs" | "none" = "top") => {
    const p = new URLSearchParams();
    const lesson = next.lesson === undefined ? activeLessonId : next.lesson;
    if (lesson) p.set("lesson", lesson);
    if (next.quiz) p.set("quiz", next.quiz);
    if (next.assignment) p.set("assignment", next.assignment);
    const t = next.tab === undefined ? tab : next.tab;
    if (t && t !== "overview") p.set("tab", t);
    router.replace(`/learn/${encodeURIComponent(slug)}${p.toString() ? `?${p}` : ""}`, { scroll: false });
    if (typeof window === "undefined") return;
    if (scroll === "top") {
      mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (scroll === "tabs") {
      setTimeout(() => tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }
  };

  const selectLesson = (id: string) => {
    setActiveLessonId(id);
    go({ lesson: id, quiz: null, assignment: null, tab: tab === "content" ? "overview" : tab });
  };
  const openQuiz = (id: string) => go({ quiz: id, assignment: null });
  const openAssignment = (id: string) => go({ assignment: id, quiz: null });
  const closeItem = () => go({ quiz: null, assignment: null });
  const showTab = (t: TabKey) => go({ quiz: null, assignment: null, tab: t }, "tabs");

  const lessonIndex = flat.findIndex((x) => x.lesson.id === activeLessonId);
  const canGoPrevious = lessonIndex > 0;
  const isLastLesson = lessonIndex >= 0 && lessonIndex === flat.length - 1;

  const completeMutation = useMutation({
    mutationFn: async () => {
      const lessonId = selected?.lesson.id;
      if (!lessonId) return null;
      const res = await enrollmentsApi.updateLessonProgress(lessonId, { completed: true, completed_percent: 100 });
      return (res?.data ?? null) as { course_completed?: boolean; certificate_id?: string | null; certificate_note?: string } | null;
    },
    onSuccess: (result) => {
      if (result?.certificate_id) {
        const certId = result.certificate_id;
        toast.success("🎓 Course completed — your certificate is ready!", {
          duration: 12000,
          action: { label: "View certificate", onClick: () => router.push(`/dashboard/certificates/${certId}`) },
        });
        queryClient.invalidateQueries({ queryKey: ["my-certificates"] });
      } else if (result?.certificate_note) {
        // Phase 2: every lesson is done, but the certificate also needs the quizzes / assignments
        toast.message("All lessons done — one more step for your certificate", {
          description: result.certificate_note.charAt(0).toUpperCase() + result.certificate_note.slice(1) + ".",
          duration: 12000,
          action: { label: "See what is left", onClick: () => showTab("grades") },
        });
      }
      queryClient.invalidateQueries({ queryKey: ["certificate-requirements", course?.id] });
      queryClient.invalidateQueries({ queryKey: ["course-progress", course?.id] });
      queryClient.invalidateQueries({ queryKey: ["learn-course", slug] });
      queryClient.invalidateQueries({ queryKey: ["learning-items", course?.id] });
      queryClient.invalidateQueries({ queryKey: ["course-enrollment-access"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      const idx = flat.findIndex((x) => x.lesson.id === activeLessonId);
      const ex = extrasOf(maps, activeLessonId);
      const pending = ex.quizzes.filter((q) => !q.passed).length + ex.assignments.filter((a) => a.status === "not_submitted").length;
      if (idx >= 0 && idx < flat.length - 1) {
        const nextId = flat[idx + 1].lesson.id;
        toast.success(
          pending ? `Saved — this lesson also has ${pending === 1 ? "a quiz / assignment" : `${pending} quizzes / assignments`} for you` : "Saved — continuing to the next lesson"
        );
        selectLesson(nextId);
      } else {
        toast.success("Lesson complete — amazing work finishing the course!");
      }
    },
    onError: (err: unknown) => {
      toast.error(getApiErrorMessage(err, "Could not save progress"));
    },
  });

  // A2: the player reports how much of the video was really watched; the server completes the
  // lesson at 80 % (green tick) and never lowers saved progress. One request at a time per lesson.
  const watchInFlight = useRef<Set<string>>(new Set());
  const handleWatched = async (lessonId: string | undefined, percent: number) => {
    if (!lessonId || progressByLesson.get(lessonId)?.completed) return;
    if (watchInFlight.current.has(lessonId)) return;
    watchInFlight.current.add(lessonId);
    try {
      const { data } = await learningApi.watched(lessonId, percent);
      if (data?.completed) {
        queryClient.invalidateQueries({ queryKey: ["course-progress", course?.id] });
        queryClient.invalidateQueries({ queryKey: ["learn-course", slug] });
        queryClient.invalidateQueries({ queryKey: ["learning-items", course?.id] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
        queryClient.invalidateQueries({ queryKey: ["my-streak"] });
        if (data.certificate_id) {
          const certId = data.certificate_id;
          toast.success("🎓 Course completed — your certificate is ready!", {
            duration: 12000,
            action: { label: "View certificate", onClick: () => router.push(`/dashboard/certificates/${certId}`) },
          });
          queryClient.invalidateQueries({ queryKey: ["my-certificates"] });
        } else {
          toast.success("✓ Lesson completed — you watched 80% of it");
        }
      }
    } catch {
      // progress is retried at the next 10 % step; the learner can always press "Complete"
    } finally {
      watchInFlight.current.delete(lessonId);
    }
  };

  const retakeMutation = useMutation({
    mutationFn: () => learningApi.retake(course!.id).then((r) => r.data),
    onSuccess: () => {
      toast.success("Course restarted — your certificate is kept. Good luck!");
      queryClient.invalidateQueries({ queryKey: ["course-progress", course?.id] });
      queryClient.invalidateQueries({ queryKey: ["learn-course", slug] });
      queryClient.invalidateQueries({ queryKey: ["learning-items", course?.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      if (flat.length) selectLesson(flat[0].lesson.id);
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, "Could not restart the course")),
  });
  const courseFinished =
    !!progress && progress.total_lessons > 0 && progress.completed_lessons >= progress.total_lessons;

  const handlePreviousLesson = () => {
    if (!canGoPrevious) return;
    selectLesson(flat[lessonIndex - 1].lesson.id);
  };

  if (!slug) {
    return (
      <div className="px-4 py-16 text-center text-muted-foreground">
        Invalid course link.{" "}
        <Link href="/dashboard/my-courses" className="font-medium text-[#0B1F3A] underline dark:text-[#FF8A66]">
          My courses
        </Link>
      </div>
    );
  }

  if (authLoading || !user) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-10">
        <Skeleton className="h-8 w-2/3 max-w-md" />
        <Skeleton className="mt-6 aspect-video w-full rounded-xl" />
      </div>
    );
  }

  if (isLoading || (!isAdmin && overviewLoading)) {
    return <LearnPageFallback />;
  }

  if (isError && axios.isAxiosError(error)) {
    if (error.response?.status === 401) {
      return null;
    }
    if (error.response?.status === 403) {
      return (
        <div className="mx-auto max-w-lg px-4 py-20 text-center">
          <h1 className="text-xl font-semibold text-[#0f172a] dark:text-white">Course not available</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You need to enroll and have active access to watch lessons.
          </p>
          <Button
            asChild
            className="mt-6 bg-[#0B1F3A] dark:bg-brand dark:hover:bg-brand-hover font-semibold text-white hover:bg-[#123252]"
          >
            <Link href={`/courses/${encodeURIComponent(slug)}`}>View course page</Link>
          </Button>
        </div>
      );
    }
  }

  const enrollRow = overview?.courses?.find((c) => c.course_slug === slug);
  const isInstructor = !!(course && user?.id && course.instructor_id === user.id);
  const canAnswerLessonQA = isInstructor || isAdmin;
  const heldForPayment =
    !!course &&
    !isAdmin &&
    !isInstructor &&
    !!enrollRow &&
    enrollRow.payment_status !== "paid";

  if (!isAdmin && !overviewLoading && course && !isInstructor && !enrollRow) {
    return (
      <div className="mx-auto flex min-h-[min(520px,80svh)] max-w-lg flex-col justify-center px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-[#0f172a] dark:text-white">Enrollment required</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          You are not enrolled in this course yet. Open the course page to enroll for free or complete checkout for paid
          access.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="bg-[#0B1F3A] dark:bg-brand dark:hover:bg-brand-hover font-semibold text-white hover:bg-[#123252]">
            <Link href={`/courses/${encodeURIComponent(slug)}`}>View course &amp; enroll</Link>
          </Button>
          <Button asChild variant="outline" className="border-[#0B1F3A]/30 dark:border-white/35">
            <Link href="/dashboard/my-courses">My courses</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (heldForPayment && enrollRow) {
    const isPending = enrollRow.payment_status === "pending";
    return (
      <div className="mx-auto flex min-h-[min(520px,80svh)] max-w-lg flex-col justify-center px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-[#0f172a] dark:text-white">
          {isPending ? "Payment verification in progress" : "Course access on hold"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {isPending
            ? "Your request was received. Complete your offline payment if you have not already. Our team will activate your access after we confirm your transfer — you cannot open lessons until then."
            : "This enrollment is not active yet. Open the course page to review payment options or contact support."}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            asChild
            className="bg-[#0B1F3A] dark:bg-brand dark:hover:bg-brand-hover font-semibold text-white hover:bg-[#123252]"
          >
            <Link href={`/courses/${encodeURIComponent(slug)}`}>Course page</Link>
          </Button>
          <Button asChild variant="outline" className="border-[#0B1F3A]/30 dark:border-white/35">
            <Link href="/dashboard/my-courses">My courses</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!course || !flat.length) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="text-muted-foreground">This course has no lessons yet.</p>
        <Button asChild variant="outline" className="mt-4 border-[#0B1F3A]/30 dark:border-white/35">
          <Link href="/dashboard/my-courses">Back to My courses</Link>
        </Button>
      </div>
    );
  }

  // A5 sequential courses: the first lesson that is open but not completed yet
  const firstOpenLessonId =
    flat.find((x) => !x.lesson.locked && !progressByLesson.get(x.lesson.id)?.completed)?.lesson.id ?? null;
  const extras = extrasOf(maps, selected?.lesson.id);
  const counts = {
    quizzes: items?.quizzes.length ?? 0,
    assignments: items?.assignments.length ?? 0,
    resources: items?.resources.total ?? 0,
    announcements: items?.announcement_count ?? 0,
    notes: lessonNotes?.length ?? 0,
  };

  const curriculum = (variant: "panel" | "embedded", withMore: boolean) => (
    <CourseCurriculumSidebar
      variant={variant}
      groups={sectionGroups}
      activeLessonId={activeLessonId}
      progressByLesson={progressByLesson}
      polishLessonTitle={polishLessonTitle}
      formatDuration={formatDurationMinutes}
      onSelectLesson={selectLesson}
      maps={maps}
      activeItem={activeItem}
      onOpenQuiz={openQuiz}
      onOpenAssignment={openAssignment}
      footer={
        withMore ? (
          <MoreMenu
            slug={slug}
            counts={counts}
            certificateId={enrollRow?.certificate_id ?? null}
            onTab={showTab}
          />
        ) : undefined
      }
    />
  );

  const tabButtons: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }>; count?: number; mobileOnly?: boolean }[] = [
    { key: "content", label: "Content", icon: ListTree, mobileOnly: true },
    { key: "overview", label: "Overview", icon: BookOpen },
    { key: "notes", label: "Notes", icon: NotebookPen, count: counts.notes },
    { key: "quizzes", label: "Quizzes", icon: BrainCircuit, count: counts.quizzes },
    { key: "assignments", label: "Assignments", icon: ClipboardList, count: counts.assignments },
    { key: "resources", label: "Resources", icon: FolderOpen, count: counts.resources },
    { key: "announcements", label: "Announcements", icon: Megaphone, count: counts.announcements },
    { key: "reviews", label: "Reviews", icon: Star },
    { key: "qa", label: "Q&A", icon: MessageSquare },
    { key: "grades", label: "Gradebook", icon: Award },
  ];

  return (
    // lg: a fixed-height app shell (curriculum and lesson scroll separately). `lg:flex-none` matters: with
    // flex: 1 the height below is ignored, the columns' h-full falls back to auto and nothing scrolls inside.
    <div className="flex min-h-0 flex-1 flex-col lg:h-[calc(100dvh-3.75rem)] lg:flex-none lg:flex-row lg:overflow-hidden">
      {/* curriculum column (left on large screens; on phones it is the "Content" tab) */}
      <aside
        className={cn(
          "hidden min-h-0 shrink-0 flex-col overflow-hidden lg:flex",
          "lg:h-full lg:w-[min(100%,400px)] lg:max-w-[34vw] lg:border-r lg:border-[#0B1F3A]/12",
          "bg-white dark:bg-[#0c1829] dark:lg:border-white/15",
          "lg:shadow-[4px_0_32px_-16px_rgba(232,93,4,0.14)] dark:lg:shadow-[6px_0_40px_-16px_rgba(0,0,0,0.45)]",
        )}
      >
        {curriculum("panel", true)}
      </aside>

      <main
        ref={mainRef}
        className={cn("flex min-h-0 min-w-0 flex-1 flex-col lg:h-full lg:overflow-y-auto", "bg-[#f7f9fd] dark:bg-[#030A14]")}
      >
        <div className="mx-auto w-full max-w-[1180px] px-4 pb-12 pt-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3 pb-2">
            <h1 className="min-w-0 truncate text-lg font-bold tracking-tight text-[#0f172a] dark:text-white sm:text-xl" title={course.title}>
              {course.title}
            </h1>
            <Button asChild variant="outline" size="sm" className="shrink-0 rounded-xl">
              <Link href={`/dashboard/discussions/${encodeURIComponent(slug)}`}>
                <MessagesSquare className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Class discussion</span>
              </Link>
            </Button>
          </div>

          {activeItem ? (
            <div className="space-y-3">
              <Button variant="ghost" size="sm" onClick={closeItem} className="-ml-2">
                <ArrowLeft className="h-4 w-4" /> Back to lesson
                {selected ? <span className="hidden max-w-[40ch] truncate text-muted-foreground sm:inline">· {polishLessonTitle(selected.lesson.title)}</span> : null}
              </Button>
              {activeItem.kind === "quiz" ? (
                <QuizPlayer key={activeItem.id} quizId={activeItem.id} />
              ) : (
                <AssignmentView key={activeItem.id} assignmentId={activeItem.id} />
              )}
              <div className="lg:hidden">{curriculum("embedded", false)}</div>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "relative w-full max-w-full overflow-hidden rounded-2xl border border-[#0B1F3A]/10 bg-black shadow-[0_24px_56px_-28px_rgba(232,93,4,0.45)] ring-1 ring-black/5",
                  "dark:border-white/30 dark:shadow-[0_28px_64px_-24px_rgba(0,0,0,0.75)] dark:ring-white/10",
                )}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-px bg-white/20" />
                {selected?.lesson.locked ? (
                  <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-[#0B1F3A] px-6 text-center text-white">
                    <Lock className="h-10 w-10 text-white/70" aria-hidden />
                    <p className="text-lg font-semibold">This lesson is locked</p>
                    <p className="max-w-md text-sm text-white/75">
                      This course opens lessons in order. Complete the previous lesson to unlock this one.
                    </p>
                    {firstOpenLessonId ? (
                      <Button
                        type="button"
                        onClick={() => selectLesson(firstOpenLessonId)}
                        className="mt-1 bg-brand font-semibold text-white hover:bg-brand-hover"
                      >
                        Go to the lesson to complete
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <LessonVideoPlayer
                    videoProvider={selected?.lesson.video_provider}
                    videoUrl={selected?.lesson.video_url}
                    lessonId={selected?.lesson.id}
                    title={selected?.lesson.title}
                    onWatched={(pct) => handleWatched(selected?.lesson.id, pct)}
                    className="w-full max-w-[min(100%,1600px)] rounded-none shadow-none ring-0 sm:mx-auto"
                  />
                )}
              </div>

              <div
                className={cn(
                  "mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3",
                  "border-[#0B1F3A]/10 bg-white/85 shadow-[0_12px_40px_-20px_rgba(232,93,4,0.2)] backdrop-blur-md",
                  "dark:border-white/25 dark:bg-[#061528] dark:shadow-[0_16px_48px_-24px_rgba(0,0,0,0.55)]",
                )}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  disabled={!canGoPrevious}
                  onClick={handlePreviousLesson}
                  className={cn(
                    "rounded-xl border-[#0B1F3A]/18 bg-white/95 text-[13px] text-[#0B1F3A] shadow-sm transition-all hover:bg-[#0B1F3A]/8",
                    "dark:border-white/40 dark:bg-[#143d6e]/90 dark:text-[#FF8A66] dark:hover:bg-[#0B1F3A]/70 dark:hover:text-white",
                  )}
                >
                  <ChevronLeft className="mr-1 h-4 w-4 opacity-70" aria-hidden />
                  Previous
                </Button>
                <Button
                  type="button"
                  disabled={completeMutation.isPending || !selected?.lesson || !!selected?.lesson.locked}
                  onClick={() => completeMutation.mutate()}
                  className={cn(
                    "gap-1.5 rounded-xl bg-[#0B1F3A] px-6 text-sm font-bold text-white shadow-lg dark:bg-brand dark:hover:bg-brand-hover",
                    "shadow-[#0B1F3A]/35 ring-1 ring-[#0B1F3A]/40 hover:bg-[#061528]",
                    "disabled:opacity-60 sm:min-w-[210px]",
                  )}
                >
                  {completeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {isLastLesson ? "Complete lesson" : "Complete and continue"}
                  {!completeMutation.isPending ? <ChevronRight className="h-4 w-4" aria-hidden /> : null}
                </Button>
              </div>

              {courseFinished ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-success/30 bg-success-soft px-4 py-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-success">
                    <Trophy className="h-4 w-4" aria-hidden />
                    You finished this course
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={retakeMutation.isPending}
                    onClick={() => {
                      if (window.confirm("Start this course again? Your lesson progress will be reset. Your certificate is kept.")) {
                        retakeMutation.mutate();
                      }
                    }}
                    className="rounded-xl"
                  >
                    {retakeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Retake course
                  </Button>
                </div>
              ) : null}

              <CourseLiveSessions courseId={course.id} />

              {/* lesson title + tabs (Overview / Quizzes / Assignments / Resources / Q&A / Gradebook) */}
              <div ref={tabsRef} className="scroll-mt-4 pt-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0B1F3A]/65 dark:text-[#FF8A66]/85">
                  {selected?.section.title}
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#0f172a] dark:text-white sm:text-xl">
                  {selected ? polishLessonTitle(selected.lesson.title) : ""}
                </h2>
                <div
                  role="tablist"
                  aria-label="Lesson and course sections"
                  // phones: one row that scrolls sideways; large screens: every tab visible (wraps when needed)
                  className="mt-3 flex gap-1 overflow-x-auto border-b border-[#0B1F3A]/10 [scrollbar-width:none] dark:border-white/15 lg:flex-wrap lg:gap-x-0.5 lg:overflow-visible [&::-webkit-scrollbar]:hidden"
                >
                  {tabButtons.map((t) => {
                    const active = tab === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => go({ tab: t.key }, "none")}
                        className={cn(
                          "relative -mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors lg:px-2.5",
                          active
                            ? "border-brand text-[#0f172a] dark:text-white"
                            : "border-transparent text-muted-foreground hover:text-[#0f172a] dark:hover:text-white",
                          t.mobileOnly && "lg:hidden",
                        )}
                      >
                        <t.icon className={cn("h-4 w-4", active ? "text-brand" : "opacity-70")} />
                        {t.label}
                        {t.count ? (
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums",
                              active ? "bg-brand text-white" : "bg-muted text-muted-foreground"
                            )}
                          >
                            {t.count}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-4" role="tabpanel">
                  {tab === "content" ? (
                    <div className="lg:hidden">{curriculum("embedded", true)}</div>
                  ) : null}
                  {tab === "overview" && selected ? (
                    <OverviewPanel lesson={selected.lesson} extras={extras} onOpenQuiz={openQuiz} onOpenAssignment={openAssignment} />
                  ) : null}
                  {/* on large screens "Content" is the left column: show the overview instead */}
                  {tab === "content" && selected ? (
                    <div className="hidden lg:block">
                      <OverviewPanel lesson={selected.lesson} extras={extras} onOpenQuiz={openQuiz} onOpenAssignment={openAssignment} />
                    </div>
                  ) : null}
                  {tab === "notes" && selected ? <NotesPanel lessonId={selected.lesson.id} /> : null}
                  {tab === "announcements" ? <AnnouncementsPanel courseId={course.id} /> : null}
                  {tab === "reviews" ? <ReviewsPanel courseId={course.id} /> : null}
                  {tab === "quizzes" ? <QuizzesPanel items={items} onOpen={openQuiz} /> : null}
                  {tab === "assignments" ? <AssignmentsPanel items={items} onOpen={openAssignment} /> : null}
                  {tab === "resources" ? <ResourcesPanel items={items} activeLessonId={activeLessonId} onSelectLesson={selectLesson} /> : null}
                  {tab === "qa" && selected ? <LessonQAPanel lessonId={selected.lesson.id} isInstructor={canAnswerLessonQA} /> : null}
                  {tab === "grades" ? <GradebookPanel items={items} onOpenQuiz={openQuiz} onOpenAssignment={openAssignment} courseId={course.id} /> : null}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

/** "More" (bottom of the curriculum column): the course-wide sections, like the old learning area. */
function MoreMenu({
  slug,
  counts,
  certificateId,
  onTab,
}: {
  slug: string;
  counts: { quizzes: number; assignments: number; resources: number; announcements: number };
  certificateId: string | null;
  onTab: (t: TabKey) => void;
}) {
  const item = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[14px]";
  const badge = (n: number) =>
    n ? <span className="ml-auto rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{n}</span> : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl bg-[#0B1F3A]/[0.04] px-4 py-3 text-left text-[15px] font-semibold text-[#0f172a] transition hover:bg-[#0B1F3A]/[0.08] dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
        >
          <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
          More
          <span className="ml-auto text-xs font-normal text-muted-foreground">Quizzes · Assignments · Resources</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[min(92vw,360px)] p-1.5">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">This course</DropdownMenuLabel>
        <DropdownMenuItem className={item} onSelect={() => onTab("quizzes")}>
          <BrainCircuit className="h-[18px] w-[18px] text-brand" /> Quizzes {badge(counts.quizzes)}
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={() => onTab("assignments")}>
          <ClipboardList className="h-[18px] w-[18px] text-brand" /> Assignments {badge(counts.assignments)}
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={() => onTab("resources")}>
          <FolderOpen className="h-[18px] w-[18px] text-brand" /> Resources {badge(counts.resources)}
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={() => onTab("announcements")}>
          <Megaphone className="h-[18px] w-[18px] text-brand" /> Announcements {badge(counts.announcements)}
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={() => onTab("reviews")}>
          <Star className="h-[18px] w-[18px] text-brand" /> Reviews
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={() => onTab("notes")}>
          <NotebookPen className="h-[18px] w-[18px] text-brand" /> Notes
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={() => onTab("grades")}>
          <Award className="h-[18px] w-[18px] text-brand" /> Gradebook
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={() => onTab("qa")}>
          <MessageSquare className="h-[18px] w-[18px] text-brand" /> Lesson Q&amp;A
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className={item}>
          <Link href="/dashboard/notes">
            <NotebookPen className="h-[18px] w-[18px] text-muted-foreground" /> My notebook (all notes)
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={item}>
          <Link href="/dashboard/live-sessions">
            <Video className="h-[18px] w-[18px] text-muted-foreground" /> Live classes
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={item}>
          <Link href={`/dashboard/discussions/${encodeURIComponent(slug)}`}>
            <MessagesSquare className="h-[18px] w-[18px] text-muted-foreground" /> Class discussion
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={item}>
          <Link href={certificateId ? `/dashboard/certificates/${certificateId}` : "/dashboard/certificates"}>
            <GraduationCap className="h-[18px] w-[18px] text-muted-foreground" /> Certificate
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={item}>
          <Link href={`/courses/${encodeURIComponent(slug)}`}>
            <Info className="h-[18px] w-[18px] text-muted-foreground" /> Course info
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LearnPageFallback() {
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:h-[calc(100dvh-3.75rem)] lg:flex-none lg:flex-row">
      <Skeleton className="hidden min-h-[200px] rounded-none lg:block lg:h-full lg:w-[min(100%,400px)] lg:max-w-[34vw] lg:shrink-0" />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto w-full max-w-[1180px] flex-1 space-y-4 p-4 lg:px-8">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="aspect-video w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export default function LearnCoursePage() {
  return (
    <Suspense fallback={<LearnPageFallback />}>
      <LearnCoursePageInner />
    </Suspense>
  );
}
