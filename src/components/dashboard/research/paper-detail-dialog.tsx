"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Download,
  Quote,
  Copy,
  FileText,
  User,
  Calendar,
  Tag,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { STATUS_CONFIG } from "./paper-card";
import type { ResearchPaper } from "@/types";

export function PaperDetailDialog({
  paper,
  open,
  onClose,
  onCite,
}: {
  paper: ResearchPaper | null;
  open: boolean;
  onClose: () => void;
  onCite: () => void;
}) {
  if (!paper) return null;
  const status = STATUS_CONFIG[paper.status] || STATUS_CONFIG.draft;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg leading-snug">
                {paper.title}
              </DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                {paper.author_name && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" /> {paper.author_name}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />{" "}
                  {formatDate(paper.created_at)}
                </span>
                <Badge variant={status.variant} className="text-xs">
                  {status.label}
                </Badge>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Separator />

        {/* Categories */}
        {paper.categories && paper.categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {paper.categories.map((cat) => (
              <Badge key={cat.id} variant="outline" className="gap-1 text-xs">
                <Tag className="h-3 w-3" /> {cat.name}
              </Badge>
            ))}
          </div>
        )}

        {/* Abstract */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Abstract</h4>
          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {paper.abstract || "No abstract provided."}
          </p>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {paper.pdf_url && (
            <Button size="sm" className="gap-1.5" asChild>
              <a
                href={paper.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="h-4 w-4" /> Download PDF
              </a>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onCite}
          >
            <Quote className="h-4 w-4" /> Cite this paper
          </Button>
          {paper.pdf_url && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                navigator.clipboard.writeText(paper.pdf_url);
                toast.success("PDF link copied!");
              }}
            >
              <Copy className="h-4 w-4" /> Copy Link
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
