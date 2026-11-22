"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Code2,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Pilcrow,
  Redo2,
  RemoveFormatting,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { looksLikeHtml, safeUrl } from "@/lib/wp-content";

/**
 * Small WYSIWYG editor (no extra dependencies) for course descriptions and lesson content.
 * The value is HTML limited to the tags the public renderer (lib/wp-content htmlToBlocks) understands.
 * Everything is sanitized through an inert DOMParser document before it reaches the live DOM, so
 * migrated WordPress HTML (or pasted HTML) can't run scripts or event handlers here.
 * Plain/markdown values (older non-HTML content) are shown formatted; they turn into HTML only when edited.
 */

const SKIP = new Set(["script", "style", "iframe", "object", "embed", "noscript", "svg", "template", "form", "input", "button", "select", "textarea"]);
const RENAME: Record<string, string> = {
  p: "p",
  div: "p",
  section: "p",
  blockquote: "p",
  h1: "h2",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h4",
  h6: "h4",
  strong: "strong",
  b: "strong",
  em: "em",
  i: "em",
  a: "a",
  ul: "ul",
  ol: "ol",
  li: "li",
  br: "br",
  img: "img",
};

function cleanChildren(from: Node, to: Element, doc: Document) {
  from.childNodes.forEach((n) => {
    if (n.nodeType === 3) {
      to.appendChild(doc.createTextNode(n.textContent ?? ""));
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag)) return;
    const name = RENAME[tag];
    if (!name) {
      cleanChildren(el, to, doc); // unknown wrapper (span, font, figure…): keep its content
      return;
    }
    if (name === "img") {
      const src = safeUrl(el.getAttribute("src") ?? undefined);
      if (!src) return;
      const img = doc.createElement("img");
      img.setAttribute("src", src);
      img.setAttribute("alt", el.getAttribute("alt") ?? "");
      to.appendChild(img);
      return;
    }
    const out = doc.createElement(name);
    if (name === "a") {
      const href = safeUrl(el.getAttribute("href") ?? undefined);
      if (!href) {
        cleanChildren(el, to, doc);
        return;
      }
      out.setAttribute("href", href);
      out.setAttribute("target", "_blank");
      out.setAttribute("rel", "noopener noreferrer");
    }
    if (name !== "br") cleanChildren(el, out, doc);
    to.appendChild(out);
  });
}

export function sanitizeEditorHtml(html: string): string {
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html"); // inert: no scripts, no loads
  const root = doc.createElement("div");
  cleanChildren(doc.body, root, doc);
  // drop empty paragraphs left by WordPress (<p><br></p>, <p>&nbsp;</p>)
  root.querySelectorAll("p,h2,h3,h4,li").forEach((el) => {
    if (!el.textContent?.replace(/ /g, " ").trim() && !el.querySelector("img")) el.remove();
  });
  return root.innerHTML.trim();
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Markdown-ish plain text (## headings, - lists, 1. lists, blank-line paragraphs) → editor HTML. */
function plainToHtml(text: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const ul = line.match(/^[-*•]\s+(.*)$/);
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (!line) {
      flushPara();
      closeList();
    } else if (h) {
      flushPara();
      closeList();
      const lvl = h[1].length <= 2 ? 2 : h[1].length === 3 ? 3 : 4;
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
    } else if (ul || ol) {
      flushPara();
      const want = ul ? "ul" : "ol";
      if (list !== want) {
        closeList();
        out.push(`<${want}>`);
        list = want;
      }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
    } else {
      closeList();
      para.push(line);
    }
  }
  flushPara();
  closeList();
  return out.join("");
}

function toEditorHtml(value: string): string {
  if (!value.trim()) return "";
  return sanitizeEditorHtml(looksLikeHtml(value) ? value : plainToHtml(value));
}

type Tool = { icon: typeof Bold; label: string; run: () => void; active?: string };

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 220,
  id,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  id?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const [source, setSource] = useState(false);
  const [, force] = useState(0);

  // Load external value into the editor (initial load, switching lessons, after save/reset).
  useEffect(() => {
    if (source || !ref.current) return;
    if (value === lastEmitted.current) return;
    ref.current.innerHTML = toEditorHtml(value);
    lastEmitted.current = value;
  }, [value, source]);

  const emit = () => {
    if (!ref.current) return;
    const html = ref.current.textContent?.trim() || ref.current.querySelector("img") ? sanitizeEditorHtml(ref.current.innerHTML) : "";
    lastEmitted.current = html;
    onChange(html);
    force((n) => n + 1);
  };

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
  };

  const tools: (Tool | "|")[] = [
    { icon: Pilcrow, label: "Paragraph", run: () => exec("formatBlock", "<p>") },
    { icon: Heading2, label: "Heading", run: () => exec("formatBlock", "<h2>") },
    { icon: Heading3, label: "Sub-heading", run: () => exec("formatBlock", "<h3>") },
    "|",
    { icon: Bold, label: "Bold", run: () => exec("bold"), active: "bold" },
    { icon: Italic, label: "Italic", run: () => exec("italic"), active: "italic" },
    "|",
    { icon: List, label: "Bulleted list", run: () => exec("insertUnorderedList"), active: "insertUnorderedList" },
    { icon: ListOrdered, label: "Numbered list", run: () => exec("insertOrderedList"), active: "insertOrderedList" },
    "|",
    {
      icon: Link2,
      label: "Add link",
      run: () => {
        const url = safeUrl(globalThis.prompt("Link URL (https://…)") ?? undefined);
        if (url) exec("createLink", url);
      },
    },
    { icon: Link2Off, label: "Remove link", run: () => exec("unlink") },
    {
      icon: ImagePlus,
      label: "Insert image (URL)",
      run: () => {
        const url = safeUrl(globalThis.prompt("Image URL (https://…)") ?? undefined);
        if (url) exec("insertImage", url);
      },
    },
    "|",
    { icon: RemoveFormatting, label: "Clear formatting", run: () => exec("removeFormat") },
    { icon: Undo2, label: "Undo", run: () => exec("undo") },
    { icon: Redo2, label: "Redo", run: () => exec("redo") },
  ];

  const isActive = (cmd?: string) => {
    if (!cmd || typeof document === "undefined" || !ref.current?.contains(document.activeElement)) return false;
    try {
      return document.queryCommandState(cmd);
    } catch {
      return false;
    }
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-input bg-background transition-colors focus-within:border-brand/60 focus-within:ring-2 focus-within:ring-brand/20",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 px-2 py-1.5">
        {tools.map((t, i) =>
          t === "|" ? (
            <span key={i} className="mx-1 h-5 w-px bg-border" aria-hidden />
          ) : (
            <button
              key={t.label}
              type="button"
              title={t.label}
              aria-label={t.label}
              disabled={source}
              onMouseDown={(e) => e.preventDefault() /* keep the selection in the editor */}
              onClick={t.run}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
                isActive(t.active) && "bg-background text-brand shadow-sm",
              )}
            >
              <t.icon className="h-4 w-4" />
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => {
            if (source) {
              // back to visual: reload the (possibly edited) HTML
              lastEmitted.current = null;
            }
            setSource((s) => !s);
          }}
          className={cn(
            "ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold transition",
            source ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-background hover:text-foreground",
          )}
          title="Edit the HTML source"
        >
          <Code2 className="h-4 w-4" /> HTML
        </button>
      </div>

      {source ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="block w-full resize-y bg-background px-4 py-3 font-mono text-[12.5px] leading-relaxed text-foreground outline-none"
          style={{ minHeight }}
        />
      ) : (
        <div
          id={id}
          ref={ref}
          role="textbox"
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          onInput={emit}
          onKeyUp={() => force((n) => n + 1)}
          onMouseUp={() => force((n) => n + 1)}
          onPaste={(e) => {
            e.preventDefault();
            const html = e.clipboardData.getData("text/html");
            if (html) document.execCommand("insertHTML", false, sanitizeEditorHtml(html));
            else document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
            emit();
          }}
          className={cn(
            "max-h-[640px] overflow-y-auto px-4 py-3 text-[14.5px] leading-relaxed text-foreground outline-none",
            "empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
            "[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold first:[&_h2]:mt-0",
            "[&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-semibold",
            "[&_h4]:mb-1.5 [&_h4]:mt-3 [&_h4]:text-base [&_h4]:font-semibold",
            "[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-0.5",
            "[&_a]:font-medium [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2",
            "[&_img]:my-3 [&_img]:max-h-64 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-border",
          )}
          style={{ minHeight }}
        />
      )}
    </div>
  );
}
