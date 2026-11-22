#!/usr/bin/env node
/**
 * npm run dev:rehearsal [-- --target=rehearsal-app|local] [next dev args, e.g. -p 3000]
 *
 * Starts `next dev` with DATABASE_URL set in THIS process only (Next.js never overrides an existing
 * process env var with .env / .env.local, so plain `npm run dev` is unchanged). Connection strings are
 * read from D:\Laambad-Migration\phase3\secrets, never from the repo.
 *
 * Targets
 *  - rehearsal-app (default): Neon child branch of `migration-rehearsal`, writable. Accepted only when
 *    tooling/config/neon-rehearsal-app-target.json is "verified" (run D:/Laambad-Migration/phase3/tooling/src/test/verify-rehearsal-app.mjs)
 *    and the host matches that pin. Secret: secrets/neon-app.env → NEON_REHEARSAL_APP_URL.
 *  - local: disposable local copy `laambad_app_local` in the phase-3 scratch container (127.0.0.1:55432).
 *
 * Always refused: Neon Production, the frozen `migration-rehearsal` branch (golden copy, immutable),
 * pooled hosts for verification mismatches, anything not listed above.
 *
 * VdoCipher: if secrets/vdocipher.env exists, VDOCIPHER_API_SECRET is passed to the server process.
 * WaafiPay: if secrets/waafipay.env exists, WAAFIPAY_* are passed to the server process.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const ROOT = process.env.LAAMBAD_MIGRATION_ROOT || "D:/Laambad-Migration/phase3";
const SECRETS = `${ROOT}/secrets`;
const NEON_PRODUCTION = { branchId: "br-bitter-darkness-bd7o8le7", endpointId: "ep-rapid-dew-bd2gcooq" };
const GOLDEN_PIN = `${ROOT}/tooling/config/neon-rehearsal-target.json`;
const APP_PIN = `${ROOT}/tooling/config/neon-rehearsal-app-target.json`;

function fail(msg) {
  console.error(`[dev:rehearsal] REFUSED: ${msg}`);
  process.exit(1);
}
function readEnv(file) {
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

const args = process.argv.slice(2);
const targetArg = args.find((a) => a.startsWith("--target="));
const target = targetArg ? targetArg.slice("--target=".length) : "rehearsal-app";
const nextArgs = args.filter((a) => a !== targetArg);

let databaseUrl;
let banner;

if (target === "rehearsal-app") {
  const pin = readJson(APP_PIN);
  if (!pin) fail(`no pin file ${APP_PIN}. Create the Neon branch rehearsal-app (parent: migration-rehearsal), put its URL in secrets/neon-app.env, then run: node D:/Laambad-Migration/phase3/tooling/src/test/verify-rehearsal-app.mjs`);
  if (pin.status !== "verified") fail(`rehearsal-app pin status is "${pin.status}", expected "verified"`);
  const golden = readJson(GOLDEN_PIN);
  if (!existsSync(`${SECRETS}/neon-app.env`)) fail(`missing ${SECRETS}/neon-app.env (NEON_REHEARSAL_APP_URL)`);
  const raw = readEnv(`${SECRETS}/neon-app.env`).NEON_REHEARSAL_APP_URL;
  if (!raw) fail("NEON_REHEARSAL_APP_URL not set in neon-app.env");
  const u = new URL(raw);
  const host = u.hostname.toLowerCase();
  if (host.includes(NEON_PRODUCTION.endpointId) || pin.branchId === NEON_PRODUCTION.branchId) fail("target is Neon Production");
  if (golden && (host.includes(golden.endpointId) || pin.branchId === golden.branchId || pin.endpointId === golden.endpointId)) {
    fail("target is the frozen migration-rehearsal branch (immutable golden copy)");
  }
  if (host.replace("-pooler.", ".") !== pin.host) fail(`host ${host} is not the pinned rehearsal-app endpoint`);
  if (!host.startsWith(`${pin.endpointId}`)) fail("endpoint id mismatch");
  if (u.pathname !== "/neondb") fail("database must be neondb");
  if (!/^(require|verify-full)$/.test(u.searchParams.get("sslmode") || "")) fail("Neon target must use sslmode=require");
  // Neon is reached over a slow, jittery link from here (connect ~5 s at times):
  // give Prisma more connections and longer waits instead of failing with P2024 → HTTP 500.
  if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "10");
  if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", "45");
  if (!u.searchParams.has("connect_timeout")) u.searchParams.set("connect_timeout", "30");
  databaseUrl = u.toString();
  banner = `Neon branch rehearsal-app ${pin.branchId} (endpoint ${pin.endpointId}), WRITABLE. migration-rehearsal stays untouched.`;
} else if (target === "local") {
  const pg = readEnv(`${SECRETS}/pg.env`);
  if (!pg.POSTGRES_USER || !pg.POSTGRES_PASSWORD) fail("pg.env incomplete");
  const u = new URL("postgresql://127.0.0.1:55432/laambad_app_local");
  u.username = pg.POSTGRES_USER;
  u.password = pg.POSTGRES_PASSWORD;
  databaseUrl = u.toString();
  banner = "LOCAL disposable copy laambad_app_local (127.0.0.1:55432), WRITABLE. No Neon connection.";
} else {
  fail(`unknown --target=${target} (allowed: rehearsal-app, local)`);
}

const env = { ...process.env, DATABASE_URL: databaseUrl, LAAMBAD_DB_TARGET: target };
if (existsSync(`${SECRETS}/vdocipher.env`)) {
  const v = readEnv(`${SECRETS}/vdocipher.env`).VDOCIPHER_API_SECRET;
  if (v) env.VDOCIPHER_API_SECRET = v;
}
// WaafiPay: secrets/waafipay.env (WAAFIPAY_*) is passed to the server process only.
if (existsSync(`${SECRETS}/waafipay.env`)) {
  const w = readEnv(`${SECRETS}/waafipay.env`);
  for (const k of ["WAAFIPAY_MODE", "WAAFIPAY_API_USER_ID", "WAAFIPAY_API_KEY", "WAAFIPAY_MERCHANT_UID"]) {
    if (w[k]) env[k] = w[k];
  }
}
console.log(`[dev:rehearsal] ${banner}`);
console.log(`[dev:rehearsal] VdoCipher: ${env.VDOCIPHER_API_SECRET ? "configured" : "NOT configured (no secrets/vdocipher.env)"}`);
console.log(
  `[dev:rehearsal] WaafiPay: ${
    env.WAAFIPAY_API_KEY && env.WAAFIPAY_API_USER_ID && env.WAAFIPAY_MERCHANT_UID
      ? `configured (${env.WAAFIPAY_MODE === "test" ? "TEST" : "LIVE"})`
      : "NOT configured (no secrets/waafipay.env)"
  }`
);

const require = createRequire(import.meta.url);
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", ...nextArgs], {
  stdio: "inherit",
  env,
});
child.on("exit", (code) => process.exit(code ?? 0));
