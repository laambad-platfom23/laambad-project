import apiClient from "./client";

export type MediaUploadResult = {
  url: string;
  filename?: string;
  folder?: string;
};

export const uploadsApi = {
  /** Upload a file to Supabase Storage via the backend (no Cloudinary). */
  uploadMedia: async (
    file: File,
    folder: "courses" | "curriculum" | "avatars" | "assets" | "website" = "assets",
  ) => {
    const form = new FormData();
    form.append("file", file);
    form.append("folder", folder);
    const { data } = await apiClient.post<MediaUploadResult>(
      "/api/v1/uploads/media",
      form,
      { timeout: 120_000 },
    );
    return data;
  },
};
