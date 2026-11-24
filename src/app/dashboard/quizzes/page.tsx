"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BrainCircuit, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { dashboardApi } from "@/services/api/dashboard";
import { quizPlayApi } from "@/services/api/quiz-play";
import { QuizPlayer } from "@/components/learning/quiz-player";
import { QuizRow } from "@/components/learning/quiz-row";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";

/** Student quiz hub: every quiz of the courses the student has access to, with best score and status. */
function QuizzesInner() {
  const router = useRouter();
  const params = useSearchParams();
  const openQuiz = params.get("quiz");
  const userId = useAuthStore((s) => s.user?.id ?? "");

  const { data: overview, isLoading } = useQuery({
    queryKey: ["dashboard-overview", userId],
    queryFn: () => dashboardApi.overview().then((r) => r.data),
    enabled: !!userId,
  });
  const courses = (overview?.courses ?? []).filter((c) => c.payment_status === "paid");

  if (openQuiz) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/quizzes")}>
          <ArrowLeft className="h-4 w-4" /> All quizzes
        </Button>
        <QuizPlayer quizId={openQuiz} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BrainCircuit className="h-7 w-7 text-primary" />
          Quizzes
        </h1>
        <p className="mt-1 text-muted-foreground">Test your knowledge. Your score and feedback appear right after you submit.</p>
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : !courses.length ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-sm text-muted-foreground">Enroll in a course to see its quizzes.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {courses.map((c) => (
            <CourseQuizzes
              key={c.course_id}
              courseId={c.course_id}
              title={c.course_title}
              onOpen={(id) => router.push(`/dashboard/quizzes?quiz=${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseQuizzes({ courseId, title, onOpen }: { courseId: string; title: string; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["course-quizzes", courseId],
    queryFn: () => quizPlayApi.courseQuizzes(courseId).then((r) => r.data.data),
    staleTime: 60_000,
  });
  const list = data ?? [];
  if (!isLoading && list.length === 0) return null; // courses without quizzes are not listed
  const passed = list.filter((q) => q.passed).length;
  return (
    <div className="rounded-xl border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">
            {isLoading ? "Loading…" : `${list.length} ${list.length === 1 ? "quiz" : "quizzes"} · ${passed} passed`}
          </p>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {open ? (
        <ul className="divide-y border-t">
          {list.map((q) => (
            <QuizRow key={q.id} q={q} onOpen={() => onOpen(q.id)} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function QuizzesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
      <QuizzesInner />
    </Suspense>
  );
}
