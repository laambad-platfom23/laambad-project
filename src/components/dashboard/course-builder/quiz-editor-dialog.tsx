"use client";

import { PositionSelect, positionPayload, positionValue, type TopicOption } from "@/components/dashboard/course-builder/position-select";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowUp, BrainCircuit, CheckCircle2, Circle, Loader2, Plus, Square, SquareCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { staffQuizApi, type EditorQuestion, type QuestionType } from "@/services/api/course-items";
import { cn, getApiErrorMessage } from "@/lib/utils";

type Q = EditorQuestion & { key: string };

const TYPE_LABEL: Record<QuestionType, string> = {
  single_choice: "One correct answer",
  multiple_choice: "Several correct answers",
  true_false: "True / False",
  short_answer: "Short answer (typed)",
};

const key = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

function newQuestion(type: QuestionType = "single_choice"): Q {
  return {
    key: key(),
    type,
    text: "",
    explanation: null,
    points: 1,
    options:
      type === "short_answer"
        ? [{ text: "", correct: true }]
        : type === "true_false"
        ? [
            { text: "True", correct: true },
            { text: "False", correct: false },
          ]
        : [
            { text: "", correct: true },
            { text: "", correct: false },
            { text: "", correct: false },
          ],
  };
}

/** Same rules as the server, so mistakes show before saving. */
function problem(qs: Q[], title: string, published: boolean): string | null {
  if (!title.trim()) return "Give the quiz a title.";
  if (published && qs.length === 0) return "Add at least one question, or switch “Published” off to save a draft.";
  for (const [i, q] of qs.entries()) {
    const where = `Question ${i + 1}`;
    if (!q.text.trim()) return `${where}: write the question.`;
    if (q.type === "short_answer") {
      if (!q.options.some((o) => o.text.trim())) return `${where}: write the accepted answer.`;
      continue;
    }
    if (q.options.length < 2) return `${where}: add at least 2 answers.`;
    if (q.options.some((o) => !o.text.trim())) return `${where}: an answer is empty.`;
    const correct = q.options.filter((o) => o.correct).length;
    if (!correct) return `${where}: mark the correct answer.`;
    if (q.type !== "multiple_choice" && correct > 1) return `${where}: only one answer can be correct.`;
  }
  return null;
}

export function QuizEditorDialog({
  open,
  onOpenChange,
  courseId,
  quizId,
  lessonId,
  sectionId,
  topics,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  courseId: string;
  /** null = a new quiz: after `lessonId`, or at the end of topic `sectionId` */
  quizId: string | null;
  lessonId: string | null;
  sectionId?: string | null;
  topics: TopicOption[];
  onSaved: () => void;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["staff-quiz", quizId],
    queryFn: () => staffQuizApi.get(quizId!).then((r) => r.data),
    enabled: open && !!quizId,
    staleTime: 0,
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [minutes, setMinutes] = useState("0");
  const [pass, setPass] = useState("60");
  const [attempts, setAttempts] = useState("0");
  const [shuffle, setShuffle] = useState(false);
  const [published, setPublished] = useState(true);
  const [pos, setPos] = useState<string>("");
  const [questions, setQuestions] = useState<Q[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!quizId) {
      setTitle("");
      setDescription("");
      setMinutes("0");
      setPass("60");
      setAttempts("0");
      setShuffle(false);
      setPublished(true);
      setPos(positionValue({ lesson_id: lessonId, section_id: sectionId }));
      setQuestions([newQuestion()]);
    } else if (data) {
      setTitle(data.title);
      setDescription(data.description ?? "");
      setMinutes(String(Math.round(data.time_limit_secs / 60)));
      setPass(String(data.pass_percent));
      setAttempts(String(data.max_attempts));
      setShuffle(data.shuffle_questions);
      setPublished(data.published);
      setPos(positionValue(data));
      setQuestions(data.questions.map((q) => ({ ...q, key: key() })));
    }
  }, [open, quizId, data, lessonId, sectionId]);

  const update = (k: string, patch: Partial<Q>) => setQuestions((cur) => cur.map((q) => (q.key === k ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) =>
    setQuestions((cur) => {
      const j = i + d;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const setType = (q: Q, type: QuestionType) => {
    if (type === q.type) return;
    if (type === "short_answer") {
      update(q.key, { type, options: [{ text: "", correct: true }] });
      return;
    }
    if (q.type === "short_answer") {
      update(q.key, { type, options: newQuestion(type).options });
      return;
    }
    if (type === "true_false") {
      update(q.key, { type, options: [{ text: "True", correct: true }, { text: "False", correct: false }] });
      return;
    }
    let options = q.type === "true_false" ? newQuestion().options : q.options;
    if (type === "single_choice" && options.filter((o) => o.correct).length > 1) {
      const first = options.findIndex((o) => o.correct);
      options = options.map((o, i) => ({ ...o, correct: i === first }));
    }
    update(q.key, { type, options });
  };

  const toggleCorrect = (q: Q, i: number) => {
    if (q.type === "multiple_choice") {
      update(q.key, { options: q.options.map((o, k) => (k === i ? { ...o, correct: !o.correct } : o)) });
    } else {
      update(q.key, { options: q.options.map((o, k) => ({ ...o, correct: k === i })) });
    }
  };

  const save = async () => {
    const p = problem(questions, title, published);
    if (p) {
      toast.error(p);
      return;
    }
    const place = positionPayload(pos);
    if (!place) {
      toast.error("Choose the topic of this quiz and where it goes.");
      return;
    }
    setSaving(true);
    const payload = {
      course_id: courseId,
      ...place,
      title: title.trim(),
      description: description.trim(),
      time_limit_secs: Math.max(0, Math.round(Number(minutes) || 0)) * 60,
      pass_percent: Math.min(100, Math.max(0, Number(pass) || 0)),
      max_attempts: Math.max(0, Math.round(Number(attempts) || 0)),
      shuffle_questions: shuffle,
      published,
      questions: questions.map(({ key: _k, ...q }) => ({
        ...q,
        text: q.text.trim(),
        explanation: q.explanation?.trim() || null,
        options: q.options.map((o) => ({ text: o.text.trim(), correct: o.correct })),
      })),
    };
    try {
      if (quizId) await staffQuizApi.save(quizId, payload);
      else await staffQuizApi.create(payload);
      toast.success(quizId ? "Quiz saved" : "Quiz added to the lesson");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not save the quiz"));
    } finally {
      setSaving(false);
    }
  };

  const totalPoints = questions.reduce((s, q) => s + (Number(q.points) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="flex max-h-[94dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <div className="border-b px-5 py-4 sm:px-6">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <BrainCircuit className="h-5 w-5 text-brand" />
              {quizId ? "Edit quiz" : "New quiz"}
            </DialogTitle>
            <DialogDescription>Students see the quiz under its lesson and in the course&apos;s Quizzes tab. It is marked automatically.</DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:px-6">
          {quizId && isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : quizId && isError ? (
            <p className="text-sm text-destructive">{getApiErrorMessage(error, "Could not load the quiz")}</p>
          ) : (
            <>
              {data?.attempt_count ? (
                <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                  Students have already taken this quiz ({data.attempt_count} attempts). Their scores stay as they are; changing the
                  questions changes how their past answers are shown.
                </p>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="qz-title">Quiz title</Label>
                  <Input id="qz-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chapter 1 quiz" maxLength={255} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="qz-desc">Instructions (optional)</Label>
                  <Textarea id="qz-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the quiz covers, rules…" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Topic and position</Label>
                  <PositionSelect value={pos} onChange={setPos} topics={topics} />
                  <p className="text-xs text-muted-foreground">Quizzes belong to a topic: right after one of its lessons, or at its end.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qz-time">Time limit (minutes, 0 = none)</Label>
                  <Input id="qz-time" type="number" min={0} max={1440} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qz-pass">Pass mark (%)</Label>
                  <Input id="qz-pass" type="number" min={0} max={100} value={pass} onChange={(e) => setPass(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qz-att">Attempts allowed (0 = unlimited)</Label>
                  <Input id="qz-att" type="number" min={0} max={100} value={attempts} onChange={(e) => setAttempts(e.target.value)} />
                </div>
                <div className="flex flex-col justify-end gap-2">
                  <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                    Shuffle questions
                    <Switch checked={shuffle} onCheckedChange={setShuffle} />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                    <span>
                      Published <span className="text-xs text-muted-foreground">(students can take it)</span>
                    </span>
                    <Switch checked={published} onCheckedChange={setPublished} />
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border-t pt-4">
                <p className="text-sm font-semibold">
                  Questions <span className="font-normal text-muted-foreground">· {questions.length} · {totalPoints} points</span>
                </p>
              </div>

              <ol className="space-y-4">
                {questions.map((q, i) => (
                  <li key={q.key} className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
                      <Select value={q.type} onValueChange={(v) => setType(q, v as QuestionType)}>
                        <SelectTrigger className="h-9 w-[210px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
                            <SelectItem key={t} value={t}>
                              {TYPE_LABEL[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        Points
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={q.points}
                          onChange={(e) => update(q.key, { points: Number(e.target.value) })}
                          className="h-9 w-20"
                        />
                      </label>
                      <div className="ml-auto flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={i === questions.length - 1}
                          onClick={() => move(i, 1)}
                          aria-label="Move down"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setQuestions((cur) => cur.filter((x) => x.key !== q.key))}
                          aria-label="Delete question"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      rows={2}
                      value={q.text}
                      onChange={(e) => update(q.key, { text: e.target.value })}
                      placeholder="Write the question…"
                      className="mt-3 bg-background"
                    />
                    {q.type === "short_answer" ? (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          Accepted answers — the student types the answer; any of these counts as correct (capital letters, spaces and a final full stop do not matter)
                        </p>
                        {q.options.map((o, k) => (
                          <div key={k} className="flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                            <Input
                              value={o.text}
                              onChange={(e) => update(q.key, { options: q.options.map((x, j) => (j === k ? { ...x, text: e.target.value, correct: true } : x)) })}
                              placeholder={k === 0 ? "The correct answer, e.g. Mogadishu" : "Another accepted spelling, e.g. Muqdisho"}
                              className="border-success/50 bg-background"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              disabled={q.options.length <= 1}
                              onClick={() => update(q.key, { options: q.options.filter((_, j) => j !== k) })}
                              aria-label="Remove accepted answer"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        {q.options.length < 12 ? (
                          <Button type="button" variant="ghost" size="sm" onClick={() => update(q.key, { options: [...q.options, { text: "", correct: true }] })}>
                            <Plus className="h-3.5 w-3.5" /> Another accepted answer
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    <p className={cn("mt-3 text-xs font-medium text-muted-foreground", q.type === "short_answer" && "hidden")}>
                      {q.type === "multiple_choice" ? "Answers — tick every correct one" : "Answers — click the correct one"}
                    </p>
                    <ul className={cn("mt-1.5 space-y-2", q.type === "short_answer" && "hidden")}>
                      {q.options.map((o, k) => (
                        <li key={k} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleCorrect(q, k)}
                            className={cn("shrink-0 rounded-full", o.correct ? "text-success" : "text-muted-foreground/60 hover:text-muted-foreground")}
                            aria-label={o.correct ? "Correct answer" : "Mark as correct"}
                            title={o.correct ? "Correct answer" : "Mark as correct"}
                          >
                            {q.type === "multiple_choice" ? (
                              o.correct ? <SquareCheck className="h-5 w-5" /> : <Square className="h-5 w-5" />
                            ) : o.correct ? (
                              <CheckCircle2 className="h-5 w-5" />
                            ) : (
                              <Circle className="h-5 w-5" />
                            )}
                          </button>
                          {q.type === "true_false" ? (
                            <span className={cn("flex-1 rounded-md border bg-background px-3 py-2 text-sm", o.correct && "border-success/50 font-semibold")}>{o.text}</span>
                          ) : (
                            <Input
                              value={o.text}
                              onChange={(e) =>
                                update(q.key, { options: q.options.map((x, j) => (j === k ? { ...x, text: e.target.value } : x)) })
                              }
                              placeholder={`Answer ${k + 1}`}
                              className={cn("bg-background", o.correct && "border-success/50")}
                            />
                          )}
                          {q.type !== "true_false" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              disabled={q.options.length <= 2}
                              onClick={() => {
                                const options = q.options.filter((_, j) => j !== k);
                                if (!options.some((x) => x.correct) && options.length) options[0] = { ...options[0], correct: true };
                                update(q.key, { options });
                              }}
                              aria-label="Remove answer"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {q.type !== "true_false" && q.type !== "short_answer" && q.options.length < 12 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-1"
                        onClick={() => update(q.key, { options: [...q.options, { text: "", correct: false }] })}
                      >
                        <Plus className="h-3.5 w-3.5" /> Add answer
                      </Button>
                    ) : null}
                    <Input
                      value={q.explanation ?? ""}
                      onChange={(e) => update(q.key, { explanation: e.target.value })}
                      placeholder="Explanation shown after the quiz (optional)"
                      className="mt-2 bg-background text-sm"
                    />
                  </li>
                ))}
              </ol>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setQuestions((cur) => [...cur, newQuestion()])}>
                  <Plus className="h-4 w-4" /> Add question
                </Button>
                <Button type="button" variant="ghost" onClick={() => setQuestions((cur) => [...cur, newQuestion("true_false")])}>
                  <Plus className="h-4 w-4" /> True / False question
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t bg-muted/20 px-5 py-3 sm:px-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving || (!!quizId && !data)} className="bg-brand text-white hover:bg-brand-hover">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {quizId ? "Save quiz" : "Add quiz"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
