"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { researchApi } from "@/services/api/research";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Search, Star, ChevronLeft, ChevronRight, User, Calendar, FileText,
  CheckCircle, XCircle, Clock, Eye, Send, Loader2,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import type { ResearchPaper, ResearchCategory } from "@/types";

const STATUS_CFG: Record<string, { label: string; variant: "success" | "warning" | "outline" | "secondary" | "destructive"; dot: string }> = {
  draft: { label: "Draft", variant: "outline", dot: "bg-gray-400" },
  submitted: { label: "Submitted", variant: "secondary", dot: "bg-blue-500" },
  in_review: { label: "In Review", variant: "warning", dot: "bg-amber-500" },
  approved: { label: "Published", variant: "success", dot: "bg-emerald-500" },
  rejected: { label: "Rejected", variant: "destructive", dot: "bg-red-500" },
};

export default function ResearchReviewsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("submitted");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ResearchPaper | null>(null);
  const pageSize = 12;

  const { data, isLoading } = useQuery({
    queryKey: ["research-reviews", page, pageSize, statusFilter],
    queryFn: () =>
      researchApi.listPapers({
        page, page_size: pageSize,
        status: statusFilter !== "all" ? statusFilter : undefined,
      }).then((r) => r.data),
  });

  const allPapers: ResearchPaper[] = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize) || 1;

  const papers = useMemo(() => {
    if (!search) return allPapers;
    const q = search.toLowerCase();
    return allPapers.filter((p) =>
      p.title.toLowerCase().includes(q) || (p.author_name && p.author_name.toLowerCase().includes(q))
    );
  }, [allPapers, search]);

  const approveM = useMutation({
    mutationFn: (id: string) => researchApi.setPaperStatus(id, "approved"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["research-reviews"] }); qc.invalidateQueries({ queryKey: ["research-papers"] }); toast.success("Paper approved & published!"); setSelected(null); },
    onError: () => toast.error("Failed to approve"),
  });
  const rejectM = useMutation({
    mutationFn: (id: string) => researchApi.setPaperStatus(id, "rejected"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["research-reviews"] }); qc.invalidateQueries({ queryKey: ["research-papers"] }); toast.success("Paper rejected"); setSelected(null); },
    onError: () => toast.error("Failed to reject"),
  });

  const pendingCount = allPapers.filter((p) => p.status === "submitted" || p.status === "in_review").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10">
            <Star className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reviews</h1>
            <p className="text-sm text-muted-foreground">Review submitted papers and manage approvals</p>
          </div>
        </div>
        {pendingCount > 0 && (
          <Badge variant="warning" className="gap-1 text-sm px-3 py-1">
            <Clock className="h-3.5 w-3.5" /> {pendingCount} pending review
          </Badge>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search papers…" className="h-9 pl-9 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[160px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="in_review">In Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
      ) : papers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16">
          <Star className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="font-semibold text-muted-foreground">No papers to review</p>
          <p className="mt-1 text-sm text-muted-foreground/70">Papers submitted for review will appear here.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Paper</th>
                <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground md:table-cell">Author</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground sm:table-cell">Submitted</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {papers.map((p) => {
                const st = STATUS_CFG[p.status] || STATUS_CFG.draft;
                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <button onClick={() => setSelected(p)} className="text-left font-medium hover:text-primary transition-colors line-clamp-1">{p.title}</button>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1 max-w-xs">{p.abstract || "No abstract"}</p>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell text-sm text-muted-foreground">{p.author_name || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={st.variant} className="text-xs gap-1">
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} /> {st.label}
                      </Badge>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell text-xs text-muted-foreground">{formatDate(p.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelected(p)}><Eye className="h-4 w-4" /></Button>
                        {(p.status === "submitted" || p.status === "in_review") && (
                          <>
                            <Button size="icon" className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => approveM.mutate(p.id)}>
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => rejectM.mutate(p.id)}>
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {totalPages} · {total} total</p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="h-4 w-4" /></Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4));
              const num = start + i;
              if (num > totalPages) return null;
              return <Button key={num} variant={num === page ? "default" : "outline"} size="sm" className="h-8 w-8 p-0" onClick={() => setPage(num)}>{num}</Button>;
            })}
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* Detail Sheet */}
      <ReviewDetailSheet paper={selected} open={!!selected} onClose={() => setSelected(null)} onApprove={(id) => approveM.mutate(id)} onReject={(id) => rejectM.mutate(id)} />
    </div>
  );
}

function ReviewDetailSheet({ paper, open, onClose, onApprove, onReject }: {
  paper: ResearchPaper | null; open: boolean; onClose: () => void;
  onApprove: (id: string) => void; onReject: (id: string) => void;
}) {
  if (!paper) return null;
  const st = STATUS_CFG[paper.status] || STATUS_CFG.draft;
  const canReview = paper.status === "submitted" || paper.status === "in_review";

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-lg leading-snug pr-8">{paper.title}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-3 text-xs">
            {paper.author_name && <span className="flex items-center gap-1"><User className="h-3 w-3" /> {paper.author_name}</span>}
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(paper.created_at)}</span>
            <Badge variant={st.variant} className="text-xs gap-1"><span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} /> {st.label}</Badge>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {paper.categories && paper.categories.length > 0 && (
            <div className="flex flex-wrap gap-2">{paper.categories.map((c) => <Badge key={c.id} variant="outline" className="text-xs">{c.name}</Badge>)}</div>
          )}

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Abstract</h4>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{paper.abstract || "No abstract provided."}</p>
          </div>

          {paper.pdf_url && (
            <Button size="sm" className="gap-1.5" asChild>
              <a href={paper.pdf_url} target="_blank" rel="noopener noreferrer"><FileText className="h-4 w-4" /> View PDF</a>
            </Button>
          )}

          {canReview && (
            <>
              <Separator />
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Review Decision</h4>
                <div className="flex gap-2">
                  <Button className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onApprove(paper.id)}>
                    <CheckCircle className="h-4 w-4" /> Approve & Publish
                  </Button>
                  <Button variant="destructive" className="flex-1 gap-1.5" onClick={() => onReject(paper.id)}>
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
