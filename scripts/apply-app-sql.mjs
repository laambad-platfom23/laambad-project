#!/usr/bin/env node
/**
 * node scripts/apply-app-sql.mjs <file.sql> [--dry-run]
 *
 * Applies an additive app SQL file to the Neon branch rehearsal-app ONLY, in one transaction.
 * Same guards as dev-rehearsal.mjs: the pinned + verified rehearsal-app endpoint, never Neon Production,
 * never the frozen migration-rehearsal branch. The connection string is read from
 * D:\Laambad-Migration\phase3\secrets\neon-app.env and is never printed.
 */
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const ROOT = process.env.LAAMBAD_MIGRATION_ROOT || "D:/Laambad-Migration/phase3";
const SECRETS = `${ROOT}/secrets`;
const NEON_PRODUCTION = { branchId: "br-bitter-darkness-bd7o8le7", endpointId: "ep-rapid-dew-bd2gcooq" };
const APP_PIN = `${ROOT}/tooling/config/neon-rehearsal-app-target.json`;
const GOLDEN_PIN = `${ROOT}/tooling/config/neon-rehearsal-target.json`;

function fail(msg) {
  console.error(`[apply-app-sql] REFUSED: ${msg}`);
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

const file = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!file || !existsSync(file)) fail("usage: node scripts/apply-app-sql.mjs <file.sql> [--dry-run]");
const sql = readFileSync(file, "utf8");
if (/\b(drop|truncate|delete\s+from)\b/i.test(sql.replace(/--.*$/gm, ""))) fail("SQL contains DROP/TRUNCATE/DELETE: additive files only");

const pin = JSON.parse(readFileSync(APP_PIN, "utf8"));
if (pin.status !== "verified") fail(`rehearsal-app pin status is "${pin.status}"`);
const golden = existsSync(GOLDEN_PIN) ? JSON.parse(readFileSync(GOLDEN_PIN, "utf8")) : null;
const raw = readEnv(`${SECRETS}/neon-app.env`).NEON_REHEARSAL_APP_URL;
if (!raw) fail("NEON_REHEARSAL_APP_URL missing");
const u = new URL(raw);
const host = u.hostname.toLowerCase();
if (host.includes(NEON_PRODUCTION.endpointId) || pin.branchId === NEON_PRODUCTION.branchId) fail("target is Neon Production");
if (golden && (host.includes(golden.endpointId) || pin.endpointId === golden.endpointId)) fail("target is the frozen migration-rehearsal branch");
if (host.replace("-pooler.", ".") !== pin.host) fail("host is not the pinned rehearsal-app endpoint");
if (u.pathname !== "/neondb") fail("database must be neondb");

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient({ datasources: { db: { url: u.toString() } } });

// split on ";" at line end (the files contain no functions / dollar quoting)
const statements = sql
  .replace(/--.*$/gm, "")
  .split(/;\s*(?:\r?\n|$)/)
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`[apply-app-sql] target: rehearsal-app ${pin.branchId} (endpoint ${pin.endpointId})`);
console.log(`[apply-app-sql] ${statements.length} statement(s) from ${file}${dryRun ? " — DRY RUN (rolled back)" : ""}`);
try {
  await prisma.$transaction(
    async (tx) => {
      for (const [i, s] of statements.entries()) {
        const n = await tx.$executeRawUnsafe(s);
        console.log(`  ${i + 1}. ${s.split(/\s+/).slice(0, 6).join(" ")} … → ${n}`);
      }
      if (dryRun) throw new Error("__dry_run__");
    },
    { timeout: 120_000, maxWait: 60_000 }
  );
  console.log("[apply-app-sql] COMMITTED");
} catch (e) {
  if (e instanceof Error && e.message === "__dry_run__") console.log("[apply-app-sql] dry run OK, rolled back");
  else {
    console.error("[apply-app-sql] FAILED, rolled back:", e instanceof Error ? e.message.split("\n").slice(-3).join(" ") : e);
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
