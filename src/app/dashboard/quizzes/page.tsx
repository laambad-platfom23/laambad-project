"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { quizzesApi } from "@/services/api/quizzes";
import { coursesApi } from "@/services/api/courses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  BrainCircuit,
  Clock,
  Target,
  Play,
  Trophy,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  RotateCcw,
  Timer,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import type {
  Quiz,
  Question,
  QuizAttempt,
  StartAttemptResponse,
  SubmitAnswerInput,
  Course,
  PaginatedResponse,
} from "@/types";
import { cn } from "@/lib/utils";

type ViewState =
  | { type: "list" }
  | { type: "quiz-detail"; quizId: string }
  | { type: "taking"; attemptId: string; questions: Question[]; quizTitle: string; timeLimitSecs: number; startedAt: string }
  | { type: "result"; attempt: QuizAttempt; quizTitle: string };

export default function QuizzesPage() {
  const [view, setView] = useState<ViewState>({ type: "list" });
  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const queryClient = useQueryClient();

  const { data: coursesResp, isLoading: loadingCourses } = useQuery<PaginatedResponse<Course>>({
    queryKey: ["my-courses"],
    queryFn: async () => {
      const res = await coursesApi.list(1, 100, true);
      return res.data;
    },
  });

  const { data: quizzesResp, isLoading: loadingQuizzes } = useQuery({
    queryKey: ["quizzes", selectedCourse],
    queryFn: async () => {
      if (!selectedCourse) return null;
      const res = await quizzesApi.listByCourse(selectedCourse);
      return res.data.data;
    },
    enabled: !!selectedCourse,
  });

  if (view.type === "taking") {
    return (
      <QuizTaker
        attemptId={view.attemptId}
        questions={view.questions}
        quizTitle={view.quizTitle}
        timeLimitSecs={view.timeLimitSecs}
        startedAt={view.startedAt}
        onFinish={(attempt) => {
          queryClient.invalidateQueries({ queryKey: ["quizzes"] });
          setView({ type: "result", attempt, quizTitle: view.quizTitle });
        }}
      />
    );
  }

  if (view.type === "result") {
    return (
      <QuizResult
        attempt={view.attempt}
        quizTitle={view.quizTitle}
        onBack={() => setView({ type: "list" })}
      />
    );
  }

  if (view.type === "quiz-detail") {
    return (
      <QuizDetail
        quizId={view.quizId}
        onBack={() => setView({ type: "list" })}
        onStart={(attemptId, questions, quizTitle, timeLimitSecs, startedAt) =>
          setView({ type: "taking", attemptId, questions, quizTitle, timeLimitSecs, startedAt })
        }
        onViewResult={(attempt, quizTitle) =>
          setView({ type: "result", attempt, quizTitle })
        }
      />
    );
  }

  const courses = coursesResp?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BrainCircuit className="h-7 w-7 text-primary" />
          Quizzes & Assessments
        </h1>
        <p className="text-muted-foreground mt-1">
          Test your knowledge and track your results.
        </p>
      </div>

      {/* Course Selector */}
      <div className="flex flex-wrap gap-2">
        {loadingCourses ? (
          <Skeleton className="h-9 w-40" />
        ) : (
          courses.map((c) => (
            <Button
              key={c.id}
              variant={selectedCourse === c.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCourse(c.id)}
            >
              {c.title}
            </Button>
          ))
        )}
      </div>

      {!selectedCourse && (
        <Card className="border-none shadow-sm">
          <CardContent className="py-16 text-center">
            <BrainCircuit className="h-12 w-12 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground mt-3">
              Select a course to view its quizzes.
            </p>
          </CardContent>
        </Card>
      )}

      {selectedCourse && loadingQuizzes && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      )}

      {selectedCourse && !loadingQuizzes && (
        <div className="space-y-3">
          {!quizzesResp?.length ? (
            <Card className="border-none shadow-sm">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No quizzes available for this course.
                </p>
              </CardContent>
            </Card>
          ) : (
            quizzesResp.map((quiz: Quiz) => (
              <Card
                key={quiz.id}
                className="border-none shadow-sm hover:shadow-md transition-all cursor-pointer group"
                onClick={() =>
                  setView({ type: "quiz-detail", quizId: quiz.id })
                }
              >
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <BrainCircuit className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">{quiz.title}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {quiz.time_limit_secs > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {Math.floor(quiz.time_limit_secs / 60)} min
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        Pass: {quiz.pass_percent}%
                      </span>
                      {quiz.max_attempts > 0 && (
                        <span>Max {quiz.max_attempts} attempts</span>
                      )}
                      {quiz.questions && (
                        <span>{quiz.questions.length} questions</span>
                      )}
                    </div>
                  </div>
                  {quiz.required_for_cert && (
                    <Badge variant="secondary" className="shrink-0">
                      Required for cert
                    </Badge>
                  )}
                  <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Quiz Detail (attempts history + start) ──
function QuizDetail({
  quizId,
  onBack,
  onStart,
  onViewResult,
}: {
  quizId: string;
  onBack: () => void;
  onStart: (attemptId: string, questions: Question[], quizTitle: string, timeLimitSecs: number, startedAt: string) => void;
  onViewResult: (attempt: QuizAttempt, quizTitle: string) => void;
}) {
  const { data: quiz, isLoading } = useQuery<Quiz>({
    queryKey: ["quiz", quizId],
    queryFn: async () => (await quizzesApi.get(quizId)).data,
  });

  const { data: attemptsResp } = useQuery({
    queryKey: ["quiz-attempts", quizId],
    queryFn: async () => (await quizzesApi.listAttempts(quizId)).data,
  });

  const startMutation = useMutation({
    mutationFn: () => quizzesApi.startAttempt(quizId),
    onSuccess: (res) => {
      const data: StartAttemptResponse = res.data;
      onStart(
        data.attempt.id,
        data.questions,
        quiz?.title ?? "Quiz",
        quiz?.time_limit_secs ?? 0,
        data.attempt.started_at
      );
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || "Failed to start quiz";
      toast.error(msg);
    },
  });

  const attempts = attemptsResp?.data ?? [];

  if (isLoading) {
    return <Skeleton className="h-64 rounded-xl" />;
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack}>
        &larr; Back to Quizzes
      </Button>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <BrainCircuit className="h-6 w-6 text-primary" />
            {quiz?.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {quiz?.description && (
            <p className="text-muted-foreground">{quiz.description}</p>
          )}

          <div className="flex flex-wrap gap-4 text-sm">
            {(quiz?.time_limit_secs ?? 0) > 0 && (
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{Math.floor((quiz?.time_limit_secs ?? 0) / 60)} minutes</span>
              </div>
            )}
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span>Pass: {quiz?.pass_percent}%</span>
            </div>
            {(quiz?.max_attempts ?? 0) > 0 && (
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                <RotateCcw className="h-4 w-4 text-muted-foreground" />
                <span>
                  {attempts.length}/{quiz?.max_attempts} attempts used
                </span>
              </div>
            )}
          </div>

          <Button
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
            className="mt-2"
          >
            <Play className="h-4 w-4 mr-2" />
            {startMutation.isPending ? "Starting..." : "Start Quiz"}
          </Button>
        </CardContent>
      </Card>

      {/* Attempt History */}
      {attempts.length > 0 && (
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Attempt History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {attempts.map((a: QuizAttempt) => (
                <div
                  key={a.id}
                  className="flex items-center gap-4 p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => onViewResult(a, quiz?.title ?? "Quiz")}
                >
                  {a.passed ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      Attempt #{a.attempt_num}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.finished_at
                        ? new Date(a.finished_at).toLocaleString()
                        : "In progress"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">
                      {Math.round(a.percent)}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.score}/{a.max_score} pts
                    </p>
                  </div>
                  <Badge
                    variant={a.passed ? "default" : "destructive"}
                    className={
                      a.passed
                        ? "bg-emerald-100 text-emerald-700 border-0"
                        : ""
                    }
                  >
                    {a.passed ? "Passed" : "Failed"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Quiz Taker (answering questions) ──
function QuizTaker({
  attemptId,
  questions,
  quizTitle,
  timeLimitSecs,
  startedAt,
  onFinish,
}: {
  attemptId: string;
  questions: Question[];
  quizTitle: string;
  timeLimitSecs: number;
  startedAt: string;
  onFinish: (attempt: QuizAttempt) => void;
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(() => {
    if (timeLimitSecs <= 0) return -1;
    const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
    return Math.max(0, timeLimitSecs - Math.floor(elapsed));
  });

  // Timer
  useState(() => {
    if (timeLimitSecs <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  });

  const submitMutation = useMutation({
    mutationFn: (answerInputs: SubmitAnswerInput[]) =>
      quizzesApi.submitAttempt(attemptId, answerInputs),
    onSuccess: (res) => onFinish(res.data),
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || "Submit failed";
      toast.error(msg);
    },
  });

  const handleSubmit = () => {
    const answerInputs: SubmitAnswerInput[] = Object.entries(answers).map(
      ([question_id, answer]) => ({ question_id, answer })
    );
    submitMutation.mutate(answerInputs);
  };

  const q = questions[currentIdx];
  if (!q) return null;

  const options: { label: string; value: string }[] = q.options
    ? (Array.isArray(q.options) ? q.options : JSON.parse(q.options as unknown as string))
    : [];

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{quizTitle}</h2>
        {timeLeft >= 0 && (
          <Badge
            variant={timeLeft < 60 ? "destructive" : "secondary"}
            className="text-sm px-3 py-1"
          >
            <Timer className="h-4 w-4 mr-1" />
            {formatTime(timeLeft)}
          </Badge>
        )}
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3">
        <Progress
          value={((currentIdx + 1) / questions.length) * 100}
          className="h-2"
        />
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {currentIdx + 1} / {questions.length}
        </span>
      </div>

      {/* Question Card */}
      <Card className="border-none shadow-md">
        <CardContent className="p-6 space-y-5">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
              {currentIdx + 1}
            </span>
            <div>
              <p className="font-medium text-base leading-relaxed">{q.text}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {q.points} point{q.points !== 1 ? "s" : ""} &middot;{" "}
                {q.type.replace("_", " ")}
              </p>
            </div>
          </div>

          {/* Answer input based on type */}
          {q.type === "multiple_choice" && (
            <div className="space-y-2">
              {options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() =>
                    setAnswers((prev) => ({ ...prev, [q.id]: opt.value }))
                  }
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-xl border transition-all",
                    answers[q.id] === opt.value
                      ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                      : "hover:bg-accent"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {q.type === "true_false" && (
            <div className="flex gap-3">
              {["true", "false"].map((val) => (
                <button
                  key={val}
                  onClick={() =>
                    setAnswers((prev) => ({ ...prev, [q.id]: val }))
                  }
                  className={cn(
                    "flex-1 px-4 py-3 rounded-xl border text-center font-medium transition-all capitalize",
                    answers[q.id] === val
                      ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                      : "hover:bg-accent"
                  )}
                >
                  {val}
                </button>
              ))}
            </div>
          )}

          {q.type === "short_answer" && (
            <input
              type="text"
              placeholder="Type your answer..."
              className="w-full border rounded-xl px-4 py-3 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
              value={answers[q.id] || ""}
              onChange={(e) =>
                setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          disabled={currentIdx === 0}
          onClick={() => setCurrentIdx((i) => i - 1)}
        >
          Previous
        </Button>

        <div className="flex gap-1">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIdx(i)}
              className={cn(
                "h-2.5 w-2.5 rounded-full transition-all",
                i === currentIdx
                  ? "bg-primary scale-125"
                  : answers[questions[i].id]
                  ? "bg-primary/40"
                  : "bg-muted-foreground/20"
              )}
            />
          ))}
        </div>

        {currentIdx < questions.length - 1 ? (
          <Button onClick={() => setCurrentIdx((i) => i + 1)}>Next</Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Send className="h-4 w-4 mr-2" />
            {submitMutation.isPending ? "Submitting..." : "Submit Quiz"}
          </Button>
        )}
      </div>

      {/* Answered count */}
      <p className="text-center text-xs text-muted-foreground">
        {Object.keys(answers).length} of {questions.length} answered
      </p>
    </div>
  );
}

// ── Quiz Result ──
function QuizResult({
  attempt,
  quizTitle,
  onBack,
}: {
  attempt: QuizAttempt;
  quizTitle: string;
  onBack: () => void;
}) {
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <Card className="border-none shadow-lg overflow-hidden">
        <div
          className={cn(
            "h-40 flex flex-col items-center justify-center text-white",
            attempt.passed
              ? "bg-emerald-600"
              : "bg-red-500"
          )}
        >
          {attempt.passed ? (
            <Trophy className="h-14 w-14 mb-2" />
          ) : (
            <AlertCircle className="h-14 w-14 mb-2" />
          )}
          <h2 className="text-2xl font-bold">
            {attempt.passed ? "Congratulations!" : "Keep Trying!"}
          </h2>
        </div>

        <CardContent className="p-6 space-y-6">
          <h3 className="text-center font-semibold text-lg">{quizTitle}</h3>

          {/* Score circle */}
          <div className="flex justify-center">
            <div
              className={cn(
                "h-28 w-28 rounded-full flex flex-col items-center justify-center border-4",
                attempt.passed
                  ? "border-emerald-500 text-emerald-600"
                  : "border-red-400 text-red-500"
              )}
            >
              <span className="text-3xl font-bold">
                {Math.round(attempt.percent)}%
              </span>
              <span className="text-xs text-muted-foreground">Score</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{attempt.score}</p>
              <p className="text-xs text-muted-foreground">Points</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{attempt.max_score}</p>
              <p className="text-xs text-muted-foreground">Max Score</p>
            </div>
            <div>
              <p className="text-2xl font-bold">#{attempt.attempt_num}</p>
              <p className="text-xs text-muted-foreground">Attempt</p>
            </div>
          </div>

          <Badge
            className={cn(
              "w-full justify-center py-2 text-sm",
              attempt.passed
                ? "bg-emerald-100 text-emerald-700 border-0"
                : "bg-red-100 text-red-700 border-0"
            )}
          >
            {attempt.passed ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Passed
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 mr-1" /> Not Passed
              </>
            )}
          </Badge>

          <Button variant="outline" className="w-full" onClick={onBack}>
            Back to Quizzes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
