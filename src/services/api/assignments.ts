import apiClient from "./client";
import type {
  Assignment,
  CreateAssignmentInput,
  Submission,
  DataResponse,
} from "@/types";

export const assignmentsApi = {
  listForCourse: (courseId: string) =>
    apiClient.get<DataResponse<Assignment[]>>(
      `/api/v1/courses/${courseId}/assignments`
    ),

  get: (assignmentId: string) =>
    apiClient.get<Assignment>(`/api/v1/assignments/${assignmentId}`),

  createForCourse: (courseId: string, data: CreateAssignmentInput) =>
    apiClient.post<Assignment>(
      `/api/v1/courses/${courseId}/assignments`,
      data
    ),

  update: (assignmentId: string, data: Partial<CreateAssignmentInput>) =>
    apiClient.patch<Assignment>(`/api/v1/assignments/${assignmentId}`, data),

  delete: (assignmentId: string) =>
    apiClient.delete(`/api/v1/assignments/${assignmentId}`),

  submit: (assignmentId: string, fileUrl: string) =>
    apiClient.post<Submission>(
      `/api/v1/assignments/${assignmentId}/submissions`,
      { file_url: fileUrl }
    ),

  getMySubmission: (assignmentId: string) =>
    apiClient.get<Submission>(
      `/api/v1/assignments/${assignmentId}/submissions/me`
    ),

  listSubmissions: (assignmentId: string) =>
    apiClient.get<Submission[]>(
      `/api/v1/assignments/${assignmentId}/submissions`
    ),

  grade: (submissionId: string, data: { grade: number; feedback?: string }) =>
    apiClient.patch(`/api/v1/submissions/${submissionId}/grade`, data),
};
