import data from "@/server/data/legacy-course-certificates.json";

/**
 * Per-course certificate settings carried over from WordPress (Tutor LMS), read from the SQL dump:
 *  - `_course_duration` (hours/minutes) → shown as "Course Duration" on the certificate
 *  - `tutor_course_certificate_template` = "none" → the course gives no certificate
 * Keyed by app course uuid. Courses created in the new app are not listed: they issue certificates.
 */
const MAP = data as Record<string, { duration_minutes?: number; certificate?: boolean }>;

export function courseIssuesCertificate(courseId: string): boolean {
  return MAP[courseId]?.certificate !== false;
}

export function courseDurationMinutes(courseId: string): number | null {
  return MAP[courseId]?.duration_minutes ?? null;
}

export function formatDuration(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts = [];
  if (h) parts.push(`${h} ${h === 1 ? "hour" : "hours"}`);
  if (m) parts.push(`${m} ${m === 1 ? "minute" : "minutes"}`);
  return parts.join(" ");
}
