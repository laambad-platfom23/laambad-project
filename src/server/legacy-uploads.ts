import { existsSync } from "node:fs";
import { join } from "node:path";
import legacyInstructorPhotos from "@/server/data/legacy-instructor-photos.json";
import legacyUploadsManifest from "@/server/data/legacy-uploads-manifest.json";

/**
 * Files migrated from the WordPress site backup live under public/legacy-uploads/<YYYY/MM/file>.
 * On Vercel, public/ is served by the CDN and is NOT on the function's disk, so the list of files is
 * written at build time (scripts/build-legacy-manifest.mjs). In dev, a file missing from the manifest
 * is still checked on disk, so a file added later shows up without a rebuild.
 */
const MANIFEST = new Set<string>(legacyUploadsManifest as string[]);
const legacyFileExists = new Map<string, boolean>();

/** `/legacy-uploads/<path>` when that file was copied from the site backup, else null. */
export function localLegacyUpload(path: string): string | null {
  if (!MANIFEST.has(path) && !legacyFileExists.get(path)) {
    if (process.env.NODE_ENV === "production") return null;
    if (!existsSync(join(process.cwd(), "public", "legacy-uploads", ...path.split("/")))) return null;
    legacyFileExists.set(path, true);
  }
  return "/legacy-uploads/" + path.split("/").map(encodeURIComponent).join("/");
}

/** Migrated Tutor LMS profile photos (wp_usermeta._tutor_profile_photo → file copied from the site backup). */
const PHOTOS = legacyInstructorPhotos as Record<string, { path: string }>;

/** Photo for a user: their uploaded avatar, else the migrated Tutor profile photo, else null. */
export function userPhotoUrl(userId: string, avatarUrl: string | null | undefined): string | null {
  if (avatarUrl?.trim()) return avatarUrl.trim();
  const p = PHOTOS[userId]?.path;
  return p ? localLegacyUpload(p) : null;
}
