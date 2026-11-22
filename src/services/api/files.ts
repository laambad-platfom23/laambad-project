import apiClient from "./client";
import type { UploadResult } from "@/types";

export const filesApi = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiClient.post<UploadResult>("/api/v1/files", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  download: (id: string) =>
    apiClient.get(`/api/v1/files/${id}`, { responseType: "blob" }),
};
