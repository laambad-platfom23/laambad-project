import apiClient from "./client";
import type {
  ResearchPaper,
  ResearchCategory,
  CreatePaperInput,
  PaginatedResponse,
  DataResponse,
} from "@/types";

export const researchApi = {
  publicList: (page = 1, pageSize = 20, category?: string) =>
    apiClient.get<PaginatedResponse<ResearchPaper>>("/api/research", {
      params: { page, page_size: pageSize, category },
    }),

  listCategories: () =>
    apiClient.get<DataResponse<ResearchCategory[]>>(
      "/api/v1/research/categories"
    ),

  listPapers: (params: {
    page?: number;
    page_size?: number;
    mine?: boolean;
    status?: string;
    category?: string;
  }) =>
    apiClient.get<PaginatedResponse<ResearchPaper>>(
      "/api/v1/research/papers",
      {
        params: {
          page: params.page || 1,
          page_size: params.page_size || 20,
          mine: params.mine ? "1" : undefined,
          status: params.status,
          category: params.category,
        },
      }
    ),

  getPaper: (id: string) =>
    apiClient.get<ResearchPaper>(`/api/v1/research/papers/${id}`),

  createPaper: (data: CreatePaperInput) =>
    apiClient.post<ResearchPaper>("/api/v1/research/papers", data),

  updatePaper: (id: string, data: Partial<CreatePaperInput>) =>
    apiClient.patch<ResearchPaper>(`/api/v1/research/papers/${id}`, data),

  submitPaper: (id: string) =>
    apiClient.post(`/api/v1/research/papers/${id}/submit`),

  setPaperStatus: (id: string, status: string) =>
    apiClient.patch(`/api/v1/research/papers/${id}/status`, { status }),

  addReview: (id: string, data: { rating: number; comment: string }) =>
    apiClient.post(`/api/v1/research/papers/${id}/reviews`, data),

  createCategory: (data: { name: string; slug?: string }) =>
    apiClient.post<ResearchCategory>("/api/v1/research/categories", data),

  updateCategory: (id: string, data: { name?: string; slug?: string }) =>
    apiClient.patch<ResearchCategory>(`/api/v1/research/categories/${id}`, data),

  deleteCategory: (id: string) =>
    apiClient.delete(`/api/v1/research/categories/${id}`),
};
