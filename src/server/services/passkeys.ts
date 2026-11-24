/**
 * A2 — Passkey (WebAuthn) sign-in, built on @simplewebauthn/server (no hand-written crypto).
 *
 *  - registration: only for a signed-in user (Settings → Passkeys);
 *  - login: discoverable credentials ("Sign in with a passkey", no e-mail typed);
 *  - every challenge is random, stored server-side, single-use (consumed atomically) and expires in 5 min;
 *  - the origin / RP ID come from the request's Origin header but must be on the allow-list.
 */
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { prisma, newId, now } from "@/lib/db";
import { ApiError, Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { loginVerifiedUser } from "./auth";
import { assertUuid } from "@/lib/uuid";

const CHALLENGE_TTL_MS = 5 * 60_000;
const MAX_PASSKEYS = 10;
const RP_NAME = "Laambad";

/** Hosts that may use passkeys. Extra ones: WEBAUTHN_ORIGINS="https://a.example,https://b.example". */
function allowedOrigins(): string[] {
  const extra = (process.env.WEBAUTHN_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const app = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "").replace(/\/$/, "");
  return [
    "https://laambad.online",
    "https://www.laambad.online",
    ...(app ? [app] : []),
    ...(process.env.NODE_ENV !== "production" ? ["http://localhost:3000", "http://127.0.0.1:3000"] : []),
    ...extra,
  ];
}

/** origin + rpID for this request; refuses unknown sites. */
export function relyingParty(originHeader: string | null | undefined) {
  const origin = String(originHeader ?? "").replace(/\/$/, "");
  if (!origin || !allowedOrigins().includes(origin)) {
    throw new ApiError(400, "passkey_origin", "Passkeys are not available on this address.");
  }
  const host = new URL(origin).hostname;
  // www.laambad.online and laambad.online share one RP ID, so a passkey works on both
  const rpID = host === "laambad.online" || host.endsWith(".laambad.online") ? "laambad.online" : host;
  return { origin, rpID };
}

async function saveChallenge(purpose: "register" | "login", challenge: string, userId: string | null) {
  const t = now();
  const id = newId();
  await prisma.webauthnChallenge.create({
    data: { id, userId, purpose, challenge, expiresAt: new Date(t.getTime() + CHALLENGE_TTL_MS), createdAt: t },
  });
  // housekeeping: old challenges are useless (expired) — mark them consumed is enough; nothing is removed
  return id;
}

/** Single use: only one request can consume a challenge. */
async function takeChallenge(id: string, purpose: string, userId: string | null) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw Err.invalidInput("invalid challenge");
  const row = await prisma.webauthnChallenge.findFirst({ where: { id: String(id), purpose } });
  const t = now();
  if (!row || row.consumedAt || row.expiresAt < t || (userId !== null && row.userId !== userId)) {
    throw new ApiError(400, "challenge_expired", "This passkey request expired. Please try again.");
  }
  const taken = await prisma.webauthnChallenge.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: t },
  });
  if (taken.count !== 1) throw new ApiError(400, "challenge_expired", "This passkey request expired. Please try again.");
  return row.challenge;
}

function transportsOf(s: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!s) return undefined;
  return s.split(",").filter(Boolean) as AuthenticatorTransportFuture[];
}

// ── Registration (signed in) ──

export async function registrationOptions(user: AuthUser, originHeader: string | null) {
  const { rpID } = relyingParty(originHeader);
  const u = await prisma.user.findFirst({
    where: { id: user.user_id, deletedAt: null },
    select: { id: true, email: true, name: true, passkeys: { select: { credentialId: true, transports: true } } },
  });
  if (!u) throw Err.notFound("user not found");
  if (u.passkeys.length >= MAX_PASSKEYS) throw Err.conflict("too_many_passkeys", `You can have at most ${MAX_PASSKEYS} passkeys.`);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: u.email,
    userDisplayName: u.name,
    userID: new TextEncoder().encode(u.id),
    attestationType: "none",
    excludeCredentials: u.passkeys.map((p) => ({ id: p.credentialId, transports: transportsOf(p.transports) })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  const challengeId = await saveChallenge("register", options.challenge, u.id);
  return { challenge_id: challengeId, options };
}

export async function registrationVerify(
  user: AuthUser,
  originHeader: string | null,
  input: { challenge_id?: string; response?: RegistrationResponseJSON; name?: string }
) {
  const { origin, rpID } = relyingParty(originHeader);
  if (!input.response || typeof input.response !== "object") throw Err.invalidInput("missing passkey response");
  const expectedChallenge = await takeChallenge(String(input.challenge_id ?? ""), "register", user.user_id);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch {
    throw new ApiError(400, "passkey_invalid", "The passkey could not be verified.");
  }
  if (!verification.verified || !verification.registrationInfo) {
    throw new ApiError(400, "passkey_invalid", "The passkey could not be verified.");
  }
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const exists = await prisma.userPasskey.findFirst({ where: { credentialId: credential.id }, select: { id: true } });
  if (exists) throw Err.conflict("passkey_exists", "This passkey is already registered.");
  const t = now();
  const name = String(input.name ?? "").trim().slice(0, 100) || "Passkey";
  const row = await prisma.userPasskey.create({
    data: {
      id: newId(),
      userId: user.user_id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter ?? 0),
      transports: (credential.transports ?? []).join(",").slice(0, 255) || null,
      deviceType: credentialDeviceType ?? null,
      backedUp: !!credentialBackedUp,
      name,
      createdAt: t,
    },
  });
  return { id: row.id, name: row.name, created_at: row.createdAt.toISOString() };
}

export async function listMine(user: AuthUser) {
  const rows = await prisma.userPasskey.findMany({
    where: { userId: user.user_id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true, backedUp: true, deviceType: true },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    created_at: r.createdAt.toISOString(),
    last_used_at: r.lastUsedAt?.toISOString() ?? null,
    synced: r.backedUp,
  }));
}

/** Removing a passkey is the user's own choice (it only removes a sign-in method). */
export async function removeMine(user: AuthUser, id: string) {
  assertUuid(id, "passkey not found");
  const r = await prisma.userPasskey.deleteMany({ where: { id, userId: user.user_id } });
  if (r.count === 0) throw Err.notFound("passkey not found");
  return { ok: true };
}

// ── Login (public) ──

export async function loginOptions(originHeader: string | null) {
  const { rpID } = relyingParty(originHeader);
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred", allowCredentials: [] });
  const challengeId = await saveChallenge("login", options.challenge, null);
  return { challenge_id: challengeId, options };
}

export async function loginVerify(
  originHeader: string | null,
  input: { challenge_id?: string; response?: AuthenticationResponseJSON },
  meta: { ip: string; userAgent: string }
) {
  const { origin, rpID } = relyingParty(originHeader);
  const response = input.response;
  if (!response || typeof response !== "object" || typeof response.id !== "string") {
    throw Err.invalidInput("missing passkey response");
  }
  const expectedChallenge = await takeChallenge(String(input.challenge_id ?? ""), "login", null);
  const pk = await prisma.userPasskey.findFirst({ where: { credentialId: response.id } });
  if (!pk) throw new ApiError(401, "passkey_unknown", "This passkey is not registered on Laambad.");
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: pk.credentialId,
        publicKey: new Uint8Array(pk.publicKey),
        counter: Number(pk.counter),
        transports: transportsOf(pk.transports),
      },
      requireUserVerification: false,
    });
  } catch {
    throw new ApiError(401, "passkey_invalid", "The passkey could not be verified.");
  }
  if (!verification.verified) throw new ApiError(401, "passkey_invalid", "The passkey could not be verified.");
  // the library already refuses a counter that went backwards (cloned authenticator)
  await prisma.userPasskey.update({
    where: { id: pk.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: now() },
  });
  return loginVerifiedUser(pk.userId, meta.ip, meta.userAgent);
}
