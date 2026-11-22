/** Allows same-origin relative paths only (prevents open redirects). */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== "string") return null;
  try {
    const u = decodeURIComponent(raw.trim());
    if (!u.startsWith("/") || u.startsWith("//")) return null;
    if (u.includes("://")) return null;
    return u;
  } catch {
    return null;
  }
}
