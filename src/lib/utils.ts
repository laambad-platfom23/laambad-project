import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Mirrors backend `NormalizeCategorySlug` for course catalog categories. */
/** Reads backend error envelope `{ error: { message } }` or legacy `{ message }`. */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  const ax = err as {
    response?: { data?: { error?: { message?: string }; message?: string } };
  };
  const d = ax.response?.data;
  const msg = d?.error?.message ?? d?.message;
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  return fallback;
}

export function categorySlugFromName(name: string): string {
  const s = name.trim().toLowerCase();
  let out = "";
  let lastHyphen = false;
  for (const r of s) {
    const code = r.codePointAt(0)!;
    const isAlnum =
      (code >= 0x61 && code <= 0x7a) || (code >= 0x30 && code <= 0x39);
    if (isAlnum) {
      out += r;
      lastHyphen = false;
    } else if (r === " " || r === "-" || r === "_") {
      if (!lastHyphen && out.length > 0) {
        out += "-";
        lastHyphen = true;
      }
    }
  }
  out = out.replace(/^-+|-+$/g, "");
  if (out.length > 120) out = out.slice(0, 120);
  return out;
}

/** URL-safe slug from a course title (same rules as catalog category slugs). */
export function slugFromTitle(title: string): string {
  return categorySlugFromName(title);
}

/** "5 minutes ago" / "in 2 days" — small, dependency-free relative time. */
export function timeAgo(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = (d.getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return "just now";
}
