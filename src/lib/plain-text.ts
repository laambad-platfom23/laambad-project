import { blocksToText, htmlToBlocks, looksLikeHtml } from "@/lib/wp-content";
import { decodeHtmlEntities } from "@/lib/html-entities";

/** Migrated texts can be WordPress HTML: turn them into plain text (they are never rendered as HTML). */
export function plain(s: string | null | undefined): string {
  const v = String(s ?? "");
  if (!v.trim()) return "";
  return (looksLikeHtml(v) ? blocksToText(htmlToBlocks(v)) : decodeHtmlEntities(v)).replace(/\n{3,}/g, "\n\n").trim();
}
