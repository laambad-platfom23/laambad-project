/**
 * A5 — Google OAuth + Calendar (Meet links) for instructors, with plain fetch (no SDK).
 *
 * Env (server only):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  OAuth client (type "Web application") with the redirect URI
 *                                           <site>/api/google/oauth/callback
 *   GOOGLE_TOKEN_KEY                         32 random bytes (base64) to encrypt refresh tokens (AES-256-GCM)
 * Scope: calendar.events (create / update / delete the instructor's own events) + email.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/api/errors";
import { siteUrl } from "@/server/notify";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const SCOPES = ["openid", "email", CALENDAR_SCOPE];

/** Google's consent screen lets people untick Calendar: without it no Meet link can be created. */
export function grantsCalendar(scope: string | null | undefined) {
  return !scope || scope.split(/\s+/).includes(CALENDAR_SCOPE);
}

export function isGoogleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim() && process.env.GOOGLE_TOKEN_KEY?.trim());
}
function requireConfigured() {
  if (!isGoogleConfigured()) throw new ApiError(503, "google_not_configured", "Google Meet is not set up on the server yet.");
}
export function redirectUri() {
  return `${siteUrl()}/api/google/oauth/callback`;
}

function key() {
  const k = Buffer.from(process.env.GOOGLE_TOKEN_KEY!.trim(), "base64");
  if (k.length !== 32) throw new ApiError(500, "google_key", "GOOGLE_TOKEN_KEY must be 32 bytes (base64)");
  return k;
}
export function encrypt(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}
export function decrypt(blob: string) {
  const [v, iv, tag, data] = blob.split(".");
  if (v !== "v1") throw new Error("bad token blob");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

/** Signed, 10-minute state for the OAuth round trip (binds the callback to the instructor). */
function stateSecret() {
  return process.env.GOOGLE_CLIENT_SECRET!.trim() + (process.env.JWT_SECRET ?? "");
}
function signState(userId: string) {
  const body = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + 10 * 60_000, n: randomBytes(8).toString("hex") })).toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}
export function readState(state: string): string | null {
  const [body, sig] = String(state).split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(createHmac("sha256", stateSecret()).update(body).digest("base64url"));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return typeof p.u === "string" && p.e > Date.now() ? p.u : null;
  } catch {
    return null;
  }
}

export function authUrl(userId: string) {
  requireConfigured();
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: signState(userId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!.trim(), client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(), ...params }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (!res.ok) throw new ApiError(502, "google_token", `Google refused the request (${data.error ?? res.status})`);
  return data;
}

/** Exchange the callback code; returns the refresh token, scope and the Google e-mail. */
export async function exchangeCode(code: string) {
  requireConfigured();
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  let email: string | null = null;
  try {
    // the id_token comes straight from Google over TLS: only its e-mail claim is read
    const payload = JSON.parse(Buffer.from(String(t.id_token).split(".")[1], "base64url").toString("utf8"));
    email = typeof payload.email === "string" ? payload.email : null;
  } catch {
    email = null;
  }
  if (!t.refresh_token) throw new ApiError(400, "google_no_refresh", "Google did not grant offline access. Please try connecting again.");
  return { refreshToken: t.refresh_token, scope: t.scope ?? null, email };
}

export async function accessToken(refreshTokenEnc: string) {
  requireConfigured();
  const t = await tokenRequest({ refresh_token: decrypt(refreshTokenEnc), grant_type: "refresh_token" });
  return t.access_token;
}

export async function revokeToken(token: string) {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
  } catch {
    /* best effort */
  }
}

export async function revoke(refreshTokenEnc: string) {
  let token: string;
  try {
    token = decrypt(refreshTokenEnc);
  } catch {
    return;
  }
  await revokeToken(token);
}

type EventInput = { title: string; description?: string | null; startsAt: Date; durationMin: number };

/** Create a Calendar event with a Google Meet link in the instructor's primary calendar. */
export async function createMeetEvent(token: string, ev: EventInput) {
  const end = new Date(ev.startsAt.getTime() + ev.durationMin * 60_000);
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: ev.title,
      description: ev.description ?? undefined,
      start: { dateTime: ev.startsAt.toISOString() },
      end: { dateTime: end.toISOString() },
      conferenceData: { createRequest: { requestId: randomBytes(12).toString("hex"), conferenceSolutionKey: { type: "hangoutsMeet" } } },
    }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; hangoutLink?: string; error?: { message?: string } };
  if (!res.ok || !data.id) throw new ApiError(502, "google_calendar", `Google Calendar: ${data.error?.message ?? res.status}`);
  return { eventId: data.id, meetUrl: data.hangoutLink ?? null };
}

export async function updateMeetEvent(token: string, eventId: string, ev: EventInput) {
  const end = new Date(ev.startsAt.getTime() + ev.durationMin * 60_000);
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=none`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ summary: ev.title, description: ev.description ?? undefined, start: { dateTime: ev.startsAt.toISOString() }, end: { dateTime: end.toISOString() } }),
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError(502, "google_calendar", `Google Calendar update failed (${res.status})`);
}

export async function deleteMeetEvent(token: string, eventId: string) {
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=none`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined);
}
