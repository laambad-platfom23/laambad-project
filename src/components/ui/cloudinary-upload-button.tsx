"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, getApiErrorMessage } from "@/lib/utils";
import { uploadsApi } from "@/services/api/uploads";

type Props = {
  /** Maps to folder under public/uploads. */
  folder?: "courses" | "curriculum" | "avatars" | "assets" | "website";
  /** Restrict the native file picker, e.g. "image/*" or ".pdf,.docx". */
  accept?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  /** Fired with the public Supabase URL once the upload completes. */
  onUploaded: (url: string) => void;
};

/** Upload button → Supabase Storage via the Sodemy API (no Cloudinary). */
export function CloudinaryUploadButton({
  folder = "assets",
  accept = "image/*,application/pdf,video/*",
  label = "Upload",
  className,
  disabled,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = () => {
    inputRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const result = await uploadsApi.uploadMedia(file, folder);
      onUploaded(result.url);
      toast.success("Uploaded to Supabase");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Upload failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleFile} />
      <Button
        type="button"
        variant="outline"
        className={cn("gap-2", className)}
        onClick={pick}
        disabled={disabled || busy}
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading…
          </>
        ) : (
          <>
            <UploadCloud className="h-4 w-4" />
            {label}
          </>
        )}
      </Button>
    </>
  );
}
