import { Err } from "@/lib/api/errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** A malformed id can never match a row: answer 404 instead of letting the database reject it (500). */
export function assertUuid(v: unknown, what = "not found"): string {
  if (!isUuid(v)) throw Err.notFound(what);
  return v;
}
