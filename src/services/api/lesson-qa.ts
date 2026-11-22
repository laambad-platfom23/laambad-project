import apiClient from "./client";

export type LessonQuestion = {
  id: string;
  lesson_id: string;
  body: string;
  author_name: string;
  created_at: string;
  answer?: string | null;
  answerer_name?: string | null;
  answered_at?: string | null;
};

export const lessonQaApi = {
  /** Public — no auth required (published courses only). */
  list: (lessonId: string) =>
    apiClient.get<{ data: LessonQuestion[] }>(`/api/lessons/${encodeURIComponent(lessonId)}/questions`),

  ask: (lessonId: string, body: string) =>
    apiClient.post<{ data: LessonQuestion }>(`/api/v1/lessons/${encodeURIComponent(lessonId)}/questions`, {
      body,
    }),

  answer: (questionId: string, answer: string) =>
    apiClient.patch<{ data: { id: string; answered: boolean } }>(
      `/api/v1/lesson-questions/${encodeURIComponent(questionId)}`,
      { answer },
    ),
};
