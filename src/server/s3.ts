/**
 * A5 — AWS S3 secure links. Course files stay in S3; a member of the course gets a link that is
 * signed for one object and expires after a few minutes, so a shared link stops working.
 *
 * Env (server only). Vercel reserves the AWS_* names, so the app uses its own:
 *   S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY   IAM user limited to the bucket (s3:GetObject …)
 *   S3_REGION                                default ap-south-1
 * Without keys the stored public address is returned (the bucket must then stay public-read).
 */
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const LINK_SECONDS = 5 * 60;
let client: S3Client | null = null;

export function isS3Configured() {
  return !!(process.env.S3_ACCESS_KEY_ID?.trim() && process.env.S3_SECRET_ACCESS_KEY?.trim());
}

function s3() {
  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION?.trim() || "ap-south-1",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!.trim(),
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!.trim(),
      },
    });
  }
  return client;
}

/** "https://<bucket>.s3.<region>.amazonaws.com/<key>" → { bucket, key } */
export function parseS3Url(url: string): { bucket: string; key: string } | null {
  try {
    const u = new URL(url);
    const m = u.hostname.match(/^([a-z0-9.-]+)\.s3[.-]([a-z0-9-]+\.)?amazonaws\.com$/);
    if (!m) return null;
    return { bucket: m[1], key: decodeURIComponent(u.pathname.replace(/^\//, "")) };
  } catch {
    return null;
  }
}

/**
 * A download link for one stored file. Signed (expires in 5 minutes, opens as a download with the
 * given file name) when keys are configured; otherwise the stored public address.
 */
export async function downloadLink(storedUrl: string, fileName: string): Promise<{ url: string; expires_in: number | null }> {
  const loc = parseS3Url(storedUrl);
  if (!loc || !isS3Configured()) return { url: storedUrl, expires_in: null };
  const safe = fileName.replace(/["\\\r\n]/g, "_");
  const url = await getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: loc.bucket,
      Key: loc.key,
      ResponseContentDisposition: `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    }),
    { expiresIn: LINK_SECONDS }
  );
  return { url, expires_in: LINK_SECONDS };
}
