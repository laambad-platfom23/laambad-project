"use client";

import { Input } from "@/components/ui/input";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  Loader2,
  RotateCcw,
  XCircle,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { quizPlayApi, type QuizAttemptResult, type QuizToTake } from "@/services/api/quiz-play";
import { cn, formatDateTime, getApiErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

type Phase =
  | { kind: "intro" }
  | { kind: "taking"; attempt: QuizToTake }
  | { kind: "result"; result: QuizAttemptResult };

function fmtSecs(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** Take a quiz: intro → questions (one at a time, with timer) → score + feedback. */
export function QuizPlayer({ quizId, onClose }: { quizId: string; onClose?: () => void }) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [busy, setBusy] = useState(false);

  const info = useQuery({
    queryKey: ["quiz-play", quizId],
    queryFn: () => quizPlayApi.get(quizId).then((r) => r.data),
  });

  const start = async () => {
    setBusy(true);
    try {
      const { data } = await quizPlayApi.start(quizId);
      setPhase({ kind: "taking", attempt: data });
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not start the quiz"));
    } finally {
      setBusy(false);
    }
  };
  const openResult = async (attemptId: string) => {
    setBusy(true);
    try {
      const { data } = await quizPlayApi.result(attemptId);
      setPhase({ kind: "result", result: data });
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not open the result"));
    } finally {
      setBusy(false);
    }
  };

  if (phase.kind === "taking") {
    return (
      <QuizTaking
        attempt={phase.attempt}
        title={info.data?.title ?? "Quiz"}
        onSubmitted={(r) => {
          qc.invalidateQueries({ queryKey: ["quiz-play", quizId] });
          qc.invalidateQueries({ queryKey: ["course-quizzes"] });
          qc.invalidateQueries({ queryKey: ["learning-items"] });
          qc.invalidateQueries({ queryKey: ["my-streak"] });
          setPhase({ kind: "result", result: r });
        }}
      />
    );
  }
  if (phase.kind === "result") {
    return (
      <QuizResultView
        result={phase.result}
        // attempts_left comes with the result (counted after this attempt), not from the intro screen
        onRetry={(phase.result.attempts_left === null || phase.result.attempts_left > 0) && !phase.result.passed ? start : undefined}
        onBack={() => {
          info.refetch();
          setPhase({ kind: "intro" });
        }}
        busy={busy}
      />
    );
  }

  if (info.isLoading) return <Skeleton className="h-72 w-full rounded-2xl" />;
  if (info.isError || !info.data) {
    return (
      <div className="rounded-2xl border p-8 text-center text-sm text-muted-foreground">
        {getApiErrorMessage(info.error, "This quiz is not available.")}
      </div>
    );
  }
  const q = info.data;
  const noAttempts = q.attempts_left === 0;
  return (
    <div className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <HelpCircle className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quiz</p>
          <h2 className="text-xl font-bold leading-tight">{q.title}</h2>
        </div>
        {onClose ? (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
            Close
          </Button>
        ) : null}
      </div>

      {q.description ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{q.description}</p> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Questions" value={String(q.question_count)} />
        <Stat label="Pass mark" value={`${q.pass_percent}%`} />
        <Stat label="Time" value={q.time_limit_secs ? fmtSecs(q.time_limit_secs) : "No limit"} />
        <Stat
          label="Attempts"
          value={q.max_attempts ? `${q.attempts_used}/${q.max_attempts}` : `${q.attempts_used} used`}
        />
      </div>

      {q.best_percent !== null ? (
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl px-4 py-3 text-sm",
            q.passed ? "bg-success-soft text-success" : "bg-muted text-foreground"
          )}
        >
          {q.passed ? <Award className="h-5 w-5" /> : <History className="h-5 w-5" />}
          <span>
            Best score <strong>{Math.round(q.best_percent)}%</strong> — {q.passed ? "passed 🎉" : "not passed yet"}
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {q.open_attempt_id ? (
          <Button onClick={start} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Continue attempt
          </Button>
        ) : (
          <Button onClick={start} disabled={busy || noAttempts || q.question_count === 0}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {q.attempts_used ? "Start a new attempt" : "Start quiz"}
          </Button>
        )}
        {noAttempts ? <p className="self-center text-sm text-muted-foreground">You have used all attempts.</p> : null}
      </div>

      {q.history.length ? (
        <div>
          <p className="mb-2 text-sm font-semibold">Your attempts</p>
          <ul className="divide-y rounded-xl border text-sm">
            {q.history.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => openResult(h.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50"
                >
                  {h.passed ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
                  <span className="font-medium">Attempt {h.attempt_num}</span>
                  <span className="text-muted-foreground">{formatDateTime(h.finished_at)}</span>
                  <span className="ml-auto font-semibold">{Math.round(h.percent)}%</span>
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
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function QuizTaking({
  attempt,
  title,
  onSubmitted,
}: {
  attempt: QuizToTake;
  title: string;
  onSubmitted: (r: QuizAttemptResult) => void;
}) {
  const storeKey = `quiz-answers:${attempt.attempt_id}`;
  const [answers, setAnswers] = useState<Record<string, string[]>>(() => {
    try {
      return JSON.parse(localStorage.getItem(storeKey) || "{}");
    } catch {
      return {};
    }
  });
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  // the countdown's auto-submit runs from an effect created once: it must read the LATEST answers
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submittingRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(storeKey, JSON.stringify(answers));
    } catch {
      /* private mode */
    }
  }, [answers, storeKey]);

  const submit = async (auto = false) => {
    if (submittingRef.current) return;
    const current = answersRef.current;
    const unanswered = attempt.questions.filter((q) => !(current[q.id]?.length)).length;
    if (!auto && unanswered && !window.confirm(`${unanswered} question(s) not answered. Submit anyway?`)) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const { data } = await quizPlayApi.submit(
        attempt.attempt_id,
        attempt.questions.map((q) =>
          q.short
            ? { question_id: q.id, keys: [], answer: (answersRef.current[q.id]?.[0] ?? "").trim() }
            : { question_id: q.id, keys: answersRef.current[q.id] ?? [] }
        )
      );
      try {
        localStorage.removeItem(storeKey);
      } catch {
        /* ignore */
      }
      if (auto) toast.message("Time is up — your answers were submitted.");
      const certId = (data as { certificate_id?: string | null }).certificate_id;
      if (certId) {
        toast.success("🎓 Course completed — your certificate is ready!", {
          duration: 12000,
          action: { label: "View certificate", onClick: () => window.location.assign(`/dashboard/certificates/${certId}`) },
        });
      }
      onSubmitted(data);
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not submit the quiz"));
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // countdown
  useEffect(() => {
    if (!attempt.deadline) return;
    const end = new Date(attempt.deadline).getTime();
    const tick = () => {
      const s = Math.max(0, Math.round((end - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) void submit(true);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt.deadline]);

  const q = attempt.questions[index];
  const answered = attempt.questions.filter((x) => (answers[x.id] ?? []).some((v) => String(v).trim())).length;
  const choose = (key: string) =>
    setAnswers((cur) => {
      const now = cur[q.id] ?? [];
      if (q.multiple) return { ...cur, [q.id]: now.includes(key) ? now.filter((k) => k !== key) : [...now, key] };
      return { ...cur, [q.id]: [key] };
    });

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate font-semibold">{title}</p>
        {left !== null ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold tabular-nums",
              left <= 60 ? "bg-destructive/10 text-destructive" : "bg-muted"
            )}
          >
            <Clock className="h-4 w-4" /> {fmtSecs(left)}
          </span>
        ) : null}
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            Question {index + 1} of {attempt.questions.length}
          </span>
          <span>{answered} answered</span>
        </div>
        <Progress value={((index + 1) / attempt.questions.length) * 100} className="h-1.5" />
      </div>

      <div>
        <p className="whitespace-pre-wrap text-lg font-semibold leading-snug">{q.text}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {q.short ? "Type your answer" : q.multiple ? "Select all answers that apply" : "Choose one answer"} · {q.points} {q.points === 1 ? "point" : "points"}
        </p>
      </div>

      {q.short ? (
        <Input
          key={q.id}
          value={answers[q.id]?.[0] ?? ""}
          onChange={(e) => setAnswers((cur) => ({ ...cur, [q.id]: e.target.value ? [e.target.value] : [] }))}
          placeholder="Your answer"
          maxLength={500}
          className="h-12 text-[15px]"
          autoFocus
        />
      ) : null}
      <div className="space-y-2">
        {q.options.map((o) => {
          const on = (answers[q.id] ?? []).includes(o.key);
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => choose(o.key)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-[15px] transition",
                on ? "border-brand bg-brand-soft font-medium" : "hover:bg-muted/60"
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center border-2",
                  q.multiple ? "rounded-md" : "rounded-full",
                  on ? "border-brand bg-brand text-white" : "border-muted-foreground/40"
                )}
              >
                {on ? <span className={cn("bg-white", q.multiple ? "h-2 w-2 rounded-sm" : "h-2 w-2 rounded-full")} /> : null}
              </span>
              <span className="whitespace-pre-wrap">{o.text}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <Button variant="outline" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>
        <div className="hidden flex-wrap justify-center gap-1 sm:flex">
          {attempt.questions.map((x, i) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Question ${i + 1}`}
              className={cn(
                "h-7 w-7 rounded-md text-xs font-semibold",
                i === index ? "bg-brand text-white" : answers[x.id]?.length ? "bg-brand-soft text-brand" : "bg-muted text-muted-foreground"
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
        {index < attempt.questions.length - 1 ? (
          <Button onClick={() => setIndex((i) => i + 1)}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={() => submit(false)} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Submit quiz
          </Button>
        )}
      </div>
    </div>
  );
}

function QuizResultView({
  result,
  onRetry,
  onBack,
  busy,
}: {
  result: QuizAttemptResult;
  onRetry?: () => void;
  onBack: () => void;
  busy: boolean;
}) {
  const rightCount = useMemo(() => result.feedback?.filter((f) => f.correct).length ?? 0, [result]);
  return (
    <div className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
      <div className={cn("rounded-2xl p-6 text-center", result.passed ? "bg-success-soft" : "bg-destructive/10")}>
        {result.passed ? (
          <Award className="mx-auto h-12 w-12 text-success" />
        ) : (
          <XCircle className="mx-auto h-12 w-12 text-destructive" />
        )}
        <p className="mt-2 text-4xl font-extrabold">{Math.round(result.percent)}%</p>
        <p className="mt-1 font-semibold">{result.passed ? "Passed — well done!" : `Not passed — you need ${result.pass_percent}%`}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {result.score} / {result.max_score} points
          {result.feedback ? ` · ${rightCount} of ${result.feedback.length} correct` : ""}
        </p>
      </div>

      {result.feedback ? (
        <div className="space-y-3">
          {!result.answers_revealed ? (
            <p className="rounded-xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">
              You can see which answers were right or wrong. The correct answers are shown after you pass or use all attempts.
            </p>
          ) : null}
          {result.feedback.map((f, i) => (
            <div key={f.question_id} className={cn("rounded-xl border p-4", f.correct ? "border-success/40" : "border-destructive/40")}>
              <div className="flex items-start gap-2">
                {f.correct ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                ) : (
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                )}
                <p className="font-medium">
                  {/^\d+\s*[.)]/.test(f.text) ? f.text : `${i + 1}. ${f.text}`}
                </p>
              </div>
              {f.short ? (
                <div className="mt-2 space-y-1 pl-7 text-sm">
                  <p className={cn("rounded-lg px-3 py-1.5", f.correct ? "bg-success-soft font-medium text-success" : "bg-destructive/10 text-destructive")}>
                    ➜ Your answer: {f.chosen[0] ? `“${f.chosen[0]}”` : "(no answer)"}
                  </p>
                  {f.options.length ? (
                    <p className="rounded-lg bg-success-soft px-3 py-1.5 font-medium text-success">
                      Accepted: {f.options.map((o) => o.text).join(" · ")} ✓
                    </p>
                  ) : null}
                </div>
              ) : null}
              <ul className={cn("mt-2 space-y-1 pl-7 text-sm", f.short && "hidden")}>
                {f.options.map((o) => (
                  <li
                    key={o.key}
                    className={cn(
                      "rounded-lg px-3 py-1.5",
                      o.correct === true && "bg-success-soft font-medium text-success",
                      o.chosen && o.correct === false && "bg-destructive/10 text-destructive",
                      o.chosen && o.correct === undefined && "bg-muted font-medium"
                    )}
                  >
                    {o.chosen ? "➜ " : ""}
                    {o.text}
                    {o.correct === true ? " ✓" : ""}
                  </li>
                ))}
              </ul>
              {f.explanation ? <p className="mt-2 pl-7 text-sm text-muted-foreground">💡 {f.explanation}</p> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground">This attempt was made on the old site — only the score was kept.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onBack}>
          Back to quiz
        </Button>
        {onRetry ? (
          <Button onClick={onRetry} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}
