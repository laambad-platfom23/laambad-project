/** Student side of quizzes: take a quiz, get the score and feedback (no answer key before submitting). */
import apiClient from "./client";

export type CourseQuiz = {
  id: string;
  course_id: string;
  section_id: string | null;
  /** A6: where the quiz sits in the curriculum */
  section_title?: string | null;
  lesson_id?: string | null;
  lesson_title?: string | null;
  /** A6: sequential course, earlier lessons not completed yet */
  locked?: boolean;
  title: string;
  question_count: number;
  time_limit_secs: number;
  pass_percent: number;
  max_attempts: number;
  attempts_used: number;
  best_percent: number | null;
  passed: boolean;
};

export type QuizInfo = {
  id: string;
  title: string;
  description: string | null;
  section_id?: string | null;
  lesson_id?: string | null;
  course: { id: string; slug: string; title: string };
  time_limit_secs: number;
  pass_percent: number;
  max_attempts: number;
  question_count: number;
  total_points: number;
  attempts_used: number;
  attempts_left: number | null;
  best_percent: number | null;
  passed: boolean;
  open_attempt_id: string | null;
  history: { id: string; attempt_num: number; percent: number; score: number; max_score: number; passed: boolean; finished_at: string }[];
};

export type QuizToTake = {
  attempt_id: string;
  started_at: string;
  time_limit_secs: number;
  deadline: string | null;
  questions: { id: string; type: string; text: string; points: number; multiple: boolean; options: { key: string; text: string }[] }[];
};

export type QuizAttemptResult = {
  attempt_id: string;
  quiz_id: string;
  quiz_title: string;
  course: { id: string; slug: string };
  score: number;
  max_score: number;
  percent: number;
  pass_percent: number;
  passed: boolean;
  finished_at: string;
  answers_revealed: boolean;
  attempts_left: number | null;
  feedback:
    | {
        question_id: string;
        text: string;
        multiple: boolean;
        points: number;
        correct: boolean;
        chosen: string[];
        options: { key: string; text: string; chosen: boolean; correct?: boolean }[];
        explanation: string | null;
      }[]
    | null;
};

export const quizPlayApi = {
  courseQuizzes: (courseId: string) => apiClient.get<{ data: CourseQuiz[] }>(`/api/v1/courses/${courseId}/quizzes`, { params: { view: "take" } }),
  get: (quizId: string) => apiClient.get<QuizInfo>(`/api/v1/quizzes/${quizId}`, { params: { view: "take" } }),
  start: (quizId: string) => apiClient.post<QuizToTake>(`/api/v1/quizzes/${quizId}/attempts`),
  submit: (attemptId: string, answers: { question_id: string; keys: string[] }[]) =>
    apiClient.post<QuizAttemptResult>(`/api/v1/attempts/${attemptId}/submit`, { answers }),
  result: (attemptId: string) => apiClient.get<QuizAttemptResult>(`/api/v1/attempts/${attemptId}`),
};
