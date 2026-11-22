"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { researchApi } from "@/services/api/research";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Loader2, FileText, Upload, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import type { ResearchCategory } from "@/types";

export function SubmitPaperForm({
  categories,
  onSuccess,
}: {
  categories: ResearchCategory[];
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);

  const toggleCat = (id: string) =>
    setSelectedCats((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: paper } = await researchApi.createPaper({
        title: title.trim(),
        abstract: abstract.trim() || undefined,
        pdf_url: pdfUrl.trim(),
        category_ids: selectedCats.length > 0 ? selectedCats : undefined,
      });
      // Auto-submit for review so the paper becomes publicly visible
      try {
        await researchApi.submitPaper(paper.id);
      } catch {
        // If submit fails, the paper is still created as draft
      }
      return paper;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["research-papers"] });
      queryClient.invalidateQueries({ queryKey: ["public-research"] });
      toast.success("Paper submitted for review!");
      setTitle("");
      setAbstract("");
      setPdfUrl("");
      setSelectedCats([]);
      onSuccess();
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || "Failed to submit paper");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Paper title is required");
      return;
    }
    if (!pdfUrl.trim()) {
      toast.error("PDF URL is required");
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="mx-auto mt-6 max-w-2xl">
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        {/* Header */}
        <div className="border-b bg-[#0B1F3A]/5 px-6 py-5 dark:bg-[#0B1F3A]/70">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B1F3A]/10 dark:bg-[#E84A27]/10">
              <FileText className="h-5 w-5 text-[#0B1F3A] dark:text-[#FF8A66]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Submit a Research Paper</h2>
              <p className="text-sm text-muted-foreground">
                Your paper will be reviewed by peers before publication.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="paper-title" className="text-sm font-medium">
              Paper Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="paper-title"
              placeholder="Enter the full title of your research paper"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-11"
            />
          </div>

          {/* Abstract */}
          <div className="space-y-2">
            <Label htmlFor="paper-abstract" className="text-sm font-medium">
              Abstract
            </Label>
            <Textarea
              id="paper-abstract"
              placeholder="Provide a brief summary of your research, methodology, and findings..."
              rows={6}
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              A well-written abstract improves discoverability.{" "}
              {abstract.length > 0 && (
                <span className="font-medium">{abstract.length} characters</span>
              )}
            </p>
          </div>

          {/* PDF URL */}
          <div className="space-y-2">
            <Label htmlFor="paper-pdf" className="text-sm font-medium">
              PDF URL <span className="text-red-500">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="paper-pdf"
                placeholder="https://example.com/paper.pdf"
                value={pdfUrl}
                onChange={(e) => setPdfUrl(e.target.value)}
                className="h-11 flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Upload your PDF to a file service and paste the link here.
            </p>
          </div>

          <Separator />

          {/* Categories */}
          {categories.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Categories{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (select all that apply)
                </span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleCat(cat.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                      selectedCats.includes(cat.id)
                        ? "border-[#0B1F3A] bg-[#0B1F3A]/10 text-[#0B1F3A] dark:border-[#FF6B45] dark:bg-[#E84A27]/10 dark:text-[#FF8A66]"
                        : "border-border text-muted-foreground hover:border-foreground/30"
                    }`}
                  >
                    {selectedCats.includes(cat.id) && (
                      <CheckCircle className="mr-1 inline h-3 w-3" />
                    )}
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="submit"
              size="lg"
              className="gap-2 bg-[#0B1F3A] font-semibold text-white hover:bg-[#0B1F3A]/90 dark:bg-[#0B1F3A] dark:text-white dark:hover:bg-[#123252]"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Submit Paper
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
