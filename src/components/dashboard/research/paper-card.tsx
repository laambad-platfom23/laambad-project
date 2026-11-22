"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Quote,
  Eye,
  Share2,
  User,
  Calendar,
  Tag,
  Send,
  CheckCircle,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import type { ResearchPaper } from "@/types";

export const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "success" | "warning" | "outline" | "secondary" | "destructive";
    dot: string;
  }
> = {
  draft: { label: "Draft", variant: "outline", dot: "bg-gray-400" },
  submitted: { label: "Submitted", variant: "secondary", dot: "bg-blue-500" },
  in_review: { label: "In Review", variant: "warning", dot: "bg-amber-500" },
  approved: { label: "Published", variant: "success", dot: "bg-emerald-500" },
  rejected: { label: "Rejected", variant: "destructive", dot: "bg-red-500" },
};

export function PaperCard({
  paper,
  onView,
  onCite,
  onSubmit,
  onPublish,
}: {
  paper: ResearchPaper;
  onView: () => void;
  onCite: () => void;
  onSubmit?: () => void;
  onPublish?: () => void;
}) {
  const status = STATUS_CONFIG[paper.status] || STATUS_CONFIG.draft;
  const year = new Date(paper.created_at).getFullYear();

  return (
    <article className="group relative rounded-xl border border-border/60 bg-card p-5 transition-all hover:border-primary/20 hover:shadow-md">
      {/* Status indicator line */}
      <div
        className={`absolute left-0 top-4 bottom-4 w-1 rounded-r-full ${status.dot}`}
      />

      <div className="pl-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3">
          <button
            onClick={onView}
            className="text-left text-base font-semibold text-[#0B1F3A] hover:text-[#0B1F3A]/80 dark:text-[#FF8A66] dark:hover:text-[#FF8A66]/80 transition-colors leading-snug"
          >
            {paper.title}
          </button>
          <Badge variant={status.variant} className="shrink-0 text-xs">
            {status.label}
          </Badge>
        </div>

        {/* Author + date */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {paper.author_name && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" /> {paper.author_name}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" /> {formatDate(paper.created_at)} (
            {year})
          </span>
          {paper.categories && paper.categories.length > 0 && (
            <span className="flex items-center gap-1">
              <Tag className="h-3 w-3" />
              {paper.categories.map((c) => c.name).join(", ")}
            </span>
          )}
        </div>

        {/* Abstract */}
        {paper.abstract && (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground line-clamp-3">
            {paper.abstract}
          </p>
        )}

        {/* Actions bar */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {paper.pdf_url && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              asChild
            >
              <a
                href={paper.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="h-3.5 w-3.5" /> PDF
              </a>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={onCite}
          >
            <Quote className="h-3.5 w-3.5" /> Cite
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={onView}
          >
            <Eye className="h-3.5 w-3.5" /> View Details
          </Button>
          {paper.pdf_url && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                navigator.clipboard.writeText(paper.pdf_url);
                toast.success("Link copied!");
              }}
            >
              <Share2 className="h-3.5 w-3.5" /> Share
            </Button>
          )}
          {/* My Papers actions */}
          {onSubmit && paper.status === "draft" && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs bg-brand hover:bg-brand-hover text-white"
              onClick={onSubmit}
            >
              <Send className="h-3.5 w-3.5" /> Submit for Review
            </Button>
          )}
          {onPublish && (paper.status === "submitted" || paper.status === "in_review") && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={onPublish}
            >
              <CheckCircle className="h-3.5 w-3.5" /> Publish
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
