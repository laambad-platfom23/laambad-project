"use client";

import { useQuery } from "@tanstack/react-query";
import { researchApi } from "@/services/api/research";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3, FileText, FolderOpen, CheckCircle, Clock, XCircle, Send, Eye,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { ResearchPaper, ResearchCategory } from "@/types";

export default function ResearchAnalyticsPage() {
  const { data: papersRaw, isLoading: papersLoading } = useQuery({
    queryKey: ["research-analytics-papers"],
    queryFn: () => researchApi.listPapers({ page: 1, page_size: 1000 }).then((r) => r.data),
  });
  const { data: catsRaw, isLoading: catsLoading } = useQuery({
    queryKey: ["research-categories"],
    queryFn: () => researchApi.listCategories().then((r) => r.data),
  });

  const papers: ResearchPaper[] = papersRaw?.data || [];
  const categories: ResearchCategory[] = Array.isArray(catsRaw)
    ? catsRaw : (catsRaw as { data?: ResearchCategory[] })?.data || [];

  const isLoading = papersLoading || catsLoading;

  const draft = papers.filter((p) => p.status === "draft").length;
  const submitted = papers.filter((p) => p.status === "submitted").length;
  const inReview = papers.filter((p) => p.status === "in_review").length;
  const approved = papers.filter((p) => p.status === "approved").length;
  const rejected = papers.filter((p) => p.status === "rejected").length;

  // Category distribution
  const catCounts: Record<string, number> = {};
  papers.forEach((p) => {
    if (p.categories) {
      p.categories.forEach((c) => {
        catCounts[c.name] = (catCounts[c.name] || 0) + 1;
      });
    }
  });
  const catDistribution = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);

  // Recent papers
  const recentPapers = [...papers].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);

  const statCards = [
    { label: "Total Papers", value: papers.length, icon: FileText, color: "bg-blue-500/10 text-blue-600", iconBg: "bg-blue-500/10" },
    { label: "Published", value: approved, icon: CheckCircle, color: "bg-emerald-500/10 text-emerald-600", iconBg: "bg-emerald-500/10" },
    { label: "Pending Review", value: submitted + inReview, icon: Clock, color: "bg-amber-500/10 text-amber-600", iconBg: "bg-amber-500/10" },
    { label: "Drafts", value: draft, icon: Send, color: "bg-gray-500/10 text-gray-600", iconBg: "bg-gray-500/10" },
    { label: "Rejected", value: rejected, icon: XCircle, color: "bg-red-500/10 text-red-600", iconBg: "bg-red-500/10" },
    { label: "Categories", value: categories.length, icon: FolderOpen, color: "bg-orange-500/10 text-[#0B1F3A]", iconBg: "bg-orange-500/10" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10">
          <BarChart3 className="h-5 w-5 text-[#0B1F3A]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Research Analytics</h1>
          <p className="text-sm text-muted-foreground">Overview of your research papers and activity</p>
        </div>
      </div>

      {/* Stat Cards */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {statCards.map((s) => (
            <div key={s.label} className="rounded-xl border bg-card p-5 transition-all hover:shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="mt-1 text-3xl font-bold tracking-tight">{s.value}</p>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${s.iconBg}`}>
                  <s.icon className={`h-6 w-6 ${s.color.split(" ")[1]}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Status Breakdown */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Status Breakdown</h3>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : (
            <div className="space-y-3">
              {[
                { label: "Draft", count: draft, color: "bg-gray-400", total: papers.length },
                { label: "Submitted", count: submitted, color: "bg-blue-500", total: papers.length },
                { label: "In Review", count: inReview, color: "bg-amber-500", total: papers.length },
                { label: "Published", count: approved, color: "bg-emerald-500", total: papers.length },
                { label: "Rejected", count: rejected, color: "bg-red-500", total: papers.length },
              ].map((s) => {
                const pct = papers.length > 0 ? (s.count / s.total) * 100 : 0;
                return (
                  <div key={s.label}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
                        {s.label}
                      </span>
                      <span className="font-medium">{s.count} <span className="text-xs text-muted-foreground">({pct.toFixed(0)}%)</span></span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div className={`h-2 rounded-full ${s.color} transition-all duration-500`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Category Distribution */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Papers by Category</h3>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : catDistribution.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categorized papers yet.</p>
          ) : (
            <div className="space-y-3">
              {catDistribution.map(([name, count]) => {
                const pct = papers.length > 0 ? (count / papers.length) * 100 : 0;
                return (
                  <div key={name}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="flex items-center gap-2">
                        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                        {name}
                      </span>
                      <span className="font-medium">{count}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-[#0B1F3A] dark:bg-[#0B1F3A] transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Papers */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">Recent Papers</h3>
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : recentPapers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No papers yet.</p>
        ) : (
          <div className="divide-y">
            {recentPapers.map((p) => {
              const st = { draft: "outline", submitted: "secondary", in_review: "warning", approved: "success", rejected: "destructive" }[p.status] || "outline";
              const stLabel = { draft: "Draft", submitted: "Submitted", in_review: "In Review", approved: "Published", rejected: "Rejected" }[p.status] || p.status;
              return (
                <div key={p.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.author_name || "Unknown"} · {formatDate(p.created_at)}</p>
                  </div>
                  <Badge variant={st as any} className="ml-3 text-xs shrink-0">{stLabel}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
