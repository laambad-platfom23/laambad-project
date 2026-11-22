"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { VdoCipherPlayer } from "@/components/learning/vdocipher-player";

function youtubeVideoId(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;
  try {
    const u = input.includes("://") ? new URL(input) : new URL("https://" + input.replace(/^\/\//, ""));
    if (u.hostname === "youtu.be" || u.hostname.endsWith(".youtu.be")) {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const embed = u.pathname.match(/\/embed\/([\w-]{11})/);
      if (embed?.[1]) return embed[1];
      const shorts = u.pathname.match(/\/shorts\/([\w-]{11})/);
      if (shorts?.[1]) return shorts[1];
    }
  } catch {
    /* ignore */
  }
  if (/^[\w-]{11}$/.test(input)) return input;
  return null;
}

function vimeoVideoId(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;
  try {
    const u = input.includes("://") ? new URL(input) : new URL("https://" + input);
    if (u.hostname.includes("vimeo.com")) {
      const m = u.pathname.match(/\/(?:video\/)?(\d+)/);
      if (m?.[1]) return m[1];
    }
  } catch {
    /* ignore */
  }
  const d = input.match(/(\d{6,})/);
  return d?.[1] ?? null;
}

function loomEmbedUrl(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;
  try {
    const u = input.includes("://") ? new URL(input) : new URL("https://" + input);
    if (u.hostname.includes("loom.com")) {
      const share = u.pathname.match(/\/share\/([a-zA-Z0-9]+)/);
      if (share?.[1]) return `https://www.loom.com/embed/${share[1]}`;
      const embed = u.pathname.match(/\/embed\/([a-zA-Z0-9]+)/);
      if (embed?.[1]) return `https://www.loom.com/embed/${embed[1]}`;
    }
  } catch {
    /* ignore */
  }
  return null;
}

type ShellProps = {
  fillHeight?: boolean;
  className?: string;
  children: ReactNode;
};

function VideoShell({ fillHeight, className, children }: ShellProps) {
  if (fillHeight) {
    return (
      <div
        className={cn(
          "relative h-full min-h-[10rem] w-full min-w-0 overflow-hidden rounded-xl bg-black shadow-lg",
          className,
        )}
      >
        {children}
      </div>
    );
  }
  return (
    <div className={cn("aspect-video w-full overflow-hidden rounded-xl bg-black shadow-lg", className)}>{children}</div>
  );
}

type Props = {
  videoProvider?: string;
  videoUrl?: string;
  title?: string;
  className?: string;
  /** Fill parent height (flex layout) instead of fixed 16:9 — use with a sized container. */
  fillHeight?: boolean;
  /** Needed for VdoCipher lessons (the server issues the playback OTP per lesson). */
  lessonId?: string;
  /** Called once when the learner reaches the end of the video (VdoCipher and direct files). */
  onEnded?: () => void;
};

export function LessonVideoPlayer({ videoProvider, videoUrl, title, className, fillHeight, lessonId, onEnded }: Props) {
  const url = (videoUrl ?? "").trim();
  const provider = (videoProvider ?? "").toLowerCase().trim();

  if (provider === "vdocipher" && lessonId) {
    return <VdoCipherPlayer key={lessonId} lessonId={lessonId} title={title} className={className} onEnded={onEnded} />;
  }
  const iframeClass = fillHeight ? "absolute inset-0 h-full w-full border-0" : "h-full w-full";

  if (!url) {
    return (
      <div
        className={cn(
          "flex w-full items-center justify-center rounded-xl border border-dashed text-center text-sm",
          fillHeight ? "h-full min-h-[10rem] flex-1" : "aspect-video",
          "border-border bg-muted/40 text-muted-foreground",
          "dark:border-white/30 dark:bg-[#061528]/80 dark:text-[#c4d4f4]",
          className,
        )}
      >
        <div className="px-6">
          <p className="font-medium text-foreground dark:text-white">No video for this lesson</p>
          <p className="mt-1 text-xs dark:text-[#c4d4f4]/80">Instructor can add a video URL in the curriculum.</p>
        </div>
      </div>
    );
  }

  if (provider === "youtube" || url.includes("youtube.com") || url.includes("youtu.be")) {
    const id = youtubeVideoId(url);
    if (!id) {
      return <UnsupportedVideo fillHeight={fillHeight} className={className} />;
    }
    return (
      <VideoShell fillHeight={fillHeight} className={className}>
        <iframe
          title={title || "Lesson video"}
          src={`https://www.youtube-nocookie.com/embed/${id}?rel=0`}
          className={iframeClass}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </VideoShell>
    );
  }

  if (provider === "vimeo" || url.includes("vimeo.com")) {
    const id = vimeoVideoId(url);
    if (!id) return <UnsupportedVideo fillHeight={fillHeight} className={className} />;
    return (
      <VideoShell fillHeight={fillHeight} className={className}>
        <iframe
          title={title || "Lesson video"}
          src={`https://player.vimeo.com/video/${id}`}
          className={iframeClass}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </VideoShell>
    );
  }

  if (provider === "loom") {
    const embed = loomEmbedUrl(url) || (url.includes("loom.com/embed") ? url : null);
    if (!embed) return <UnsupportedVideo fillHeight={fillHeight} className={className} />;
    return (
      <VideoShell fillHeight={fillHeight} className={className}>
        <iframe title={title || "Lesson video"} src={embed} className={iframeClass} allowFullScreen />
      </VideoShell>
    );
  }

  if (provider === "embed") {
    return (
      <VideoShell fillHeight={fillHeight} className={className}>
        <iframe title={title || "Lesson"} src={url} className={iframeClass} allowFullScreen />
      </VideoShell>
    );
  }

  if (provider === "direct" || /\.(mp4|webm|ogg)(\?|$)/i.test(url)) {
    return (
      <VideoShell fillHeight={fillHeight} className={className}>
        <video
          className={fillHeight ? "absolute inset-0 h-full w-full object-contain" : "h-full w-full"}
          controls
          playsInline
          preload="metadata"
          src={url}
          onEnded={onEnded}
        >
          <track kind="captions" />
        </video>
      </VideoShell>
    );
  }

  const yt = youtubeVideoId(url);
  if (yt) {
    return (
      <VideoShell fillHeight={fillHeight} className={className}>
        <iframe
          title={title || "Lesson video"}
          src={`https://www.youtube-nocookie.com/embed/${yt}?rel=0`}
          className={iframeClass}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </VideoShell>
    );
  }

  return <UnsupportedVideo fillHeight={fillHeight} className={className} />;
}

function UnsupportedVideo({ className, fillHeight }: { className?: string; fillHeight?: boolean }) {
  return (
    <div
      className={cn(
        "flex w-full items-center justify-center rounded-xl border px-4 text-center text-sm",
        fillHeight ? "h-full min-h-[10rem] flex-1" : "aspect-video",
        "border-border bg-muted/50 text-muted-foreground",
        "dark:border-white/30 dark:bg-[#0B1F3A]/70 dark:text-[#c4d4f4]",
        className,
      )}
    >
      Could not load this video URL. Check the link in the curriculum.
    </div>
  );
}
