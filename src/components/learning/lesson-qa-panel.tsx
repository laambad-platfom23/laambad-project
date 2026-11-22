"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircleQuestion, Send, UserCircle2 } from "lucide-react";
import { lessonQaApi, type LessonQuestion } from "@/services/api/lesson-qa";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  lessonId: string | null;
  isInstructor: boolean;
};

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function LessonQAPanel({ lessonId, isInstructor }: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ["lesson-qa", lessonId],
    // never resolve to undefined (react-query rejects it): accept { data: [] } or a bare array
    queryFn: () =>
      lessonQaApi.list(lessonId!).then((r) => {
        const d = r.data as unknown;
        if (Array.isArray(d)) return d as LessonQuestion[];
        return ((d as { data?: LessonQuestion[] } | null)?.data ?? []) as LessonQuestion[];
      }),
    enabled: !!lessonId,
    staleTime: 30 * 1000,
  });

  const askMutation = useMutation({
    mutationFn: () => lessonQaApi.ask(lessonId!, draft.trim()),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["lesson-qa", lessonId] });
      toast.success("Question posted");
    },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, "Could not post question")),
  });

  const answerMutation = useMutation({
    mutationFn: ({ questionId, text }: { questionId: string; text: string }) =>
      lessonQaApi.answer(questionId, text),
    onSuccess: (_, v) => {
      setAnswerDrafts((m) => {
        const n = { ...m };
        delete n[v.questionId];
        return n;
      });
      queryClient.invalidateQueries({ queryKey: ["lesson-qa", lessonId] });
      toast.success("Answer published — visible to everyone");
    },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, "Could not save answer")),
  });

  if (!lessonId) return null;

  return (
    <section
      className={cn(
        "mt-4 flex min-h-0 flex-col rounded-2xl border border-[#0B1F3A]/12 bg-white/95 shadow-[0_12px_40px_-24px_rgba(11,31,58,0.18)]",
        "dark:border-white/25 dark:bg-[#132948]/90",
      )}
    >
      <div className="flex items-center gap-2 border-b border-[#0B1F3A]/10 px-4 py-3 dark:border-white/20">
        <MessageCircleQuestion className="h-5 w-5 shrink-0 text-[#0B1F3A] dark:text-[#FF8A66]" aria-hidden />
        <div>
          <h3 className="text-sm font-bold tracking-tight text-[#0f172a] dark:text-white">Lesson Q&amp;A</h3>
          <p className="text-[11px] text-muted-foreground dark:text-[#c4d4f4]/85">
            Ask the instructor. Answers are public for this published course.
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 p-4">
        <div>
          <Textarea
            placeholder="Type your question about this lesson…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="resize-y border-[#0B1F3A]/15 bg-[#f8fafc] text-sm dark:border-white/25 dark:bg-[#0d1f35]/80"
            disabled={askMutation.isPending}
          />
          <Button
            type="button"
            size="sm"
            className="mt-2 gap-1.5 bg-[#0B1F3A] font-semibold text-white hover:bg-[#0B1F3A]/90 dark:bg-[#0B1F3A] dark:text-white dark:hover:bg-[#123252]"
            disabled={askMutation.isPending || !draft.trim()}
            onClick={() => askMutation.mutate()}
          >
            {askMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Post question
          </Button>
        </div>

        <div className="border-t border-dashed border-[#0B1F3A]/12 pt-3 dark:border-white/20">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Questions &amp; answers
          </p>
          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : isError ? (
            <p className="py-4 text-sm text-destructive">Could not load questions.</p>
          ) : !data?.length ? (
            <p className="py-4 text-sm text-muted-foreground">No questions yet — be the first to ask.</p>
          ) : (
            <ul className="mt-2 max-h-[min(50vh,420px)] space-y-4 overflow-y-auto pr-1">
              {data.map((q) => (
                <li
                  key={q.id}
                  className="rounded-xl border border-[#0B1F3A]/10 bg-[#f8fafc]/90 p-3 dark:border-white/20 dark:bg-[#0d1f35]/60"
                >
                  <div className="flex gap-2">
                    <UserCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0B1F3A]/60 dark:text-white/75" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">{q.author_name}</span>
                        <span className="text-muted-foreground/80"> · {formatWhen(q.created_at)}</span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{q.body}</p>
                      {q.answer ? (
                        <div className="mt-3 rounded-lg border border-l-4 border-[#E84A27]/40 bg-[#0B1F3A]/[0.06] px-3 py-2.5 dark:bg-[#E84A27]/10">
                          <p className="text-[11px] font-semibold text-[#0B1F3A] dark:text-[#FF8A66]">
                            {q.answerer_name ?? "Instructor"}
                            {q.answered_at ? (
                              <span className="font-normal text-muted-foreground">
                                {" "}
                                · {formatWhen(q.answered_at)}
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{q.answer}</p>
                        </div>
                      ) : isInstructor ? (
                        <div className="mt-3 space-y-2">
                          <Textarea
                            placeholder="Write your public answer…"
                            value={answerDrafts[q.id] ?? ""}
                            onChange={(e) =>
                              setAnswerDrafts((m) => ({ ...m, [q.id]: e.target.value }))
                            }
                            rows={3}
                            className="text-sm dark:bg-[#0d1f35]/80"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="border-[#E84A27]/40 bg-[#0B1F3A]/15 font-semibold text-white hover:bg-[#123252]/25 dark:text-[#FF8A66]"
                            disabled={
                              answerMutation.isPending || !(answerDrafts[q.id] ?? "").trim()
                            }
                            onClick={() =>
                              answerMutation.mutate({
                                questionId: q.id,
                                text: (answerDrafts[q.id] ?? "").trim(),
                              })
                            }
                          >
                            {answerMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : null}
                            Post answer (public)
                          </Button>
                        </div>
                      ) : (
                        <p className="mt-2 text-[11px] italic text-muted-foreground">
                          Waiting for instructor reply…
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
