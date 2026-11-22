"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { uploadsApi } from "@/services/api/uploads";
import { getApiErrorMessage } from "@/lib/utils";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

/** Images, PDFs, and video — stored under public/uploads. */
const ACCEPT = "image/*,application/pdf,video/*";

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
    const f = e.target.files?.[0];
    if (!f) return;
    setPending(true);
    try {
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
