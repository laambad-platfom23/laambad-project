"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, VideoOff } from "lucide-react";
import apiClient from "@/services/api/client";
import { cn } from "@/lib/utils";
import { WatchTracker } from "@/components/learning/watch-tracker";

type Playback = { provider: "vdocipher"; otp: string; playback_info: string };

function errorCode(err: unknown): string | undefined {
  const e = err as { response?: { data?: { error?: { code?: string }; code?: string } } };
  return e?.response?.data?.error?.code ?? e?.response?.data?.code;
}

/** G5: plays a migrated VdoCipher lesson. The server issues a short-lived OTP per view. */
export function VdoCipherPlayer({
  lessonId,
  title,
  className,
  onEnded,
  onWatched,
}: {
  lessonId: string;
  title?: string;
  className?: string;
  onEnded?: () => void;
  /** A2: share of the video really played (0–100), reported every 10 % and at 80 % */
  onWatched?: (percent: number) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onWatchedRef = useRef(onWatched);
  onWatchedRef.current = onWatched;
  const q = useQuery({
    queryKey: ["vdocipher-otp", lessonId],
    queryFn: () => apiClient.get<Playback>(`/api/v1/lessons/${lessonId}/vdocipher`).then((r) => r.data),
    // OTPs expire (5 min): never reuse a cached one for a new view
    staleTime: 0,
    gcTime: 0,
    retry: (count, err) => errorCode(err) !== "vdocipher_not_configured" && count < 1,
    refetchOnWindowFocus: false,
  });

  useVdoEnded(
    iframeRef,
    q.data?.otp,
    () => onEndedRef.current?.(),
    (p) => onWatchedRef.current?.(p)
  );

  const shell = cn("relative flex aspect-video w-full items-center justify-center bg-black text-center", className);

  if (q.isLoading) {
    return (
      <div className={shell}>
        <Loader2 className="h-8 w-8 animate-spin text-white/70" aria-label="Loading video" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    const notConfigured = errorCode(q.error) === "vdocipher_not_configured";
    return (
      <div className={cn(shell, "px-6 text-white/85")}>
        <div>
          <VideoOff className="mx-auto mb-3 h-8 w-8 text-white/60" aria-hidden />
          <p className="font-medium">
            {notConfigured ? "VdoCipher video — not configured yet" : "The video could not be started"}
          </p>
          <p className="mt-1 text-xs text-white/60">
            {notConfigured
              ? "This lesson's video is hosted on VdoCipher. Playback needs the VdoCipher API secret on the server."
              : "Please reload the page or try again in a moment."}
          </p>
        </div>
      </div>
    );
  }
  const src = `https://player.vdocipher.com/v2/?otp=${encodeURIComponent(q.data.otp)}&playbackInfo=${encodeURIComponent(
    q.data.playback_info
  )}`;
  return (
    <div className={cn("relative aspect-video w-full bg-black", className)}>
      <iframe
        ref={iframeRef}
        title={title || "Lesson video"}
        src={src}
        className="absolute inset-0 h-full w-full border-0"
        allow="encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

// ---- VdoCipher player API (https://player.vdocipher.com/v2/api.js): tells us when the video ends
type VdoVideo = {
  addEventListener: (ev: string, cb: () => void) => void;
  removeEventListener?: (ev: string, cb: () => void) => void;
  currentTime: number;
  duration: number;
};
type VdoPlayerStatic = { getInstance: (iframe: HTMLIFrameElement) => { video: VdoVideo } };

let apiPromise: Promise<VdoPlayerStatic | null> | null = null;
function loadVdoApi(): Promise<VdoPlayerStatic | null> {
  const w = window as unknown as { VdoPlayer?: VdoPlayerStatic };
  if (w.VdoPlayer) return Promise.resolve(w.VdoPlayer);
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "https://player.vdocipher.com/v2/api.js";
      s.async = true;
      s.onload = () => resolve(w.VdoPlayer ?? null);
      s.onerror = () => {
        apiPromise = null;
        resolve(null);
      };
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

/**
 * Calls `cb` once per view when the video ends, and `watched` with the share of the video that was
 * really played (seeking forward does not count) so the lesson can complete at 80 %.
 */
function useVdoEnded(
  ref: React.RefObject<HTMLIFrameElement | null>,
  otp: string | undefined,
  cb: () => void,
  watched: (percent: number) => void
) {
  useEffect(() => {
    const iframe = ref.current;
    if (!iframe || !otp) return;
    let fired = false;
    let video: VdoVideo | null = null;
    const tracker = new WatchTracker(watched);
    const fire = () => {
      tracker.ended();
      if (fired) return;
      fired = true;
      cb();
    };
    const onTime = () => {
      if (video) tracker.tick(video.currentTime, video.duration);
    };
    const onSeek = () => tracker.seek();
    let cancelled = false;
    loadVdoApi().then((api) => {
      if (cancelled || !api) return;
      try {
        video = api.getInstance(iframe).video;
        video.addEventListener("ended", fire);
        video.addEventListener("timeupdate", onTime);
        video.addEventListener("seeking", onSeek);
      } catch {
        // player API unavailable: the learner can still press "Mark as complete"
      }
    });
    return () => {
      cancelled = true;
      video?.removeEventListener?.("ended", fire);
      video?.removeEventListener?.("timeupdate", onTime);
      video?.removeEventListener?.("seeking", onSeek);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);
}
