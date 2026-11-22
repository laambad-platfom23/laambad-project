import type { ContentBlock, ContentInline } from "@/lib/wp-content";
import { cn } from "@/lib/utils";

function Inline({ part }: { part: ContentInline }) {
  let node: React.ReactNode = part.text;
  if (part.bold) node = <strong className="font-semibold text-[#0B1F3A] dark:text-white">{node}</strong>;
  if (part.italic) node = <em>{node}</em>;
  if (part.href) {
    const external = /^https?:\/\//i.test(part.href);
    node = (
      <a
        href={part.href}
        className="font-medium text-[#E84A27] underline decoration-[#E84A27]/35 underline-offset-2 hover:decoration-[#E84A27] dark:text-[#FF8A66]"
        {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
      >
        {node}
      </a>
    );
  }
  return <>{node}</>;
}

/** Renders a migrated WordPress description that the server already turned into safe blocks. */
export function CourseDescriptionBlocks({ blocks, className }: { blocks: ContentBlock[]; className?: string }) {
  return (
    <div className={cn("space-y-3 text-[14px] leading-relaxed text-[#475569] dark:text-muted-foreground", className)}>
      {blocks.map((b, i) => {
        if (b.type === "image") {
          return (
            // eslint-disable-next-line @next/next/no-img-element -- legacy content images of unknown size
            <img
              key={i}
              src={b.src}
              alt={b.alt}
              loading="lazy"
              className="h-auto max-h-28 w-auto max-w-full rounded-lg object-contain"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          );
        }
        const content = b.parts.map((p, j) => <Inline key={j} part={p} />);
        if (b.type === "heading") {
          const cls = "font-bold text-[#0B1F3A] dark:text-white";
          if (b.level === 2) return <h3 key={i} className={cn(cls, "text-lg")}>{content}</h3>;
          if (b.level === 3) return <h4 key={i} className={cn(cls, "text-base")}>{content}</h4>;
          return <h5 key={i} className={cn(cls, "text-[15px]")}>{content}</h5>;
        }
        if (b.type === "list-item") {
          return (
            <p key={i} className="flex gap-2 pl-1">
              <span aria-hidden className="select-none text-[#E84A27]">
                •
              </span>
              <span>{content}</span>
            </p>
          );
        }
        return (
          <p key={i} className="text-pretty">
            {content}
          </p>
        );
      })}
    </div>
  );
}
