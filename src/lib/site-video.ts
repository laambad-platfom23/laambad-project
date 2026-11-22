/** Parse YouTube / Vimeo URLs into autoplay embed sources. */

export type SiteVideoProvider = "youtube" | "vimeo";

export type SiteVideoEmbed = {
  provider: SiteVideoProvider;
  id: string;
  /** iframe src with autoplay + mute (required for reliable autoplay). */
  embedSrc: string;
};

export function youtubeVideoId(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;
  try {
    const u = input.includes("://")
      ? new URL(input)
      : new URL("https://" + input.replace(/^\/\//, ""));
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

export function vimeoVideoId(raw: string): string | null {
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

/** Detect YouTube/Vimeo and build an autoplay (muted, loop) embed URL. */
export function resolveSiteVideoEmbed(raw: string | undefined | null): SiteVideoEmbed | null {
  const input = raw?.trim() ?? "";
  if (!input) return null;

  const yt = youtubeVideoId(input);
  if (yt) {
    const params = new URLSearchParams({
      autoplay: "1",
      mute: "1",
      muted: "1",
      loop: "1",
      playlist: yt,
      controls: "1",
      rel: "0",
      playsinline: "1",
      modestbranding: "1",
    });
    return {
      provider: "youtube",
      id: yt,
      embedSrc: `https://www.youtube-nocookie.com/embed/${yt}?${params.toString()}`,
    };
  }

  const vimeo = vimeoVideoId(input);
  if (vimeo && (/vimeo\.com/i.test(input) || /^\d{6,}$/.test(input.trim()))) {
    const params = new URLSearchParams({
      autoplay: "1",
      muted: "1",
      loop: "1",
      background: "0",
      title: "0",
      byline: "0",
      portrait: "0",
    });
    return {
      provider: "vimeo",
      id: vimeo,
      embedSrc: `https://player.vimeo.com/video/${vimeo}?${params.toString()}`,
    };
  }

  return null;
}

export function isSiteVideoUrl(raw: string | undefined | null): boolean {
  return resolveSiteVideoEmbed(raw) != null;
}
