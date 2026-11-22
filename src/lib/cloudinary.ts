/**
 * Cloudinary signed direct uploads.
 *
 * The browser never sees the API secret. Flow:
 *   1) Ask our backend (POST /api/v1/uploads/signature) for a short-lived signature.
 *   2) Upload the file straight to Cloudinary with that signature.
 *   3) Store the returned secure_url in our database (course cover, video, doc, avatar…).
 *
 * Backend reads CLOUDINARY_URL from its .env — nothing to configure on the client.
 */
import apiClient from "@/services/api/client";

export type CloudinaryResourceType = "image" | "video" | "raw" | "auto";

export type CloudinaryUploadResult = {
  secureUrl: string;
  publicId: string;
  resourceType: string;
  format: string;
  bytes: number;
  width?: number;
  height?: number;
  originalFilename?: string;
};

export type CloudinaryUploadOptions = {
  /** image (photos), video (video/audio), raw (pdf/docs), or auto. */
  resourceType?: CloudinaryResourceType;
  /** Cloudinary folder, e.g. "Sodemy/courses". */
  folder?: string;
  /** Progress 0..100 for UI bars. */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

type SignatureResponse = {
  cloud_name: string;
  api_key: string;
  timestamp: string;
  folder: string;
  signature: string;
};

/** Uploads a single file to Cloudinary (signed) and resolves with the stored URL. */
export async function uploadToCloudinary(
  file: File,
  opts: CloudinaryUploadOptions = {}
): Promise<CloudinaryUploadResult> {
  const resourceType = opts.resourceType ?? "auto";

  // 1) Get a signature from our backend.
  const { data: sig } = await apiClient.post<SignatureResponse>("/api/v1/uploads/signature", {
    folder: opts.folder ?? "",
  });

  // 2) Upload straight to Cloudinary with the signed params.
  const endpoint = `https://api.cloudinary.com/v1_1/${sig.cloud_name}/${resourceType}/upload`;
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", sig.api_key);
  form.append("timestamp", sig.timestamp);
  form.append("signature", sig.signature);
  if (sig.folder) form.append("folder", sig.folder);

  return new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint, true);

    if (opts.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) opts.onProgress!(Math.round((e.loaded / e.total) * 100));
      };
    }
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const r = JSON.parse(xhr.responseText);
          resolve({
            secureUrl: r.secure_url,
            publicId: r.public_id,
            resourceType: r.resource_type,
            format: r.format,
            bytes: r.bytes,
            width: r.width,
            height: r.height,
            originalFilename: r.original_filename,
          });
        } catch {
          reject(new Error("Cloudinary returned an unexpected response."));
        }
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try {
          const err = JSON.parse(xhr.responseText);
          if (err?.error?.message) msg = err.error.message;
        } catch {
          /* keep default */
        }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Network error while uploading to Cloudinary."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));

    xhr.send(form);
  });
}
