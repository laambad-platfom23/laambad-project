"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { researchApi } from "@/services/api/research";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, FlaskConical, ChevronLeft, ChevronRight, FileText, BookOpen,
  Filter, Tag, User, Calendar, Download, Quote, Eye, Share2, Copy, Check,
  Loader2, GraduationCap,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Logo } from "@/components/ui/logo";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import type { ResearchPaper, ResearchCategory } from "@/types";

type SortKey = "newest" | "oldest" | "title_asc";

export default function PublicResearchPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [selectedPaper, setSelectedPaper] = useState<ResearchPaper | null>(null);
  const [citePaper, setCitePaper] = useState<ResearchPaper | null>(null);
  const pageSize = 12;

  const { data: categoriesData } = useQuery({
    queryKey: ["research-categories-public"],
    queryFn: () => researchApi.listCategories().then((r) => r.data),
  });
  const categories: ResearchCategory[] = Array.isArray(categoriesData)
    ? categoriesData
    : (categoriesData as { data?: ResearchCategory[] })?.data || [];

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["public-research", page, pageSize, categoryFilter],
    queryFn: () =>
      researchApi.publicList(page, pageSize, categoryFilter !== "all" ? categoryFilter : undefined).then((r) => r.data),
  });

  const allPapers: ResearchPaper[] = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize) || 1;

  const papers = useMemo(() => {
    let result = allPapers;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.abstract && p.abstract.toLowerCase().includes(q)) ||
          (p.author_name && p.author_name.toLowerCase().includes(q))
      );
    }
    const sorted = [...result];
    if (sortBy === "oldest") sorted.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    if (sortBy === "newest") sorted.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    if (sortBy === "title_asc") sorted.sort((a, b) => a.title.localeCompare(b.title));
    return sorted;
  }, [allPapers, search, sortBy]);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }, [searchInput]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur dark:border-border dark:bg-background/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Logo size="md" href="/" />
            <Badge variant="secondary" className="hidden gap-1 text-xs sm:flex">
              <GraduationCap className="h-3 w-3" /> Research Portal
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild><Link href="/">Home</Link></Button>
            <Button size="sm" asChild><Link href="/login">Sign In</Link></Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="relative overflow-hidden bg-[#0B1F3A] px-4 pb-10 pt-12 sm:px-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#E84A27]/10 hidden" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-[#E84A27]/10 hidden" />
        <div className="relative mx-auto max-w-3xl text-center">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
            <GraduationCap className="h-3.5 w-3.5" /> Laambad
          </div>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Research Library</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-white/60">
            Browse published research papers from our scholars. Search by title, abstract, or author name.
          </p>
          <form onSubmit={handleSearch} className="mx-auto mt-6 max-w-xl">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search papers by title, abstract, or author…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-12 w-full rounded-xl border-0 bg-white pl-12 pr-28 text-sm text-gray-900 shadow-lg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#64d88c]/50 dark:bg-card dark:text-white dark:focus:ring-[#E84A27]/50"
              />
              <Button type="submit" size="sm" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-[#0B1F3A] dark:bg-brand dark:hover:bg-brand-hover px-4 font-medium text-white hover:bg-[#0B1F3A]/80">
                <Search className="mr-1.5 h-3.5 w-3.5" /> Search
              </Button>
            </div>
          </form>
          <div className="mt-5 flex items-center justify-center gap-6 text-xs text-white/50">
            <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {total} Papers</span>
            <span className="flex items-center gap-1"><Tag className="h-3.5 w-3.5" /> {categories.length} Categories</span>
            <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" /> Peer Reviewed</span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          {/* Sidebar filters */}
          <aside>
            <div className="sticky top-20 rounded-xl border bg-white p-4 dark:bg-gray-900">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><Filter className="h-4 w-4" /> Filters</h3>
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Category</p>
                <button onClick={() => { setCategoryFilter("all"); setPage(1); }} className={`flex w-full rounded-lg px-3 py-1.5 text-sm transition-colors ${categoryFilter === "all" ? "bg-[#0B1F3A]/10 font-medium text-[#0B1F3A] dark:text-[#FF8A66]" : "text-muted-foreground hover:bg-muted"}`}>All categories</button>
                {categories.map((cat) => (
                  <button key={cat.id} onClick={() => { setCategoryFilter(cat.id); setPage(1); }} className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${categoryFilter === cat.id ? "bg-[#0B1F3A]/10 font-medium text-[#0B1F3A] dark:text-[#FF8A66]" : "text-muted-foreground hover:bg-muted"}`}>
                    <Tag className="h-3 w-3 shrink-0" /> {cat.name}
                  </button>
                ))}
              </div>
              <Separator className="my-4" />
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Sort By</p>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                    <SelectItem value="title_asc">Title A–Z</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </aside>

          {/* Papers */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {search ? (<><span className="font-medium text-foreground">{papers.length}</span> result{papers.length !== 1 ? "s" : ""} for &ldquo;{search}&rdquo;</>) : (<>Showing <span className="font-medium text-foreground">{papers.length}</span> of <span className="font-medium text-foreground">{total}</span> papers</>)}
                {isFetching && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" />}
              </p>
            </div>

            {isLoading ? (
              <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="rounded-xl border bg-white p-5 dark:bg-gray-900"><Skeleton className="mb-2 h-5 w-3/4" /><Skeleton className="mb-3 h-4 w-1/3" /><Skeleton className="mb-1 h-3 w-full" /><Skeleton className="h-3 w-2/3" /></div>))}</div>
            ) : papers.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-white py-20 dark:bg-gray-900">
                <FlaskConical className="h-16 w-16 text-muted-foreground/30 mb-4" />
                <p className="text-lg font-semibold text-muted-foreground">No papers found</p>
                <p className="mt-1 text-sm text-muted-foreground/70">{search ? "Try different search terms." : "No research papers have been published yet."}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {papers.map((paper) => (
                  <PublicPaperCard key={paper.id} paper={paper} onView={() => setSelectedPaper(paper)} onCite={() => setCitePaper(paper)} />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between rounded-xl border bg-white px-4 py-3 dark:bg-gray-900">
                <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
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
        </div>
      </div>

      {/* Detail Dialog */}
      {selectedPaper && (
        <Dialog open={!!selectedPaper} onOpenChange={(o) => !o && setSelectedPaper(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-lg leading-snug">{selectedPaper.title}</DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                {selectedPaper.author_name && <span className="flex items-center gap-1"><User className="h-3 w-3" /> {selectedPaper.author_name}</span>}
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(selectedPaper.created_at)}</span>
              </DialogDescription>
            </DialogHeader>
            <Separator />
            {selectedPaper.categories && selectedPaper.categories.length > 0 && (
              <div className="flex flex-wrap gap-2">{selectedPaper.categories.map((c) => <Badge key={c.id} variant="outline" className="gap-1 text-xs"><Tag className="h-3 w-3" /> {c.name}</Badge>)}</div>
            )}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Abstract</h4>
              <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{selectedPaper.abstract || "No abstract provided."}</p>
            </div>
            <Separator />
            <div className="flex flex-wrap gap-2">
              {selectedPaper.pdf_url && <Button size="sm" className="gap-1.5" asChild><a href={selectedPaper.pdf_url} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4" /> Download PDF</a></Button>}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setCitePaper(selectedPaper); }}><Quote className="h-4 w-4" /> Cite</Button>
              {selectedPaper.pdf_url && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { navigator.clipboard.writeText(selectedPaper.pdf_url); toast.success("Link copied!"); }}><Copy className="h-4 w-4" /> Copy Link</Button>}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Cite Dialog */}
      {citePaper && <CiteDialogInline paper={citePaper} onClose={() => setCitePaper(null)} />}

      {/* Footer */}
      <footer className="border-t bg-white py-8 dark:bg-gray-900">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-muted-foreground sm:px-6">
          <Logo size="sm" href="/" className="mx-auto mb-3 justify-center" />
          <p>&copy; {new Date().getFullYear()} Laambad. All rights reserved.</p>
          <div className="mt-2 flex justify-center gap-4">
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <Link href="/login" className="hover:text-foreground transition-colors">Sign In</Link>
            <Link href="/register" className="hover:text-foreground transition-colors">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── Paper Card ── */
function PublicPaperCard({ paper, onView, onCite }: { paper: ResearchPaper; onView: () => void; onCite: () => void }) {
  const year = new Date(paper.created_at).getFullYear();
  return (
    <article className="group rounded-xl border bg-white p-5 transition-all hover:shadow-md dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3">
        <button onClick={onView} className="text-left text-base font-semibold text-[#0B1F3A] hover:text-[#0B1F3A]/80 dark:text-[#FF8A66] dark:hover:text-[#FF8A66]/80 transition-colors leading-snug">{paper.title}</button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {paper.author_name && <span className="flex items-center gap-1"><User className="h-3 w-3" /> {paper.author_name}</span>}
        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(paper.created_at)} ({year})</span>
        {paper.categories && paper.categories.length > 0 && <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> {paper.categories.map((c) => c.name).join(", ")}</span>}
      </div>
      {paper.abstract && <p className="mt-3 text-sm leading-relaxed text-muted-foreground line-clamp-3">{paper.abstract}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {paper.pdf_url && <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild><a href={paper.pdf_url} target="_blank" rel="noopener noreferrer"><Download className="h-3.5 w-3.5" /> PDF</a></Button>}
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onCite}><Quote className="h-3.5 w-3.5" /> Cite</Button>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={onView}><Eye className="h-3.5 w-3.5" /> View</Button>
        {paper.pdf_url && <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { navigator.clipboard.writeText(paper.pdf_url); toast.success("Link copied!"); }}><Share2 className="h-3.5 w-3.5" /> Share</Button>}
      </div>
    </article>
  );
}

/* ── Cite Dialog ── */
function CiteDialogInline({ paper, onClose }: { paper: ResearchPaper; onClose: () => void }) {
  const [fmt, setFmt] = useState<"APA" | "MLA" | "Chicago" | "BibTeX">("APA");
  const [copied, setCopied] = useState(false);
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cite this paper</DialogTitle>
          <DialogDescription className="line-clamp-1 text-xs">{paper.title}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
          {(["APA", "MLA", "Chicago", "BibTeX"] as const).map((f) => (
            <button key={f} onClick={() => setFmt(f)} className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${fmt === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{f}</button>
          ))}
        </div>
        <div className="relative rounded-lg border bg-muted/30 p-4">
          <pre className="whitespace-pre-wrap text-sm leading-relaxed font-mono">{cites[fmt]}</pre>
          <Button size="sm" variant="outline" className="absolute right-2 top-2 h-8 gap-1.5 text-xs" onClick={handleCopy}>
            {copied ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
