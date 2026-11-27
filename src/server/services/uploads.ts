import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Err } from "@/lib/api/errors";
import { savePublicUpload } from "@/lib/local-storage";
import type { AuthUser } from "@/lib/auth/request";
import { prisma } from "@/lib/db";
import { assertUuid } from "@/lib/uuid";
import { courseContext } from "./curriculum";

const ALLOWED = new Set(["courses", "curriculum", "avatars", "assets", "website"]);
const MAX = 20 * 1024 * 1024;

export async function uploadMedia(
  _user: AuthUser,
  file: File,
  folderRaw?: string
) {
  const folder = (folderRaw || "assets").trim() || "assets";
  if (!ALLOWED.has(folder)) throw Err.invalidInput("invalid folder");
  if (file.size > MAX) throw Err.invalidInput("file too large (max 20MB)");

  const type = file.type || "application/octet-stream";
  const ok =
    type.startsWith("image/") || type.startsWith("video/") || type === "application/pdf";
  if (!ok) throw Err.invalidInput("unsupported file type");

  const buf = Buffer.from(await file.arrayBuffer());
  const saved = await savePublicUpload(folder, file.name, buf, type);
  return { url: saved.url, filename: saved.filename, folder };
}

// ─────────────────────────────────────────────────────────────────────────────
// A6 — course files (resources, assignment briefs) and students' assignment files.
//
// On Vercel a function accepts only ~4.5 MB, so the browser uploads straight to Vercel Blob with a
// short-lived token that allows ONE path and ONE content type (step 1: ticket, step 2: upload,
// step 3: the create call names the URL, which is checked against the expected path). Locally
// (no BLOB_READ_WRITE_TOKEN) the file is posted to the server and written under public/uploads/.
//
// Paths: course-files/<course id>/<random>/<name>         (course staff)
//        submissions/<assignment id>/<user id>/<random>/<name>  (a student of the course)
// ─────────────────────────────────────────────────────────────────────────────

/** Extensions people use for course material (Office, PDF, archives, data files of SPSS/Stata/Minitab…). */
const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pps: "application/vnd.ms-powerpoint",
  ppsx: "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  csv: "text/csv",
  txt: "text/plain",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  epub: "application/epub+zip",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
  // statistics / design software used in the courses
  sav: "application/octet-stream",
  dta: "application/octet-stream",
  mtw: "application/octet-stream",
  mpx: "application/octet-stream",
  do: "application/octet-stream",
  psd: "application/octet-stream",
  ai: "application/octet-stream",
};
const VIDEO = new Set(["mp4", "webm"]);
const COURSE_FILE_MAX = 200 * 1024 * 1024;
const SUBMISSION_MAX = 50 * 1024 * 1024;
const LOCAL_MAX = 100 * 1024 * 1024;

export type UploadPurpose = "course-file" | "submission";

export function extOf(name: string) {
  const m = String(name).toLowerCase().match(/\.([a-z0-9]{1,5})$/);
  return m ? m[1] : "";
}

/** A short, URL-safe version of the original name (the extension is kept). */
export function safeFileName(name: string) {
  const ext = extOf(name);
  const base = String(name)
    .replace(/\.[^.]*$/, "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return `${base || "file"}${ext ? `.${ext}` : ""}`;
}

/** Who may upload what, where. Returns the folder prefix (no leading slash). */
async function uploadTarget(user: AuthUser, purpose: unknown, ids: { course_id?: unknown; assignment_id?: unknown }) {
  if (purpose === "course-file") {
    const courseId = assertUuid(ids.course_id, "course not found");
    await courseContext(user, courseId, "staff");
    return { prefix: `course-files/${courseId}/`, max: COURSE_FILE_MAX, video: true };
  }
  if (purpose === "submission") {
    const assignmentId = assertUuid(ids.assignment_id, "assignment not found");
    const a = await prisma.assignment.findFirst({
      where: { id: assignmentId, deletedAt: null, published: true },
      select: { courseId: true },
    });
    if (!a) throw Err.notFound("assignment not found");
    const ctx = await courseContext(user, a.courseId, "member");
    if (ctx.staff) throw Err.invalidInput("course staff do not submit assignments");
    return { prefix: `submissions/${assignmentId}/${user.user_id}/`, max: SUBMISSION_MAX, video: false };
  }
  throw Err.invalidInput("unknown upload purpose");
}

function checkFile(name: string, size: number, target: { max: number; video: boolean }) {
  const ext = extOf(name);
  const type = TYPES[ext];
  if (!type || (VIDEO.has(ext) && !target.video)) {
    throw Err.invalidInput(ext ? `.${ext} files cannot be uploaded here` : "the file needs an extension (e.g. .pdf, .docx)");
  }
  if (!Number.isFinite(size) || size <= 0) throw Err.invalidInput("the file is empty");
  if (size > target.max) throw Err.invalidInput(`the file is too large (max ${Math.round(target.max / 1048576)} MB)`);
  return type;
}

/** Step 1: a one-file upload ticket (Blob token, or "server" mode for local development). */
export async function fileTicket(
  user: AuthUser,
  input: { purpose?: unknown; course_id?: unknown; assignment_id?: unknown; file_name?: unknown; size?: unknown }
) {
  const target = await uploadTarget(user, input.purpose, input);
  const name = String(input.file_name ?? "");
  const contentType = checkFile(name, Number(input.size), target);
  const pathname = `${target.prefix}${randomBytes(16).toString("hex")}/${safeFileName(name)}`;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { mode: "server" as const, pathname, content_type: contentType, max_bytes: Math.min(target.max, LOCAL_MAX) };
  }
  const { generateClientTokenFromReadWriteToken } = await import("@vercel/blob/client");
  const token = await generateClientTokenFromReadWriteToken({
    token: process.env.BLOB_READ_WRITE_TOKEN,
    pathname,
    allowedContentTypes: [contentType],
    maximumSizeInBytes: target.max,
    validUntil: Date.now() + 30 * 60_000,
    addRandomSuffix: false,
  });
  return { mode: "blob" as const, pathname, token, content_type: contentType, max_bytes: target.max };
}

/** Local development only: the file comes to the server and is written under public/uploads/. */
export async function uploadFileLocally(user: AuthUser, form: FormData) {
  if (process.env.BLOB_READ_WRITE_TOKEN) throw Err.invalidInput("upload the file with an upload ticket");
  const file = form.get("file");
  if (!(file instanceof File)) throw Err.invalidInput("file required");
  const target = await uploadTarget(user, form.get("purpose"), {
    course_id: form.get("course_id") ?? undefined,
    assignment_id: form.get("assignment_id") ?? undefined,
  });
  const contentType = checkFile(file.name, file.size, { ...target, max: Math.min(target.max, LOCAL_MAX) });
  const pathname = `${target.prefix}${randomBytes(16).toString("hex")}/${safeFileName(file.name)}`;
  const abs = path.join(process.cwd(), "public", "uploads", ...pathname.split("/"));
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, Buffer.from(await file.arrayBuffer()));
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return { url: `${base}/uploads/${pathname}`, pathname, name: file.name, size: file.size, mime: contentType };
}

/** Our Blob store's public host (the store id is part of the read-write token: vercel_blob_rw_<store>_<secret>). */
function ourBlobHost(): string | null {
  const m = (process.env.BLOB_READ_WRITE_TOKEN ?? "").match(/^vercel_blob_rw_([A-Za-z0-9]+)_/);
  return m ? `${m[1].toLowerCase()}.public.blob.vercel-storage.com` : null;
}

/**
 * Step 3: the URL a create call names must be a file uploaded through step 1 for THIS target
 * (our Blob store, the right path; or the local folder in development).
 */
export function checkUploadedUrl(raw: unknown, prefix: string): string {
  let u: URL;
  try {
    u = new URL(String(raw ?? ""));
  } catch {
    throw Err.invalidInput("invalid file address");
  }
  const host = ourBlobHost();
  const blob =
    u.protocol === "https:" &&
    (host ? u.hostname === host : u.hostname.endsWith(".public.blob.vercel-storage.com")) &&
    u.pathname.startsWith(`/${prefix}`);
  const local =
    !process.env.BLOB_READ_WRITE_TOKEN &&
    (u.hostname === "localhost" || u.hostname === "127.0.0.1") &&
    u.pathname.startsWith(`/uploads/${prefix}`);
  if (!blob && !local) throw Err.invalidInput("the file must be uploaded through Laambad");
  u.search = "";
  u.hash = "";
  return u.toString();
}

export function mimeFor(name: string) {
  return TYPES[extOf(name)] ?? "application/octet-stream";
}
