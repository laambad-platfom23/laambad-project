/** Same path pattern as useAuthenticatedImageSrc (kept here to avoid lib → client hook imports). */
function apiV1FileIdFromUrl(url: string): string | null {
  const m = url
    .trim()
    .match(/\/api\/v1\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m?.[1] ?? null;
}

/**
 * STORAGE static-mode URLs: `.../uploads/YYYY/MM/{uuid}.ext` (backend file_service publicURL when PUBLIC_URL_MODE=static).
 * S3/MinIO path-style: `.../bucket/YYYY/MM/{uuid}.ext` (same uploaded_files id).
 * The UUID matches the uploaded_files row and /api/v1/files/:id.
 */
export function extractUploadedFileUuidFromUrl(url: string): string | null {
  const t = url.trim();
  const uploads = t.match(
    /\/uploads\/.+\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[^/.?#]+/i,
  );
  if (uploads?.[1]) return uploads[1];
  // MinIO / S3: .../sodemy-bucket/2026/04/{uuid}.png
  const s3path = t.match(
    /\/(\d{4})\/(\d{2})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[^/.?#]+/i,
  );
  if (s3path?.[3]) return s3path[3];
  return null;
}

/**
 * Use for previews: only the old backend's `/api/v1/files/<uuid>` URLs needed a signed-in fetch.
 * Images uploaded by this app (Vercel Blob `…/uploads/courses/<uuid>.png`, local `/uploads/…`) are
 * plain public URLs — treating their UUID as a file id sent them to a route that no longer exists,
 * so a freshly uploaded cover never showed (Phase 2 test).
 */
export function extractPreviewFileIdFromUrl(url: string): string | null {
  return apiV1FileIdFromUrl(url);
}

/** Normalize a URL taken from markdown or HTML so it matches how Next and the API serve assets. */
function normalizeCoverPathFragment(fragment: string): string | null {
  let url = fragment.trim().replace(/^<|>$/g, "");
  if (!url) return null;
  if (/^api\/v1\/files\//i.test(url)) {
    url = "/" + url;
  }
  // Next.js serves `public/` at the site root — "public/images/a.png" → "/images/a.png"
  if (/^public\//i.test(url)) {
    url = "/" + url.slice("public/".length);
  }
  // Bare relative paths resolve from site root (files in `public/`)
  if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) {
    url = "/" + url.replace(/^\.\//, "");
  }
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) {
    return url;
  }
  return null;
}

/**
 * Cover image URL from course description: first markdown image, else first &lt;img src&gt; (HTML).
 * e.g. ![Course cover](https://...jpg) or &lt;img src="/images/cover.jpg" /&gt;
 */
export function extractCoverImageUrl(markdown: string | undefined): string | null {
  if (!markdown?.trim()) return null;

  const md = markdown.match(/!\[[^\]]*\]\(([^)]+)\)/);
  if (md?.[1]) {
    const n = normalizeCoverPathFragment(md[1]);
    if (n) return n;
  }

  const imgTag = markdown.match(/<img[^>]+(?:src|data-src)\s*=\s*["']([^"']+)["']/i);
  if (imgTag?.[1]) {
    const n = normalizeCoverPathFragment(imgTag[1]);
    if (n) return n;
  }

  return null;
}

/**
 * Raw cover URL for a course: the dedicated `cover_image_url` (migrated WordPress featured image)
 * wins; otherwise the first image in the description (covers uploaded in this app).
 */
export function courseCoverRawUrl(course: {
  cover_image_url?: string | null;
  description?: string | null;
}): string | null {
  return course.cover_image_url?.trim() || extractCoverImageUrl(course.description ?? undefined);
}

/**
 * True when the cover URL can be used directly in &lt;img src&gt; without a JWT blob fetch
 * (static asset under public/, absolute URL, or public API file URL already resolved).
 */
export function isDirectCoverImageUrl(url: string | null | undefined): boolean {
  const u = url?.trim() ?? "";
  if (!u) return false;
  if (isProtectedApiFileUrl(u)) return false;
  return u.startsWith("http://") || u.startsWith("https://") || u.startsWith("/");
}

/** Matches apiClient default when NEXT_PUBLIC_API_URL is unset (dev). */
// Same origin: the API is this Next.js app's own /api routes (local dev and Vercel alike).
const DEFAULT_PUBLIC_API_BASE = "";

/**
 * Browser-safe URL for uploaded API files used as a published course cover.
 * Uses GET /api/v1/public/files/:id (no JWT) on the **backend** API host when we can resolve
 * an uploaded_files id (local /uploads/..., MinIO path, or /api/v1/files/...).
 *
 * Private MinIO buckets cannot be loaded as a bare &lt;img src&gt; on the marketing site; preferring
 * the public API route avoids 403 from object storage while the course references the cover file.
 */
export function publicCourseCoverImageUrlFromRaw(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;

  const id = extractPreviewFileIdFromUrl(trimmed);
  if (id) {
    const base =
      (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL
        ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "")
        : "") || DEFAULT_PUBLIC_API_BASE;
    return `${base}/api/v1/public/files/${id}`;
  }

  // External image URLs (no embedded app file id)
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Site-root static files (public/), e.g. migrated covers under /legacy-uploads/
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.startsWith("/api/")) {
    return trimmed;
  }

  return null;
}

/** True when the URL points at a JWT-protected file (must not be used as a bare &lt;img src&gt; on the marketing site). */
export function isProtectedApiFileUrl(raw: string | null | undefined): boolean {
  return !!apiV1FileIdFromUrl(raw ?? "");
}

/**
 * Sets or removes the first markdown image line (course cover). Used when uploading a cover
 * so the description stays in sync with the dedicated image field.
 */
export function applyCoverUrlToDescription(description: string | undefined, coverUrl: string): string {
  const body = description ?? "";
  const url = coverUrl.trim();
  const first = body.match(/!\[[^\]]*\]\([^)]+\)/);

  if (!url) {
    if (!first || first.index === undefined) return body;
    const start = first.index;
    const end = start + first[0].length;
    let sliceEnd = end;
    if (body.slice(sliceEnd).startsWith("\n")) sliceEnd += 1;
    return (body.slice(0, start) + body.slice(sliceEnd)).replace(/^\s+/, "");
  }

  const line = `![Course cover](${url})`;
  if (first && first.index !== undefined) {
    return body.slice(0, first.index) + line + body.slice(first.index + first[0].length);
  }
  return `${line}\n\n${body}`.trimEnd();
}
