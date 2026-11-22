/**
 * Decode the HTML entities WordPress stored in migrated titles and term names
 * (e.g. "Graphic Design &amp; Video Editing"). Display-only: the database is not changed.
 */
const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
};

export function decodeHtmlEntities(value: string): string;
export function decodeHtmlEntities(value: string | null | undefined): string | null | undefined;
export function decodeHtmlEntities(value: string | null | undefined) {
  if (!value || !value.includes("&")) return value;
  // Two passes handle double-encoded values such as "&amp;amp;".
  let out = value;
  for (let i = 0; i < 2 && out.includes("&"); i++) {
    out = out.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === "#") {
        const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
      }
      return NAMED[code.toLowerCase()] ?? m;
    });
  }
  return out;
}
