"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { siteSettingsApi } from "@/services/api/site-settings";
import { getApiErrorMessage } from "@/lib/utils";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif";

/** Site image upload via POST /api/v1/admin/site-images/upload (local public/uploads). */
export function SiteImageUploadButton({
  settingKey,
  label = "Upload",
  onUrl,
  disabled,
  className,
}: {
  settingKey: string;
  label?: string;
  onUrl: (url: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    setPending(true);
    try {
      const { url } = await siteSettingsApi.uploadImage(settingKey, f);
      await siteSettingsApi.upsert({ [settingKey]: url });
      await queryClient.invalidateQueries({ queryKey: ["admin-site-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["public-site-settings"] });
      onUrl(url);
      toast.success("Image uploaded and saved");
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

/** @deprecated Use SiteImageUploadButton */
export const SupabaseSiteImageUploadButton = SiteImageUploadButton;
