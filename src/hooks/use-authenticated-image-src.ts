"use client";

import { useEffect, useRef, useState } from "react";
import { extractPreviewFileIdFromUrl } from "@/lib/course-cover";
import { filesApi } from "@/services/api/files";

/** Matches `/api/v1/files/{uuid}` — these URLs need JWT; use blob fetch for &lt;img&gt;. */
export function extractApiV1FileIdFromUrl(url: string): string | null {
  const m = url
    .trim()
    .match(/\/api\/v1\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m?.[1] ?? null;
}

/**
 * Resolves an image URL for display: public URLs pass through; `/api/v1/files/:id` is fetched with the session token.
 */
export function useAuthenticatedImageSrc(rawUrl: string | null | undefined): {
  displaySrc: string | null;
  loading: boolean;
  failed: boolean;
} {
  const trimmed = rawUrl?.trim() ?? "";
  const fileId = trimmed ? extractPreviewFileIdFromUrl(trimmed) : null;

  const [blobSrc, setBlobSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => {
    const t = rawUrl?.trim() ?? "";
    return !!(t && extractPreviewFileIdFromUrl(t));
  });
  const [failed, setFailed] = useState(false);
  const revokeRef = useRef<string | null>(null);

  useEffect(() => {
    const revoke = () => {
      if (revokeRef.current) {
        URL.revokeObjectURL(revokeRef.current);
        revokeRef.current = null;
      }
    };

    if (!trimmed) {
      revoke();
      setBlobSrc(null);
      setFailed(false);
      setLoading(false);
      return;
    }

    const id = extractPreviewFileIdFromUrl(trimmed);
    if (!id) {
      revoke();
      setBlobSrc(null);
      setFailed(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFailed(false);
    revoke();
    setBlobSrc(null);

    filesApi
      .download(id)
      .then(({ data }) => {
        const ou = URL.createObjectURL(data);
        if (cancelled) {
          URL.revokeObjectURL(ou);
          return;
        }
        revokeRef.current = ou;
        setBlobSrc(ou);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      revoke();
    };
  }, [trimmed]);

  if (!trimmed) {
    return { displaySrc: null, loading: false, failed: false };
  }
  if (!fileId) {
    return { displaySrc: trimmed, loading: false, failed: false };
  }
  return {
    displaySrc: blobSrc,
    loading,
    failed,
  };
}
