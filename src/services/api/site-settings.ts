import apiClient from "./client";
import type { SiteImageKey } from "@/lib/sodemy-contact";

export type SiteSettingsMap = Partial<Record<SiteImageKey | string, string>>;

type SiteSettingsResponse = {
  data: SiteSettingsMap;
  keys?: string[];
};

export const siteSettingsApi = {
  /** Public — no auth. Used by landing pages. */
  getPublic: () =>
    apiClient.get<SiteSettingsResponse>("/api/v1/public/site-settings"),

  getAdmin: () =>
    apiClient.get<SiteSettingsResponse>("/api/v1/admin/site-settings"),

  upsert: (settings: SiteSettingsMap) =>
    apiClient.put<SiteSettingsResponse>("/api/v1/admin/site-settings", {
      settings,
    }),

  /** Multipart upload → Supabase Storage; returns public URL. */
  uploadImage: async (key: string, file: File) => {
    const form = new FormData();
    form.append("key", key);
    form.append("file", file);
    // Let the browser set multipart boundary (do not force application/json).
    const { data } = await apiClient.post<{ url: string; key: string }>(
      "/api/v1/admin/site-images/upload",
      form,
      { timeout: 120_000 },
    );
    return data;
  },
};
