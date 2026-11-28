"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { uploadsApi } from "@/services/api/uploads";
import { getApiErrorMessage } from "@/lib/utils";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

/** Images, PDFs, and video — stored under public/uploads. */
const ACCEPT = "image/*,application/pdf,video/*";

/** A Vercel function accepts ≤ 4.5 MB, and a cover / picture never needs more than ~1920 px. */
const MAX_UPLOAD = 4_400_000;

/**
 * Photos straight from a phone are often 3–8 MB: shrink JPG / PNG / WebP to ≤ 1920 px (JPEG 85 %) in the
 * browser before uploading. Small images, GIFs and anything that does not get smaller are left alone.
 */
export async function shrinkImage(f: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/i.test(f.type) || f.size <= 1_500_000) return f;
  try {
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return f;
    ctx.fillStyle = "#ffffff"; // transparent PNG areas become white, not black
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob || blob.size >= f.size) return f;
    return new File([blob], `${f.name.replace(/\.[^.]+$/, "") || "image"}.jpg`, { type: "image/jpeg" });
  } catch {
    return f;
  }
}

export function AssetUploadButton({
  label = "Upload",
  onUrl,
  disabled,
  className,
  /** Supabase folder: courses | curriculum | avatars | assets | website */
  folder = "courses",
}: {
  label?: string;
  /** Second arg is optional original filename from the server (for default label). */
  onUrl: (url: string, meta?: { filename?: string }) => void;
  disabled?: boolean;
  className?: string;
  folder?: "courses" | "curriculum" | "avatars" | "assets" | "website";
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setPending(true);
    try {
      const f = picked.type.startsWith("image/") ? await shrinkImage(picked) : picked;
      if (f.size > MAX_UPLOAD) {
        toast.error("This file is larger than 4 MB. Please choose a smaller one.");
        return;
      }
      const result = await uploadsApi.uploadMedia(f, folder);
      if (result.url) {
        onUrl(result.url, { filename: result.filename });
        toast.success("Uploaded");
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Upload failed"));
    } finally {
      setPending(false);
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={ref}
        type="file"
        className="hidden"
        accept={ACCEPT}
        onChange={onChange}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        disabled={disabled || pending}
        onClick={() => ref.current?.click()}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        {label}
      </Button>
    </>
  );
}
