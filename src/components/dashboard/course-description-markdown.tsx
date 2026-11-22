"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

function MarkdownImage({ src, alt }: { src?: string | null; alt?: string | null }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <span className="my-1 block rounded-md border border-dashed border-border bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80">{alt?.trim() || "Cover image"}</span>
        {src ? (
          <a
            href={src}
            className="mt-1 block truncate text-primary underline underline-offset-2"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open image link (use a direct .jpg/.png URL if preview fails)
          </a>
        ) : null}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- user-supplied course cover URLs
    <img
      src={src}
      alt={alt ?? ""}
      className="my-2 max-h-32 w-full rounded-md object-cover"
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

const mdComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  img: ({ src, alt }) => (
    <MarkdownImage
      src={typeof src === "string" ? src : undefined}
      alt={typeof alt === "string" ? alt : undefined}
    />
  ),
  h1: ({ children }) => (
    <h3 className="mb-1 mt-2 text-base font-semibold text-foreground first:mt-0">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="mb-1 mt-2 text-base font-semibold text-foreground first:mt-0">{children}</h3>
  ),
  h3: ({ children }) => <h4 className="mb-1 mt-1 text-sm font-semibold text-foreground">{children}</h4>,
  hr: () => <hr className="my-3 border-border" />,
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium text-primary underline underline-offset-2"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-4">{children}</ol>,
  li: ({ children }) => <li className="leading-snug">{children}</li>,
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md border bg-muted/50 p-2 text-xs">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-primary/40 pl-3 text-muted-foreground">{children}</blockquote>
  ),
};

export function CourseDescriptionMarkdown({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  const trimmed = markdown.trim();
  if (!trimmed) return null;
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {trimmed}
      </ReactMarkdown>
    </div>
  );
}
