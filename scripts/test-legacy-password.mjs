#!/usr/bin/env node
// Unit test for src/server/legacy-password.ts with the R6 test vectors (synthetic passwords, no user data).
// Run: node scripts/test-legacy-password.mjs
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = new URL("..", import.meta.url);
const src = readFileSync(new URL("src/server/legacy-password.ts", root), "utf8");
const out = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText.replace('from "bcryptjs"', `from ${JSON.stringify(pathToFileURL(require.resolve("bcryptjs")).href)}`);
const dir = mkdtempSync(join(tmpdir(), "legacy-pw-"));
writeFileSync(join(dir, "legacy-password.mjs"), out);
const { verifyLegacy, phpassCheck, wpBcryptCheck } = await import(pathToFileURL(join(dir, "legacy-password.mjs")).href);

const vec = (f) => JSON.parse(readFileSync(new URL(`scripts/test-vectors/${f}`, root), "utf8"));
const phpass = vec("phpass.json"), wp = vec("wp.json");
let pass = 0, fail = 0;
const check = (name, cond) => (cond ? pass++ : (fail++, console.error("FAIL", name)));

for (const { pw, hash } of phpass) {
  check(`phpass ok ${JSON.stringify(pw).slice(0, 20)}`, verifyLegacy(pw, "phpass", hash));
  check(`phpass wrong pw`, !verifyLegacy(pw + "x", "phpass", hash));
  check(`phpass no trim`, pw.trim() === pw || !verifyLegacy(pw.trim(), "phpass", hash));
  check(`phpass wrong scheme`, !verifyLegacy(pw, "wordpress_wp_bcrypt", hash));
}
for (const { pw, hash } of wp) {
  check(`wp ok ${JSON.stringify(pw).slice(0, 20)}`, verifyLegacy(pw, "wordpress_wp_bcrypt", hash));
  check(`wp wrong pw`, !verifyLegacy(pw + "x", "wordpress_wp_bcrypt", hash));
  check(`wp no trim`, pw.trim() === pw || !verifyLegacy(pw.trim(), "wordpress_wp_bcrypt", hash));
  check(`wp wrong scheme`, !verifyLegacy(pw, "phpass", hash));
}
// malformed input never throws
for (const bad of [null, undefined, "", "$P$", "$wp$2y$10$short", "x".repeat(34), "$P$Z" + "a".repeat(30)]) {
  check(`malformed ${String(bad).slice(0, 10)}`, !phpassCheck("x", bad) && !wpBcryptCheck("x", bad));
}
check("unknown scheme", !verifyLegacy("x", "bcrypt", phpass[0].hash));
console.log(`legacy-password: ${pass} passed, ${fail} failed (${phpass.length} phpass + ${wp.length} wp vectors)`);
process.exit(fail ? 1 : 0);
