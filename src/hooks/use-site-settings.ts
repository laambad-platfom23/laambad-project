"use client";

import { useQuery } from "@tanstack/react-query";
import { siteSettingsApi, type SiteSettingsMap } from "@/services/api/site-settings";
import {
  SITE_IMAGE_DEFAULTS,
  type SiteImageKey,
} from "@/lib/sodemy-contact";

export function useSiteSettings() {
  return useQuery({
    queryKey: ["public-site-settings"],
    queryFn: () => siteSettingsApi.getPublic().then((r) => r.data.data ?? {}),
    staleTime: 60_000,
  });
}

/** Resolve a site image URL with static fallback. */
export function resolveSiteImage(
  settings: SiteSettingsMap | undefined,
  key: SiteImageKey,
): string {
  const custom = settings?.[key]?.trim();
  if (custom) return custom;
  return SITE_IMAGE_DEFAULTS[key] || "";
}
