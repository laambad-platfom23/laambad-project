/**
 * A pasted Google Meet link → "https://meet.google.com/<code>", or null when it is not a meeting link.
 * Accepts what people really paste: "https://meet.google.com/abc-defg-hij?authuser=0",
 * "meet.google.com/abc-defg-hij", a trailing slash, or just the code "abc-defg-hij".
 * Shared by the live-sessions form (instant feedback) and the server (the rule that counts).
 */
const NOT_A_MEETING = new Set(["new", "landing", "about", "calendar", "settings", "linkredirect", "lookup", "_meet"]);

export function normalizeMeetUrl(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(s)) return `https://meet.google.com/${s.toLowerCase()}`;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (u.hostname.toLowerCase() !== "meet.google.com") return null;
  const code = u.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!/^[a-z0-9-]{3,64}$/.test(code) || NOT_A_MEETING.has(code)) return null;
  return `https://meet.google.com/${code}`;
}
