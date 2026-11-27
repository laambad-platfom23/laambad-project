"use client";

import { Award, CheckCircle2, Circle, Clock, HelpCircle, Lock } from "lucide-react";
import type { CourseQuiz } from "@/services/api/quiz-play";
import { cn } from "@/lib/utils";

/** One quiz in a list: status icon, where it sits, size, pass mark, time and best score. */
export function QuizRow({ q, onOpen }: { q: CourseQuiz; onOpen: () => void }) {
  const place = q.lesson_title ?? q.section_title ?? null;
  return (
    <li>
      <button type="button" onClick={onOpen} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50", q.locked && "opacity-70")}>
        {q.locked ? (
          <Lock className="h-5 w-5 shrink-0 text-muted-foreground" />
        ) : q.passed ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
        ) : q.attempts_used ? (
          <HelpCircle className="h-5 w-5 shrink-0 text-warning" />
        ) : (
          <Circle className="h-5 w-5 shrink-0 text-muted-foreground/50" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{q.title}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {place ? <span className="max-w-[28ch] truncate">{place} ·</span> : null}
            <span>{q.question_count} questions</span>
            <span>· pass {q.pass_percent}%</span>
            {q.time_limit_secs ? (
              <span className="inline-flex items-center gap-0.5">
                · <Clock className="h-3 w-3" /> {Math.round(q.time_limit_secs / 60)} min
              </span>
            ) : null}
          </p>
        </div>
        {q.locked ? (
          <span className="text-xs text-muted-foreground">Locked</span>
        ) : q.best_percent !== null ? (
          <span className={cn("inline-flex items-center gap-1 text-sm font-semibold", q.passed ? "text-success" : "text-muted-foreground")}>
            {q.passed ? <Award className="h-4 w-4" /> : null}
            {Math.round(q.best_percent)}%
          </span>
        ) : (
          <span className="text-xs font-medium text-brand">Start</span>
        )}
      </button>
    </li>
  );
}
