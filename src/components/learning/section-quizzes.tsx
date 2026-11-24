"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BrainCircuit } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { quizPlayApi } from "@/services/api/quiz-play";
import { QuizPlayer } from "@/components/learning/quiz-player";
import { QuizRow } from "@/components/learning/quiz-row";

/** Quizzes of the section the learner is in (shown under the lesson); a quiz opens in a dialog. */
export function SectionQuizzes({ courseId, sectionId, sectionTitle }: { courseId: string; sectionId: string; sectionTitle: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["course-quizzes", courseId],
    queryFn: () => quizPlayApi.courseQuizzes(courseId).then((r) => r.data.data),
    staleTime: 60_000,
    retry: false,
  });
  const list = (data ?? []).filter((q) => q.section_id === sectionId);
  if (!list.length) return null;
  return (
    <div className="mt-3 shrink-0 overflow-hidden rounded-2xl border bg-card">
      <p className="flex items-center gap-2 border-b px-4 py-2.5 text-sm font-semibold">
        <BrainCircuit className="h-4 w-4 text-brand" />
        Quiz · {sectionTitle}
      </p>
      <ul className="divide-y">
        {list.map((q) => (
          <QuizRow key={q.id} q={q} onOpen={() => setOpenId(q.id)} />
        ))}
      </ul>
      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto p-0 sm:p-2">
          <DialogTitle className="sr-only">Quiz</DialogTitle>
          {openId ? <QuizPlayer quizId={openId} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
