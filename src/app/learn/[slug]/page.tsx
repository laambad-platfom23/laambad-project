"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ChevronLeft, ChevronRight, Loader2, MessagesSquare, RotateCcw, Trophy } from "lucide-react";
import { learningApi } from "@/services/api/student-features";
import { coursesApi } from "@/services/api/courses";
import { dashboardApi } from "@/services/api/dashboard";
import { enrollmentsApi } from "@/services/api/enrollments";
import { buildSectionGroups, CourseCurriculumSidebar } from "@/components/learning/course-curriculum-sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LessonVideoPlayer } from "@/components/learning/lesson-video-player";
import { LessonQAPanel } from "@/components/learning/lesson-qa-panel";
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

  const flat = useMemo(() => flattenLessons(course), [course]);
  const sectionGroups = useMemo(() => buildSectionGroups(course), [course]);

  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);

  useEffect(() => {
    setActiveLessonId(null);
  }, [slug]);

  useEffect(() => {
    if (!flat.length) return;
    const fromUrl =
      lessonFromQuery && flat.some((x) => x.lesson.id === lessonFromQuery) ? lessonFromQuery : null;
    const next = fromUrl ?? flat[0].lesson.id;
    setActiveLessonId(next);
  }, [flat, lessonFromQuery]);

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

  useEffect(() => {
    if (!user && !authLoading) {
      router.replace(`/login?next=${encodeURIComponent(`/learn/${encodeURIComponent(slug)}`)}`);
    }
  }, [user, authLoading, router, slug]);

  const selectLesson = (id: string) => {
    setActiveLessonId(id);
    router.replace(`/learn/${encodeURIComponent(slug)}?lesson=${encodeURIComponent(id)}`, { scroll: false });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const lessonIndex = flat.findIndex((x) => x.lesson.id === activeLessonId);
  const canGoPrevious = lessonIndex > 0;
  const isLastLesson = lessonIndex >= 0 && lessonIndex === flat.length - 1;

  const completeMutation = useMutation({
    mutationFn: async () => {
      const lessonId = selected?.lesson.id;
      if (!lessonId) return null;
      const res = await enrollmentsApi.updateLessonProgress(lessonId, { completed: true, completed_percent: 100 });
      return (res?.data ?? null) as { course_completed?: boolean; certificate_id?: string | null } | null;
    },
    onSuccess: (result) => {
      if (result?.certificate_id) {
        const certId = result.certificate_id;
        toast.success("🎓 Course completed — your certificate is ready!", {
          duration: 12000,
          action: { label: "View certificate", onClick: () => router.push(`/dashboard/certificates/${certId}`) },
        });
        queryClient.invalidateQueries({ queryKey: ["my-certificates"] });
      }
      queryClient.invalidateQueries({ queryKey: ["course-progress", course?.id] });
      queryClient.invalidateQueries({ queryKey: ["course-enrollment-access"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      const idx = flat.findIndex((x) => x.lesson.id === activeLessonId);
      if (idx >= 0 && idx < flat.length - 1) {
        const nextId = flat[idx + 1].lesson.id;
        toast.success("Saved — continuing to the next lesson");
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
    return (
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="order-1 flex min-h-0 flex-1 flex-col lg:order-2">
          <div className="flex-1 space-y-4 p-4">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="aspect-video w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
        <div className="order-2 hidden w-full shrink-0 border-t lg:order-1 lg:block lg:h-full lg:w-[min(380px,32vw)] lg:min-w-[280px] lg:border-r lg:border-t-0">
          <Skeleton className="h-full min-h-[200px] w-full rounded-none" />
        </div>
      </div>
    );
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

  const hasVideo = !!(selected?.lesson.video_url?.trim()) || !!selected?.lesson.has_vdocipher;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Main column first on mobile (video on top); curriculum column is left on lg */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <main
          className={cn(
            "order-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:order-2",
            "bg-[#f7f9fd]",
            "dark:bg-[#030A14]",
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-3 sm:px-6 lg:px-8">
            <h1
              className="min-w-0 truncate text-lg font-bold tracking-tight text-[#0f172a] dark:text-white sm:text-xl"
              title={course.title}
            >
              {course.title}
            </h1>
            <Button asChild variant="outline" size="sm" className="shrink-0 rounded-xl">
              <Link href={`/dashboard/discussions/${encodeURIComponent(slug)}`}>
                <MessagesSquare className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Class discussion</span>
              </Link>
            </Button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden px-4 pb-3 sm:px-6 lg:px-8">
            <div
              className={cn(
                "relative w-full max-w-full shrink-0 overflow-hidden rounded-2xl border border-[#0B1F3A]/10 bg-black shadow-[0_24px_56px_-28px_rgba(232,93,4,0.45)] ring-1 ring-black/5",
                "dark:border-white/30 dark:shadow-[0_28px_64px_-24px_rgba(0,0,0,0.75)] dark:ring-white/10",
              )}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-px bg-white/20" />
              {/* aspect-video (16:9) — full width of column, ratio preserved (no stretch) */}
              <LessonVideoPlayer
                videoProvider={selected?.lesson.video_provider}
                videoUrl={selected?.lesson.video_url}
                lessonId={selected?.lesson.id}
                title={selected?.lesson.title}
                onWatched={(pct) => handleWatched(selected?.lesson.id, pct)}
                className="w-full max-w-[min(100%,1600px)] rounded-none shadow-none ring-0 sm:mx-auto"
              />
            </div>

            <div className="mt-3 shrink-0">
              <div
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3",
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
                  disabled={completeMutation.isPending || !selected?.lesson}
                  onClick={() => completeMutation.mutate()}
                  className={cn(
                    "rounded-xl gap-1.5 bg-[#0B1F3A] dark:bg-brand dark:hover:bg-brand-hover px-6 text-sm font-bold text-white shadow-lg",
                    "shadow-[#0B1F3A]/35 ring-1 ring-[#0B1F3A]/40",
                    "hover:bg-[#061528] dark:bg-[#E84A27] dark:hover:bg-[#1D4ED8]",
                    "disabled:opacity-60 sm:min-w-[210px]",
                  )}
                >
                  {completeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  {isLastLesson ? "Complete lesson" : "Complete and continue"}
                  {!completeMutation.isPending ? <ChevronRight className="h-4 w-4" aria-hidden /> : null}
                </Button>
              </div>
            </div>

            {courseFinished ? (
              <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-success/30 bg-success-soft px-4 py-3">
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

            {selected ? (
              <div
                className={cn(
                  "mt-3 min-h-0 max-h-[min(32dvh,280px)] shrink-0 overflow-y-auto overscroll-contain rounded-2xl border border-[#0B1F3A]/10 border-t-4 border-t-[#0B1F3A] p-4 sm:p-5",
                  "bg-white/95 shadow-[0_16px_48px_-28px_rgba(232,93,4,0.18)]",
                  "dark:border-white/30 dark:bg-[#1a3358]/90 dark:shadow-[0_20px_56px_-28px_rgba(0,0,0,0.55)]",
                  "lg:max-h-[min(26dvh,240px)]",
                )}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0B1F3A]/65 dark:text-[#FF8A66]/85">
                  This lesson
                </p>
                <h2 className="mt-1.5 text-base font-semibold tracking-tight text-[#0f172a] dark:text-white sm:text-lg">
                  {polishLessonTitle(selected.lesson.title)}
                </h2>
                {selected.lesson.description ? (
                  <div
                    className={cn(
                      "mt-2 text-sm leading-relaxed text-muted-foreground dark:text-[#e8edf7]/90",
                      "dark:[&_a]:text-[#FF6B45] dark:[&_a]:underline dark:[&_a]:underline-offset-2",
                      "dark:[&_button]:border-[#E84A27]/50 dark:[&_button]:text-[#FF6B45]",
                      "dark:[&_strong]:text-white",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{selected.lesson.description}</p>
                  </div>
                ) : !hasVideo ? (
                  <p className="mt-2 text-sm text-muted-foreground dark:text-[#c4d4f4]/80">
                    No extra notes for this lesson.
                  </p>
                ) : null}
              </div>
            ) : null}

            {selected ? (
              <LessonQAPanel lessonId={selected.lesson.id} isInstructor={canAnswerLessonQA} />
            ) : null}
          </div>
        </main>

        <aside
          className={cn(
            "order-2 flex min-h-0 w-full min-w-0 shrink-0 flex-col overflow-hidden",
            "max-h-[min(36vh,340px)] border-t border-[#0B1F3A]/12 bg-white dark:border-white/20 dark:bg-[#0c1829]",
            "lg:order-1 lg:h-full lg:max-h-none lg:w-[min(100%,420px)] lg:max-w-[34vw] lg:border-t-0",
            "lg:border-r lg:border-[#0B1F3A]/12 lg:shadow-[4px_0_32px_-16px_rgba(232,93,4,0.14)] dark:lg:shadow-[6px_0_40px_-16px_rgba(0,0,0,0.45)]",
          )}
        >
          <CourseCurriculumSidebar
            variant="panel"
            groups={sectionGroups}
            activeLessonId={activeLessonId}
            progressByLesson={progressByLesson}
            polishLessonTitle={polishLessonTitle}
            formatDuration={formatDurationMinutes}
            onSelectLesson={selectLesson}
          />
        </aside>
      </div>
    </div>
  );
}

function LearnPageFallback() {
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:h-[calc(100dvh-3.5rem)] lg:flex-row">
      <div className="order-1 flex min-h-0 flex-1 flex-col lg:order-2">
        <div className="flex-1 space-y-4 p-4">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="aspect-video w-full" />
        </div>
      </div>
      <Skeleton className="order-2 hidden min-h-[200px] lg:order-1 lg:block lg:w-80 lg:shrink-0" />
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
