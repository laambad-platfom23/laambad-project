import { Err } from "@/lib/api/errors";

/**
 * G5 — VdoCipher playback (4,007 migrated lessons have a vdocipher_video_id and no video_url).
 *
 * STATUS: PREPARED, NOT CONFIGURED. No API secret has been provided yet. The secret is read only from the
 * server process environment (VDOCIPHER_API_SECRET), which `npm run dev:rehearsal` loads from
 * D:\Laambad-Migration\phase3\secrets\vdocipher.env. It is never sent to the browser and never stored in
 * .env / .env.local. Until it exists, the OTP endpoint answers 503 "vdocipher_not_configured".
 *
 * Flow: enrolled user → server asks VdoCipher for a short-lived OTP + playbackInfo for that video →
 * the browser loads the official player iframe with them.
 */
const API_BASE = "https://dev.vdocipher.com/api";
const OTP_TTL_SECONDS = 300;

export function isVdoCipherConfigured(): boolean {
  return !!process.env.VDOCIPHER_API_SECRET?.trim();
}

export class VdoCipherNotConfiguredError extends Error {
  constructor() {
    super("vdocipher_not_configured");
  }
}

export async function requestVdoCipherOtp(
  videoId: string,
  viewer?: { name?: string; email?: string },
  /** Hostname of the page that will embed the player (API-level whitelist beats old per-video domain locks). */
  playbackHost?: string
): Promise<{ otp: string; playbackInfo: string }> {
  const secret = process.env.VDOCIPHER_API_SECRET?.trim();
  if (!secret) throw new VdoCipherNotConfiguredError();
  if (!/^[0-9a-f]{32}$/i.test(videoId)) throw Err.invalidInput("invalid VdoCipher video id");

  const body: Record<string, unknown> = { ttl: OTP_TTL_SECONDS };
  if (playbackHost && /^[a-z0-9.-]{1,253}$/i.test(playbackHost)) body.whitelisthref = playbackHost;
  // Optional viewer watermark (helps against screen-recording leaks).
  const mark = viewer?.email || viewer?.name;
  if (mark) {
    body.annotate = JSON.stringify([
      { type: "rtext", text: mark, alpha: "0.45", color: "0xFFFFFF", size: "14", interval: "6000" },
    ]);
  }

  const res = await fetch(`${API_BASE}/videos/${encodeURIComponent(videoId)}/otp`, {
    method: "POST",
    headers: {
      Authorization: `Apisecret ${secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    // never echo the secret; VdoCipher's message is safe to log
    const msg = await res.text().catch(() => "");
    console.error(`[vdocipher] OTP request failed ${res.status} for video ${videoId}: ${msg.slice(0, 200)}`);
    throw new Error(`vdocipher_otp_failed_${res.status}`);
  }
  const json = (await res.json()) as { otp?: string; playbackInfo?: string };
  if (!json.otp || !json.playbackInfo) throw new Error("vdocipher_otp_invalid_response");
  return { otp: json.otp, playbackInfo: json.playbackInfo };
}
