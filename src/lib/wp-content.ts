import { decodeHtmlEntities } from "@/lib/html-entities";

/**
 * Migrated WordPress course descriptions are HTML. Instead of injecting HTML into the page
 * (XSS risk), the server turns it into plain data blocks that React renders with escaped text.
 * Only a small, known set of tags is understood; everything else is dropped (its text is kept).
 */
export type ContentInline = { text: string; href?: string; bold?: boolean; italic?: boolean };
export type ContentBlock =
  | { type: "heading"; level: 2 | 3 | 4; parts: ContentInline[] }
  | { type: "paragraph"; parts: ContentInline[] }
  | { type: "list-item"; ordered: boolean; parts: ContentInline[] }
  | { type: "image"; src: string; alt: string };

const BLOCK_TAGS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "section"]);
const SKIP_CONTENT = new Set(["script", "style", "iframe", "noscript", "svg", "template"]);

export function looksLikeHtml(s: string | null | undefined): boolean {
  return !!s && /<\/?(p|h[1-6]|div|img|a|br|ul|ol|li|strong|em|span)\b/i.test(s);
}

/** Allow only http(s) and site-relative URLs. */
export function safeUrl(raw: string | undefined): string | undefined {
  const u = decodeHtmlEntities(raw ?? "").trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  return undefined;
}

function attr(attrs: string, name: string): string | undefined {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4]) : undefined;
}

/** `rewriteSrc` may map an image URL to another one, or return null to drop the image. */
export function htmlToBlocks(html: string, rewriteSrc?: (src: string) => string | null): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let parts: ContentInline[] = [];
  let current: { type: "heading"; level: 2 | 3 | 4 } | { type: "paragraph" } | { type: "list-item"; ordered: boolean } = {
    type: "paragraph",
  };
  let href: string | undefined;
  let bold = 0;
  let italic = 0;
  const listStack: boolean[] = [];
  let skipDepth = 0;

  const flush = () => {
    // merge adjacent text and trim the edges
    const merged: ContentInline[] = [];
    for (const p of parts) {
      const last = merged[merged.length - 1];
      if (last && last.href === p.href && last.bold === p.bold && last.italic === p.italic) last.text += p.text;
      else merged.push({ ...p });
    }
    if (merged.length) {
      merged[0].text = merged[0].text.replace(/^\s+/, "");
      merged[merged.length - 1].text = merged[merged.length - 1].text.replace(/\s+$/, "");
    }
    const clean = merged.filter((p) => p.text.length > 0);
    if (clean.length) blocks.push({ ...current, parts: clean } as ContentBlock);
    parts = [];
  };

  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0].startsWith("<!--")) continue;
    if (m[4] !== undefined) {
      if (skipDepth) continue;
      const text = decodeHtmlEntities(m[4]).replace(/\s+/g, " ");
      if (text.trim() || parts.length) {
        parts.push({
          text,
          ...(href ? { href } : {}),
          ...(bold ? { bold: true } : {}),
          ...(italic ? { italic: true } : {}),
        });
      }
      continue;
    }
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    const attrs = m[3] ?? "";
    if (SKIP_CONTENT.has(tag)) {
      skipDepth += closing ? -1 : 1;
      if (skipDepth < 0) skipDepth = 0;
      continue;
    }
    if (skipDepth) continue;

    if (tag === "ul" || tag === "ol") {
      flush();
      if (closing) listStack.pop();
      else listStack.push(tag === "ol");
      current = { type: "paragraph" };
    } else if (BLOCK_TAGS.has(tag)) {
      flush();
      if (closing) current = { type: "paragraph" };
      else if (/^h[1-6]$/.test(tag)) {
        const n = Number(tag[1]);
        current = { type: "heading", level: (n <= 2 ? 2 : n === 3 ? 3 : 4) as 2 | 3 | 4 };
      } else if (tag === "li") current = { type: "list-item", ordered: listStack[listStack.length - 1] ?? false };
      else current = { type: "paragraph" };
    } else if (tag === "br") {
      flush();
    } else if (tag === "img" && !closing) {
      const raw = safeUrl(attr(attrs, "src"));
      const src = raw && rewriteSrc ? rewriteSrc(raw) : raw;
      if (src) {
        flush();
        blocks.push({ type: "image", src, alt: decodeHtmlEntities(attr(attrs, "alt") ?? "") });
      }
    } else if (tag === "a") {
      href = closing ? undefined : safeUrl(attr(attrs, "href"));
    } else if (tag === "strong" || tag === "b") {
      bold = Math.max(0, bold + (closing ? -1 : 1));
    } else if (tag === "em" || tag === "i") {
      italic = Math.max(0, italic + (closing ? -1 : 1));
    }
    // any other tag: ignored, its text content is kept
  }
  flush();
  return blocks;
}

/** Plain-text version of the blocks (for hero blurbs, search, meta descriptions). */
export function blocksToText(blocks: ContentBlock[]): string {
  return blocks
    .filter((b) => b.type !== "image")
    .map((b) => ("parts" in b ? b.parts.map((p) => p.text).join("") : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
