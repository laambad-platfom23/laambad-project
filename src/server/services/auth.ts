import bcrypt from "bcryptjs";
import { prisma, newId, now } from "@/lib/db";
import { ApiError, Err } from "@/lib/api/errors";
import { consumeEmailCode, emailVerifiedAt, issueEmailCode, markEmailVerified } from "@/server/email-codes";
import { resetPasswordMail, sendEmail, verifyEmailMail } from "@/server/email";
import { signAccess, signRefresh, parseRefresh, refreshTTLMs } from "@/lib/auth/jwt";
import { isLegacyScheme, verifyLegacy } from "@/server/legacy-password";

const BCRYPT_COST = 12;

function permissionKeys(
  role: { permissions: { permission: { key: string } }[] } | null | undefined
): string[] {
  return (role?.permissions || []).map((rp) => rp.permission.key);
}

async function findRoleBySlug(slug: string) {
  return prisma.role.findFirst({
    where: { slug, deletedAt: null },
    include: { permissions: { include: { permission: true } } },
  });
}

async function findUserWithRole(userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  });
}

function deriveUsername(email: string) {
  const local = email.split("@")[0] || "user";
  const base =
    local
      .toLowerCase()
      .replace(/[^a-z0-9._]/g, "")
      .replace(/^[._]+|[._]+$/g, "") || "user";
  return base;
}

async function uniqueUsername(email: string) {
  let candidate = deriveUsername(email);
  for (let i = 0; i < 6; i++) {
    const exists = await prisma.user.findFirst({
      where: { username: candidate, deletedAt: null },
      select: { id: true },
    });
    if (!exists) return candidate;
    candidate = `${deriveUsername(email)}_${newId().slice(0, 6)}`;
  }
  return `${deriveUsername(email)}_${newId().slice(0, 8)}`;
}

async function issueTokens(
  user: NonNullable<Awaited<ReturnType<typeof findUserWithRole>>>,
  ip: string,
  userAgent: string
) {
  const perms = permissionKeys(user.role);
  const access = await signAccess(user.id, user.role.slug, perms);
  const jti = newId();
  const refresh = await signRefresh(user.id, jti);
  const t = now();
  await prisma.session.create({
    data: {
      id: newId(),
      userId: user.id,
      jti,
      ip: ip.slice(0, 255),
      userAgent: userAgent.slice(0, 512),
      expiresAt: new Date(Date.now() + refreshTTLMs()),
      createdAt: t,
      updatedAt: t,
    },
  });
  return {
    access_token: access.token,
    token: access.token,
    refresh_token: refresh.token,
    token_type: "Bearer",
    expires_in: access.expiresIn,
  };
}

export function toProfile(
  user: NonNullable<Awaited<ReturnType<typeof findUserWithRole>>>
) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username || undefined,
    phone: user.phone || undefined,
    address: user.address || undefined,
    gender: user.gender || undefined,
    avatar_url: user.avatarUrl || undefined,
    role: user.role.slug,
    role_slug: user.role.slug,
    permissions: permissionKeys(user.role),
  };
}

export async function register(input: {
  name: string;
  email: string;
  username?: string;
  phone?: string;
  address?: string;
  gender?: string;
  password: string;
  ip: string;
  userAgent: string;
}) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!email) throw Err.invalidInput("invalid email");
  if (!name) throw Err.invalidInput();
  if (input.password.trim().length < 8) throw Err.weakPassword();

  const taken = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: { id: true },
  });
  if (taken) throw Err.emailTaken();

  const role = await findRoleBySlug("user");
  if (!role) throw Err.notFound("role not found");

  let username = (input.username || "").trim();
  if (username) {
    const uTaken = await prisma.user.findFirst({
      where: { username, deletedAt: null },
      select: { id: true },
    });
    if (uTaken) throw Err.usernameTaken();
  } else {
    username = await uniqueUsername(email);
  }

  const hash = await bcrypt.hash(input.password, BCRYPT_COST);
  const t = now();
  const id = newId();
  await prisma.user.create({
    data: {
      id,
      name,
      email,
      username,
      phone: (input.phone || "").trim() || null,
      address: (input.address || "").trim() || null,
      gender: (input.gender || "").trim() || null,
      password: hash,
      roleId: role.id,
      isActive: true,
      createdAt: t,
      updatedAt: t,
    },
  });

  const full = await findUserWithRole(id);
  if (!full) throw Err.notFound("user not found");
  // first verification code; a failure here must not block the sign-up (the user can resend)
  await sendVerificationCode(id, input.ip).catch((e) => console.error("[auth] verification e-mail failed:", e?.code ?? e?.message));
  return issueTokens(full, input.ip, input.userAgent);
}

export async function login(input: {
  email: string;
  password: string;
  ip: string;
  userAgent: string;
}) {
  // WordPress users could sign in with their e-mail or their username: accept both.
  const identifier = input.email.trim();
  if (!identifier || typeof input.password !== "string") throw Err.invalidCredentials();
  const user = await prisma.user.findFirst({
    where: identifier.includes("@")
      ? { email: { equals: identifier, mode: "insensitive" }, deletedAt: null }
      : { username: { equals: identifier, mode: "insensitive" }, deletedAt: null },
  });
  if (!user) throw Err.invalidCredentials();

  // G4: migrated accounts keep their WordPress hash in legacy_password_hash (users.password holds a
  // random placeholder). Verify that hash; on success, upgrade to bcrypt in the same request.
  const legacy = isLegacyScheme(user.passwordScheme) && !!user.legacyPasswordHash;
  const ok = legacy
    ? verifyLegacy(input.password, user.passwordScheme, user.legacyPasswordHash)
    : await bcrypt.compare(input.password, user.password);
  if (!ok) throw Err.invalidCredentials();

  const full = await findUserWithRole(user.id);
  if (!full || !full.isActive) {
    if (full && !full.isActive) throw Err.accountDisabled();
    throw Err.invalidCredentials();
  }

  if (legacy) {
    const hash = await bcrypt.hash(input.password, BCRYPT_COST);
    // Conditional update: if two logins race, only the first rewrites the row; both are valid logins.
    await prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { id: user.id, passwordScheme: user.passwordScheme, legacyPasswordHash: user.legacyPasswordHash },
        data: {
          password: hash,
          passwordScheme: "bcrypt",
          legacyPasswordHash: null,
          mustResetPassword: false,
          updatedAt: now(),
        },
      });
    });
  }
  return issueTokens(full, input.ip, input.userAgent);
}

export async function refresh(refreshToken: string, ip: string, userAgent: string) {
  let parsed: { userId: string; jti: string };
  try {
    parsed = await parseRefresh(refreshToken);
  } catch {
    throw Err.invalidToken();
  }
  const sess = await prisma.session.findFirst({ where: { jti: parsed.jti } });
  if (!sess || sess.userId !== parsed.userId) throw Err.refreshRevoked();
  await prisma.session.delete({ where: { jti: parsed.jti } }).catch(() => undefined);
  const full = await findUserWithRole(parsed.userId);
  if (!full) throw Err.refreshRevoked();
  return issueTokens(full, ip, userAgent);
}

export async function logout(refreshToken: string) {
  try {
    const parsed = await parseRefresh(refreshToken);
    await prisma.session.delete({ where: { jti: parsed.jti } }).catch(() => undefined);
  } catch {
    throw Err.invalidToken();
  }
}

export async function me(userId: string) {
  const full = await findUserWithRole(userId);
  if (!full) throw Err.notFound("user not found");
  const verifiedAt = await emailVerifiedAt(userId);
  return { ...toProfile(full), email_verified: !!verifiedAt };
}

export async function updateMe(
  userId: string,
  input: { name?: string; phone?: string; avatar_url?: string }
) {
  const data: { name?: string; phone?: string; avatarUrl?: string; updatedAt: Date } = {
    updatedAt: now(),
  };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw Err.invalidInput();
    data.name = name;
  }
  if (input.phone !== undefined) data.phone = input.phone.trim();
  if (input.avatar_url !== undefined) data.avatarUrl = input.avatar_url.trim();
  await prisma.user.update({ where: { id: userId }, data });
  return me(userId);
}

// ── Password reset + e-mail verification (A1) ──
const RESET_MINUTES = 30;
const VERIFY_MINUTES = 15;

/** Origins allowed in e-mailed links: never trust an arbitrary Host header (reset-link poisoning). */
const LINK_HOSTS = new Set(["localhost", "127.0.0.1", "laambad.online", "www.laambad.online", "app.laambad.online", "laambad.com", "www.laambad.com", "app.laambad.com"]);
function linkOrigin(requestOrigin?: string): string {
  const env = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (env) return env;
  try {
    if (requestOrigin) {
      const u = new URL(requestOrigin);
      if (LINK_HOSTS.has(u.hostname.toLowerCase())) return u.origin;
    }
  } catch {
    /* fall through */
  }
  return "https://laambad.online";
}

function codeLimitError(r: { reason: string; retryAfterSeconds: number }) {
  const wait = r.retryAfterSeconds >= 120 ? `${Math.ceil(r.retryAfterSeconds / 60)} minutes` : `${r.retryAfterSeconds} seconds`;
  return new ApiError(429, "too_many_codes", `Please wait ${wait} before requesting a new code.`);
}

/**
 * Always answers the same way, whether or not the e-mail exists (no account enumeration).
 * Only active, non-deleted accounts get a code.
 */
export async function forgotPassword(input: { email: string; ip: string; origin?: string }) {
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 255);
  const generic = { ok: true, message: "If an account exists for this e-mail, we sent a reset code to it." };
  if (!email.includes("@")) return generic;
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, deletedAt: null, isActive: true },
    select: { id: true, name: true, email: true },
  });
  if (!user) return generic;
  const issued = await issueEmailCode(user.id, "reset_password", RESET_MINUTES, input.ip);
  if (!issued.ok) return generic; // silently: do not reveal that the account exists
  const link = `${linkOrigin(input.origin)}/forgot-password?email=${encodeURIComponent(user.email)}&code=${issued.code}`;
  const sent = await sendEmail(resetPasswordMail({ to: user.email, name: user.name, code: issued.code, link, minutes: RESET_MINUTES }));
  if (!sent.ok) throw new ApiError(502, "email_failed", "We could not send the e-mail right now. Please try again in a moment.");
  return generic;
}

export async function resetPassword(input: { email: string; code: string; password: string }) {
  const email = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");
  if (password.trim().length < 8) throw Err.weakPassword();
  if (password.length > 200) throw Err.invalidInput("password is too long");
  const invalid = () => new ApiError(400, "invalid_code", "The code is wrong or has expired. Request a new one.");
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, deletedAt: null, isActive: true },
    select: { id: true },
  });
  if (!user) throw invalid();
  if (!(await consumeEmailCode(user.id, "reset_password", input.code))) throw invalid();

  const hash = await bcrypt.hash(password, BCRYPT_COST);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hash, passwordScheme: "bcrypt", legacyPasswordHash: null, mustResetPassword: false, updatedAt: now() },
  });
  // the code reached this inbox, so the address is real
  await markEmailVerified(user.id);
  // sign out everywhere
  await prisma.session.deleteMany({ where: { userId: user.id } });
  return { ok: true };
}

export async function sendVerificationCode(userId: string, ip?: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true, name: true, email: true } });
  if (!user) throw Err.notFound("user not found");
  if (await emailVerifiedAt(user.id)) return { ok: true, already_verified: true };
  const issued = await issueEmailCode(user.id, "verify_email", VERIFY_MINUTES, ip);
  if (!issued.ok) throw codeLimitError(issued);
  const sent = await sendEmail(verifyEmailMail({ to: user.email, name: user.name, code: issued.code, minutes: VERIFY_MINUTES }));
  if (!sent.ok) throw new ApiError(502, "email_failed", "We could not send the e-mail right now. Please try again in a moment.");
  return { ok: true, already_verified: false };
}

export async function verifyEmail(userId: string, code: string) {
  if (await emailVerifiedAt(userId)) return { ok: true, email_verified: true };
  if (!(await consumeEmailCode(userId, "verify_email", code))) {
    throw new ApiError(400, "invalid_code", "The code is wrong or has expired. Request a new one.");
  }
  await markEmailVerified(userId);
  return { ok: true, email_verified: true };
}

/** Students must have a verified e-mail before buying or learning. Staff are exempt. */
export async function requireVerifiedEmail(user: { user_id: string; role?: string }) {
  if (user.role === "admin" || user.role === "instructor") return;
  if (await emailVerifiedAt(user.user_id)) return;
  throw new ApiError(403, "email_not_verified", "Please verify your e-mail address first.");
}
