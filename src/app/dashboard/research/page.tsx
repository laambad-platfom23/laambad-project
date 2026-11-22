"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { researchApi } from "@/services/api/research";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Search, FlaskConical, ChevronLeft, ChevronRight, FileText, BookOpen,
  Plus, Tag, User, Calendar, Loader2, GraduationCap, Send, CheckCircle,
  Eye, Download, MoreHorizontal, Pencil, Trash2, FolderOpen, ExternalLink,
  Quote, Share2, Copy, Check,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import type { ResearchPaper, ResearchCategory } from "@/types";

/* ── status config ── */
const STATUS_CFG: Record<string, { label: string; variant: "success" | "warning" | "outline" | "secondary" | "destructive"; dot: string }> = {
  draft: { label: "Draft", variant: "outline", dot: "bg-gray-400" },
  submitted: { label: "Submitted", variant: "secondary", dot: "bg-blue-500" },
  in_review: { label: "In Review", variant: "warning", dot: "bg-amber-500" },
  approved: { label: "Published", variant: "success", dot: "bg-emerald-500" },
  rejected: { label: "Rejected", variant: "destructive", dot: "bg-red-500" },
};

export default function ResearchPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const pageSize = 12;

  /* sheet states */
  const [paperSheet, setPaperSheet] = useState(false);
  const [catSheet, setCatSheet] = useState(false);
  const [detailPaper, setDetailPaper] = useState<ResearchPaper | null>(null);
  const [citePaper, setCitePaper] = useState<ResearchPaper | null>(null);

  /* ── data ── */
  const { data: catsRaw } = useQuery({
    queryKey: ["research-categories"],
    queryFn: () => researchApi.listCategories().then((r) => r.data),
  });
  const categories: ResearchCategory[] = Array.isArray(catsRaw)
    ? catsRaw : (catsRaw as { data?: ResearchCategory[] })?.data || [];

  const { data, isLoading } = useQuery({
    queryKey: ["research-papers", page, pageSize, statusFilter, categoryFilter],
    queryFn: () =>
      researchApi.listPapers({
        page, page_size: pageSize,
        status: statusFilter !== "all" ? statusFilter : undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
      }).then((r) => r.data),
  });

  const allPapers: ResearchPaper[] = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize) || 1;

  const papers = useMemo(() => {
    if (!search) return allPapers;
    const q = search.toLowerCase();
    return allPapers.filter(
      (p) => p.title.toLowerCase().includes(q) || (p.abstract && p.abstract.toLowerCase().includes(q)) || (p.author_name && p.author_name.toLowerCase().includes(q))
    );
  }, [allPapers, search]);

  /* ── mutations ── */
  const submitM = useMutation({
    mutationFn: (id: string) => researchApi.submitPaper(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["research-papers"] }); toast.success("Paper submitted for review"); },
    onError: () => toast.error("Failed to submit"),
  });
  const publishM = useMutation({
    mutationFn: (id: string) => researchApi.setPaperStatus(id, "approved"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["research-papers"] }); qc.invalidateQueries({ queryKey: ["public-research"] }); toast.success("Paper published!"); },
    onError: () => toast.error("Failed to publish"),
  });
  const rejectM = useMutation({
    mutationFn: (id: string) => researchApi.setPaperStatus(id, "rejected"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["research-papers"] }); toast.success("Paper rejected"); },
    onError: () => toast.error("Failed to reject"),
  });

  return (
    <div className="space-y-6">
      {/* ═══ Header ═══ */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B1F3A] dark:bg-[#E84A27]/20">
              <GraduationCap className="h-5 w-5 text-white dark:text-[#FF8A66]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Research</h1>
              <p className="text-sm text-muted-foreground">Manage papers, categories, and publications</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCatSheet(true)}>
            <Tag className="h-4 w-4" /> Add Category
          </Button>
          <Button size="sm" className="gap-1.5 bg-[#0B1F3A] text-white hover:bg-[#0B1F3A]/90 dark:bg-[#0B1F3A] dark:text-white dark:hover:bg-[#123252]" onClick={() => setPaperSheet(true)}>
            <Plus className="h-4 w-4" /> New Paper
          </Button>
        </div>
      </div>

      {/* ═══ Papers ═══ */}
      {(
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search papers…" className="h-9 pl-9 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="h-9 w-[140px] text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {Object.entries(STATUS_CFG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
                <SelectTrigger className="h-9 w-[160px] text-sm"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="rounded-xl border"><div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div></div>
          ) : papers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16">
              <FlaskConical className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="font-semibold text-muted-foreground">No papers found</p>
              <p className="mt-1 text-sm text-muted-foreground/70">Create your first paper to get started.</p>
              <Button className="mt-4 gap-1.5" onClick={() => setPaperSheet(true)}><Plus className="h-4 w-4" /> New Paper</Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Paper</th>
                      <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground md:table-cell">Author</th>
                      <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground lg:table-cell">Category</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                      <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground sm:table-cell">Date</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {papers.map((p) => {
                      const st = STATUS_CFG[p.status] || STATUS_CFG.draft;
                      return (
                        <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <button onClick={() => setDetailPaper(p)} className="text-left font-medium text-foreground hover:text-primary transition-colors line-clamp-1">{p.title}</button>
                            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1 max-w-xs">{p.abstract || "No abstract"}</p>
                          </td>
                          <td className="hidden px-4 py-3 md:table-cell">
                            <span className="text-sm text-muted-foreground">{p.author_name || "—"}</span>
                          </td>
                          <td className="hidden px-4 py-3 lg:table-cell">
                            {p.categories && p.categories.length > 0 ? (
                              <div className="flex flex-wrap gap-1">{p.categories.map((c) => <Badge key={c.id} variant="outline" className="text-[10px]">{c.name}</Badge>)}</div>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={st.variant} className="text-xs gap-1">
                              <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} /> {st.label}
                            </Badge>
                          </td>
                          <td className="hidden px-4 py-3 sm:table-cell">
                            <span className="text-xs text-muted-foreground">{formatDate(p.created_at)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => setDetailPaper(p)}><Eye className="mr-2 h-4 w-4" /> View Details</DropdownMenuItem>
                                {p.pdf_url && (
                                  <DropdownMenuItem asChild><a href={p.pdf_url} target="_blank" rel="noopener noreferrer"><Download className="mr-2 h-4 w-4" /> Download PDF</a></DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => setCitePaper(p)}><Quote className="mr-2 h-4 w-4" /> Cite</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {p.status === "draft" && (
                                  <DropdownMenuItem onClick={() => submitM.mutate(p.id)} className="text-brand"><Send className="mr-2 h-4 w-4" /> Submit for Review</DropdownMenuItem>
                                )}
                                {(p.status === "submitted" || p.status === "in_review") && (
                                  <DropdownMenuItem onClick={() => publishM.mutate(p.id)} className="text-emerald-600"><CheckCircle className="mr-2 h-4 w-4" /> Publish</DropdownMenuItem>
                                )}
                                {p.status !== "rejected" && p.status !== "approved" && (
                                  <DropdownMenuItem onClick={() => rejectM.mutate(p.id)} className="text-red-600"><Trash2 className="mr-2 h-4 w-4" /> Reject</DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
        </div>
      )}

      {/* ═══ Side Sheets ═══ */}
      <CreatePaperSheet open={paperSheet} onClose={() => setPaperSheet(false)} categories={categories} />
      <CreateCategorySheet open={catSheet} onClose={() => setCatSheet(false)} />

      {/* ═══ Detail Sheet ═══ */}
      <PaperDetailSheet paper={detailPaper} open={!!detailPaper} onClose={() => setDetailPaper(null)} onCite={(p) => setCitePaper(p)} onPublish={(id) => publishM.mutate(id)} onSubmit={(id) => submitM.mutate(id)} />

      {/* ═══ Cite Sheet ═══ */}
      <CiteSheet paper={citePaper} open={!!citePaper} onClose={() => setCitePaper(null)} />
    </div>
  );
}

/* ══════════════════════════════════════════════
   Create Paper Sheet (Side Panel)
   ══════════════════════════════════════════════ */
function CreatePaperSheet({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: ResearchCategory[] }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);

  const toggleCat = (id: string) => setSelectedCats((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: paper } = await researchApi.createPaper({
        title: title.trim(), abstract: abstract.trim() || undefined,
        pdf_url: pdfUrl.trim(), category_ids: selectedCats.length > 0 ? selectedCats : undefined,
      });
      try { await researchApi.submitPaper(paper.id); } catch {}
      return paper;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["research-papers"] });
      qc.invalidateQueries({ queryKey: ["public-research"] });
      toast.success("Paper created & submitted!");
      setTitle(""); setAbstract(""); setPdfUrl(""); setSelectedCats([]);
      onClose();
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || "Failed to create paper");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!pdfUrl.trim()) { toast.error("PDF URL is required"); return; }
    mutation.mutate();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>New Research Paper</SheetTitle>
          <SheetDescription>Fill in details. Paper will auto-submit for review.</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label>Title <span className="text-red-500">*</span></Label>
            <Input placeholder="Full paper title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Abstract</Label>
            <Textarea placeholder="Summary of your research…" rows={5} value={abstract} onChange={(e) => setAbstract(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>PDF URL <span className="text-red-500">*</span></Label>
            <Input placeholder="https://example.com/paper.pdf" value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} />
          </div>
          {categories.length > 0 && (
            <div className="space-y-2">
              <Label>Categories</Label>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button key={cat.id} type="button" onClick={() => toggleCat(cat.id)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${selectedCats.includes(cat.id) ? "border-[#0B1F3A] bg-[#0B1F3A]/10 text-[#0B1F3A] dark:border-[#FF6B45] dark:bg-[#E84A27]/10 dark:text-[#FF8A66]" : "border-border text-muted-foreground hover:border-foreground/30"}`}>
                    {selectedCats.includes(cat.id) && <CheckCircle className="mr-1 inline h-3 w-3" />}{cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Separator />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-1.5 bg-[#0B1F3A] text-white hover:bg-[#0B1F3A]/90 dark:bg-[#0B1F3A] dark:text-white">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit Paper
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/* ══════════════════════════════════════════════
   Create Category Sheet
   ══════════════════════════════════════════════ */
function CreateCategorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const mutation = useMutation({
    mutationFn: () => {
      const payload: { name: string; slug?: string } = { name: name.trim() };
      if (slug.trim()) payload.slug = slug.trim();
      return researchApi.createCategory(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["research-categories"] });
      toast.success("Category created!");
      setName(""); setSlug("");
      onClose();
    },
    onError: () => toast.error("Failed to create category"),
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>New Research Category</SheetTitle>
          <SheetDescription>Add a new category for organizing papers.</SheetDescription>
        </SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) { toast.error("Name required"); return; } mutation.mutate(); }} className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label>Name <span className="text-red-500">*</span></Label>
            <Input placeholder="e.g. Machine Learning" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label>Slug <span className="text-xs text-muted-foreground">(optional, auto-generated)</span></Label>
            <Input placeholder="machine-learning" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
          <Separator />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-1.5">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create Category
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/* ══════════════════════════════════════════════
   Paper Detail Sheet
   ══════════════════════════════════════════════ */
function PaperDetailSheet({ paper, open, onClose, onCite, onPublish, onSubmit }: {
  paper: ResearchPaper | null; open: boolean; onClose: () => void;
  onCite: (p: ResearchPaper) => void; onPublish: (id: string) => void; onSubmit: (id: string) => void;
}) {
  if (!paper) return null;
  const st = STATUS_CFG[paper.status] || STATUS_CFG.draft;

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
            <div className="flex flex-wrap gap-2">{paper.categories.map((c) => <Badge key={c.id} variant="outline" className="gap-1 text-xs"><Tag className="h-3 w-3" /> {c.name}</Badge>)}</div>
          )}

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Abstract</h4>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{paper.abstract || "No abstract provided."}</p>
          </div>

          <Separator />

          <div className="flex flex-wrap gap-2">
            {paper.pdf_url && <Button size="sm" className="gap-1.5" asChild><a href={paper.pdf_url} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4" /> Download PDF</a></Button>}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onCite(paper)}><Quote className="h-4 w-4" /> Cite</Button>
            {paper.pdf_url && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { navigator.clipboard.writeText(paper.pdf_url); toast.success("Link copied!"); }}><Copy className="h-4 w-4" /> Copy Link</Button>}
          </div>

          {/* Admin actions */}
          {(paper.status === "draft" || paper.status === "submitted" || paper.status === "in_review") && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Admin Actions</h4>
                <div className="flex flex-wrap gap-2">
                  {paper.status === "draft" && <Button size="sm" className="gap-1.5 bg-brand hover:bg-brand-hover text-white" onClick={() => onSubmit(paper.id)}><Send className="h-4 w-4" /> Submit for Review</Button>}
                  {(paper.status === "submitted" || paper.status === "in_review") && <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onPublish(paper.id)}><CheckCircle className="h-4 w-4" /> Publish Now</Button>}
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ══════════════════════════════════════════════
   Cite Sheet
   ══════════════════════════════════════════════ */
function CiteSheet({ paper, open, onClose }: { paper: ResearchPaper | null; open: boolean; onClose: () => void }) {
  const [fmt, setFmt] = useState<"APA" | "MLA" | "Chicago" | "BibTeX">("APA");
  const [copied, setCopied] = useState(false);
  if (!paper) return null;

  const year = new Date(paper.created_at).getFullYear();
  const author = paper.author_name || "Unknown";
  const parts = author.split(" ");
  const last = parts.pop() || author;
  const first = parts.join(" ");
  const url = paper.pdf_url ? ` ${paper.pdf_url}` : "";

  const cites: Record<string, string> = {
    APA: `${last}, ${first ? first.charAt(0) + "." : ""} (${year}). ${paper.title}. Laambad Research.${url}`,
    MLA: `${last}, ${first}. "${paper.title}." Laambad Research, ${year}.${url}`,
    Chicago: `${last}, ${first}. "${paper.title}." Laambad Research (${year}).${url}`,
    BibTeX: `@article{${last.toLowerCase()}${year},\n  title={${paper.title}},\n  author={${last}, ${first}},\n  journal={Laambad Research},\n  year={${year}}\n}`,
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(cites[fmt]);
    setCopied(true);
    toast.success(`${fmt} citation copied!`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Cite Paper</SheetTitle>
          <SheetDescription className="line-clamp-1">{paper.title}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
            {(["APA", "MLA", "Chicago", "BibTeX"] as const).map((f) => (
              <button key={f} onClick={() => setFmt(f)} className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${fmt === f ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{f}</button>
            ))}
          </div>
          <div className="relative rounded-lg border bg-muted/30 p-4">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-mono pr-16">{cites[fmt]}</pre>
            <Button size="sm" variant="outline" className="absolute right-2 top-2 h-8 gap-1.5 text-xs" onClick={handleCopy}>
              {copied ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
