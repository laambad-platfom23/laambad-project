import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { newId } from "@/lib/db";

const PUBLIC_UPLOADS = path.join(process.cwd(), "public", "uploads");

function publicBaseUrl() {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  return base;
}

/** Save a file under public/uploads/{folder}/ and return a public URL. */
export async function savePublicUpload(
  folder: string,
  filename: string,
  data: Buffer,
  contentType?: string
): Promise<{ url: string; storageKey: string; filename: string }> {
  const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, "") || "assets";
  const ext = filename.includes(".")
    ? filename.split(".").pop()!.replace(/[^a-zA-Z0-9]/g, "")
    : contentType?.includes("png")
      ? "png"
      : contentType?.includes("webp")
        ? "webp"
        : "bin";
  const outName = `${newId()}.${ext || "bin"}`;
  const storageKey = `uploads/${safeFolder}/${outName}`;

  // Vercel: the function disk is read-only, so files go to Vercel Blob (public CDN URL).
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(storageKey, data, {
      access: "public",
      contentType: contentType || "application/octet-stream",
      addRandomSuffix: false,
      cacheControlMaxAge: 31536000,
    });
    return { url: blob.url, storageKey, filename: outName };
  }

  const dir = path.join(PUBLIC_UPLOADS, safeFolder);
  await mkdir(dir, { recursive: true });
  const abs = path.join(dir, outName);
  await writeFile(abs, data);
  const url = `${publicBaseUrl()}/${storageKey}`;
  return { url, storageKey, filename: outName };
}
