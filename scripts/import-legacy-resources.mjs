#!/usr/bin/env node
/**
 * node scripts/import-legacy-resources.mjs --attachments <wp-attachments.json> --s3 <as3cf-found.json> [--write]
 *
 * Builds src/server/data/legacy-resources.json from the old site's Tutor attachments
 * (_tutor_attachments on courses, WooCommerce products and lessons).
 *  - the files already live in the old site's S3 bucket (WP Offload Media, bucket lmresource,
 *    ap-south-1); nothing is uploaded or copied — every object is checked with a HEAD request;
 *  - owners are mapped to the new ids with the read-only scratch copy (courses.legacy_wp_id,
 *    courses.legacy_product_id, lessons.legacy_wp_id) — the same ids as the live database.
 * Without --write it is a dry run. Nothing in the database is changed.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const arg = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const ATTACH = arg("--attachments");
const S3 = arg("--s3");
const WRITE = args.includes("--write");
const OUT = "src/server/data/legacy-resources.json";
if (!ATTACH || !S3) {
  console.error("usage: --attachments <wp-attachments.json> --s3 <as3cf-found.json> [--write]");
  process.exit(1);
}

function sql(q) {
  const out = execFileSync(
    "docker",
    ["exec", "-i", "laambad-p3-pg", "sh", "-c", 'psql -U "$POSTGRES_USER" -d laambad_app_local -tA -F "\t"'],
    { input: q, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  return out.split("\n").filter(Boolean).map((l) => l.split("\t"));
}
const courseByWp = new Map(sql("select legacy_wp_id, id from courses where legacy_wp_id is not null and deleted_at is null;").map(([a, b]) => [a, b]));
const courseByProduct = new Map(
  sql("select legacy_product_id, id from courses where legacy_product_id is not null and deleted_at is null;").map(([a, b]) => [a, b])
);
const lessonByWp = new Map(
  sql("select l.legacy_wp_id, l.id, s.course_id from lessons l join sections s on s.id=l.section_id where l.legacy_wp_id is not null and l.deleted_at is null;").map(
    ([a, b, c]) => [a, { id: b, courseId: c }]
  )
);

const s3 = JSON.parse(readFileSync(S3, "utf8")); // attachment id → { bucket, region, path }
const urlOf = (o) => `https://${o.bucket}.s3.${o.region}.amazonaws.com/${o.path.split("/").map(encodeURIComponent).join("/")}`;

/** HEAD every object once (8 at a time): exists + size */
const heads = new Map();
async function headAll(ids) {
  const queue = [...ids];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (queue.length) {
        const id = queue.shift();
        const o = s3[id];
        if (!o) continue;
        try {
          const r = await fetch(urlOf(o), { method: "HEAD" });
          heads.set(id, r.ok ? { size: Number(r.headers.get("content-length")) || null } : null);
        } catch {
          heads.set(id, null);
        }
      }
    })
  );
}

const MIME_EXT = { "application/pdf": ".pdf" };
function niceName(f) {
  const base = path.basename(f.file);
  const ext = path.extname(base) || MIME_EXT[f.mime] || "";
  const title = String(f.title || "").trim();
  const name = title && title.length <= 120 && !title.toLowerCase().endsWith(ext.toLowerCase()) ? `${title}${ext}` : base;
  return name.replace(/[\\/:*?"<>|\r\n]+/g, "_").slice(0, 150);
}

const owners = JSON.parse(readFileSync(ATTACH, "utf8"));
await headAll(new Set(owners.flatMap((o) => o.files.filter((f) => f.file).map((f) => String(f.id)))));

const out = { courses: {}, lessons: {} };
const report = { owners_mapped: 0, owners_unmapped: [], entries: 0, not_on_s3: [], unreachable: [], deleted_on_old_site: 0, bytes: 0 };
for (const o of owners) {
  if (o.status !== "publish") continue;
  let target = null;
  if (o.type === "lesson") {
    const l = lessonByWp.get(String(o.postId));
    if (l) target = { kind: "lessons", key: l.id, courseId: l.courseId };
  } else if (o.type === "courses") {
    const c = courseByWp.get(String(o.postId));
    if (c) target = { kind: "courses", key: c, courseId: c };
  } else if (o.type === "product") {
    const c = courseByProduct.get(String(o.postId));
    if (c) target = { kind: "courses", key: c, courseId: c };
  }
  if (!target) {
    report.owners_unmapped.push(`${o.type}:${o.postId}`);
    continue;
  }
  report.owners_mapped++;
  const list = (out[target.kind][target.key] ??= []);
  for (const f of o.files) {
    if (!f.file) {
      report.deleted_on_old_site++;
      continue;
    }
    const obj = s3[String(f.id)];
    if (!obj) {
      report.not_on_s3.push(f.file);
      continue;
    }
    const head = heads.get(String(f.id));
    if (!head) {
      report.unreachable.push(f.file);
      continue;
    }
    const id = `wp${f.id}-${target.courseId.slice(0, 8)}`;
    if (list.some((x) => x.id === id)) continue;
    list.push({ id, name: niceName(f), mime: f.mime || "application/octet-stream", size: head.size, url: urlOf(obj), course_id: target.courseId });
    report.entries++;
    report.bytes += head.size ?? 0;
  }
  if (!list.length) delete out[target.kind][target.key];
}

console.log(
  JSON.stringify(
    {
      mode: WRITE ? "write" : "dry-run",
      owners_mapped: report.owners_mapped,
      owners_unmapped: report.owners_unmapped.length,
      entries: report.entries,
      total_mb: Math.round(report.bytes / 1048576),
      not_on_s3: report.not_on_s3.length,
      unreachable: report.unreachable.length,
      attachment_rows_deleted_on_old_site: report.deleted_on_old_site,
      courses_with_files: Object.keys(out.courses).length,
      lessons_with_files: Object.keys(out.lessons).length,
    },
    null,
    1
  )
);
if (report.owners_unmapped.length) console.log("unmapped owners:", report.owners_unmapped.join(", "));
if (report.unreachable.length) console.log("unreachable (first 5):", report.unreachable.slice(0, 5).join(" | "));
if (WRITE) {
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`wrote ${OUT}`);
}
