import { Err } from "@/lib/api/errors";
import { savePublicUpload } from "@/lib/local-storage";
import type { AuthUser } from "@/lib/auth/request";

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
