"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import type { ResearchPaper } from "@/types";

type FormatKey = "APA" | "MLA" | "Chicago" | "BibTeX";

function generateCitations(paper: ResearchPaper) {
  const year = new Date(paper.created_at).getFullYear();
  const author = paper.author_name || "Unknown";
  const parts = author.split(" ");
  const last = parts.pop() || author;
  const first = parts.join(" ");
  const initial = first ? first.charAt(0) + "." : "";
  const url = paper.pdf_url ? ` ${paper.pdf_url}` : "";

  return {
    APA: `${last}, ${initial} (${year}). ${paper.title}. Laambad Research.${url}`,
    MLA: `${last}, ${first}. "${paper.title}." Laambad Research, ${year}.${url}`,
    Chicago: `${last}, ${first}. "${paper.title}." Laambad Research (${year}).${url}`,
    BibTeX: `@article{${last.toLowerCase()}${year},
  title={${paper.title}},
  author={${last}, ${first}},
  journal={Laambad Research},
  year={${year}}
}`,
  };
}

export function CiteDialog({
  paper,
  open,
  onClose,
}: {
  paper: ResearchPaper | null;
  open: boolean;
  onClose: () => void;
}) {
  const [activeFormat, setActiveFormat] = useState<FormatKey>("APA");
  const [copied, setCopied] = useState<string | null>(null);

  if (!paper) return null;
  const citations = generateCitations(paper);
  const formats: FormatKey[] = ["APA", "MLA", "Chicago", "BibTeX"];

  const handleCopy = (format: FormatKey) => {
    navigator.clipboard.writeText(citations[format]);
    setCopied(format);
    toast.success(`${format} citation copied!`);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">Cite this paper</DialogTitle>
          <DialogDescription className="line-clamp-1 text-xs">
            {paper.title}
          </DialogDescription>
        </DialogHeader>

        {/* Format tabs */}
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
          {formats.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFormat(f)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeFormat === f
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Citation text */}
        <div className="relative rounded-lg border bg-muted/30 p-4">
          <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground font-mono">
            {citations[activeFormat]}
          </pre>
          <Button
            size="sm"
            variant="outline"
            className="absolute right-2 top-2 h-8 gap-1.5 text-xs"
            onClick={() => handleCopy(activeFormat)}
          >
            {copied === activeFormat ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" /> Copy
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
