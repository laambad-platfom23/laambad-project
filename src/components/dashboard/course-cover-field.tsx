"use client";

import { useEffect, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AssetUploadButton } from "@/components/dashboard/asset-upload-button";
import { useAuthenticatedImageSrc } from "@/hooks/use-authenticated-image-src";
import { extractPreviewFileIdFromUrl } from "@/lib/course-cover";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  value: string;
  onChange: (url: string) => void;
  className?: string;
};

function CoverPreview({ url }: { url: string }) {
  const trimmed = url.trim();
  const { displaySrc, loading, failed } = useAuthenticatedImageSrc(trimmed || null);
  const [directBroken, setDirectBroken] = useState(false);
  const fileId = trimmed ? extractPreviewFileIdFromUrl(trimmed) : null;

  useEffect(() => {
    setDirectBroken(false);
  }, [trimmed]);

  if (!trimmed) {
    return (
      <div className="flex h-32 max-w-lg items-center justify-center rounded-xl border border-dashed border-muted-foreground/25 bg-muted/30 text-muted-foreground">
        <div className="flex flex-col items-center gap-1.5 text-center text-xs">
          <ImageOff className="h-8 w-8 opacity-50" strokeWidth={1.5} />
          <span>No image yet</span>
        </div>
      </div>
    );
  }

  if (fileId) {
    if (loading) {
      return (
        <div className="flex h-40 max-w-lg items-center justify-center rounded-xl border border-border/80 bg-muted/20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }
    if (failed || !displaySrc) {
      return (
        <div className="flex h-32 max-w-lg items-center justify-center rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 px-3 text-center text-xs text-muted-foreground">
          Preview failed — open the file URL while signed in, or use a public image URL.
        </div>
      );
    }
    return (
      <div className="relative h-40 w-full max-w-lg overflow-hidden rounded-xl border border-border/80 bg-muted/20 shadow-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={displaySrc} alt="" className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-black/25" />
      </div>
    );
  }

  if (directBroken) {
    return (
      <div className="flex h-32 max-w-lg items-center justify-center rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 text-xs text-muted-foreground">
        Preview failed — check the URL or re-upload.
      </div>
    );
  }

  return (
    <div className="relative h-40 w-full max-w-lg overflow-hidden rounded-xl border border-border/80 bg-muted/20 shadow-inner">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={displaySrc!}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setDirectBroken(true)}
      />
      <div className="pointer-events-none absolute inset-0 bg-black/25" />
    </div>
  );
}

/**
 * Course hero image: paste URL or upload to Supabase Storage.
 */
export function CourseCoverField({ id, value, onChange, className }: Props) {
  const url = value.trim();

  return (
    <div className={cn("space-y-3", className)}>
      <div>
        <Label htmlFor={id}>Course image</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Upload a JPG, PNG or WebP image (large photos are reduced automatically), or paste an image address. Best size: 1280 × 720.
        </p>
      </div>

      <CoverPreview url={value} />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          className="min-w-[min(100%,220px)] flex-1"
          placeholder="Image URL (set by upload or paste)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <AssetUploadButton folder="courses" label="Upload image" onUrl={(u) => onChange(u)} />
        {url ? (
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onChange("")}>
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}
