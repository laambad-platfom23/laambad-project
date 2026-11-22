#!/usr/bin/env node
/**
 * Writes src/server/data/legacy-uploads-manifest.json: every file under public/legacy-uploads,
 * as "YYYY/MM/file" paths. Runs before `next build` (Vercel functions cannot see public/ on disk).
 */
import { readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "public", "legacy-uploads");
const OUT = join(process.cwd(), "src", "server", "data", "legacy-uploads-manifest.json");

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(relative(ROOT, p).split("\\").join("/"));
  }
  return out;
}

const files = existsSync(ROOT) ? walk(ROOT, []).sort() : [];
writeFileSync(OUT, JSON.stringify(files, null, 0) + "\n");
console.log(`[legacy-manifest] ${files.length} files`);
