import apiClient from "./client";
import type {
  Quiz,
  Question,
  QuizAttempt,
  StartAttemptResponse,
  SubmitAnswerInput,
  DataResponse,
} from "@/types";

export const quizzesApi = {
  // Quiz CRUD
  listByCourse: (courseId: string) =>
    apiClient.get<DataResponse<Quiz[]>>(`/api/v1/courses/${courseId}/quizzes`),

  get: (quizId: string) => apiClient.get<Quiz>(`/api/v1/quizzes/${quizId}`),

  create: (data: {
    course_id: string;
    title: string;
    description?: string;
    time_limit_secs?: number;
    pass_percent?: number;
    max_attempts?: number;
    shuffle_questions?: boolean;
    required_for_cert?: boolean;
  }) => apiClient.post<Quiz>("/api/v1/quizzes", data),

  update: (quizId: string, data: Partial<Quiz>) =>
    apiClient.patch<Quiz>(`/api/v1/quizzes/${quizId}`, data),

  delete: (quizId: string) => apiClient.delete(`/api/v1/quizzes/${quizId}`),

  // Questions
  addQuestion: (
    quizId: string,
    data: {
      type: string;
      text: string;
      explanation?: string;
      points?: number;
      sort_order?: number;
      options?: unknown;
      correct_answer?: string;
    }
  ) => apiClient.post<Question>(`/api/v1/quizzes/${quizId}/questions`, data),

  updateQuestion: (questionId: string, data: Partial<Question>) =>
    apiClient.patch<Question>(`/api/v1/questions/${questionId}`, data),

  deleteQuestion: (questionId: string) =>
    apiClient.delete(`/api/v1/questions/${questionId}`),

  // Attempts
  startAttempt: (quizId: string) =>
    apiClient.post<StartAttemptResponse>(`/api/v1/quizzes/${quizId}/attempts`),

  listAttempts: (quizId: string) =>
    apiClient.get<DataResponse<QuizAttempt[]>>(
      `/api/v1/quizzes/${quizId}/attempts`
    ),

  getAttempt: (attemptId: string) =>
    apiClient.get<QuizAttempt>(`/api/v1/attempts/${attemptId}`),

  submitAttempt: (attemptId: string, answers: SubmitAnswerInput[]) =>
    apiClient.post<QuizAttempt>(`/api/v1/attempts/${attemptId}/submit`, {
      answers,
    }),
};
