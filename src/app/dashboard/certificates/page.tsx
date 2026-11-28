"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Award, CheckCircle2, Copy, ExternalLink, Eye, Link2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { CertificateSteps } from "@/components/learning/certificate-checklist";
import { certificatesApi } from "@/services/api/certificates";
import { publicCourseCoverImageUrlFromRaw } from "@/lib/course-cover";
import type { Certificate } from "@/types";

const PAGE = 9;

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/**
 * My certificates (Phase 2): one card per certificate — the course picture, the date, the ID and
 * View / Share / Verify — and "Almost there": started courses with what is left before their certificate.
 */
export default function CertificatesPage() {
  const { data: certificates, isLoading } = useQuery<Certificate[]>({
    queryKey: ["my-certificates"],
    queryFn: async () => (await certificatesApi.list()).data.data,
  });
  const progress = useQuery({
    queryKey: ["certificate-progress"],
    queryFn: () => certificatesApi.progress().then((r) => r.data.data),
  });
  const [page, setPage] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, key: string, label: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(key);
    toast.success(label);
    setTimeout(() => setCopied(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }
  const list = certificates ?? [];
  const shown = list.slice((page - 1) * PAGE, page * PAGE);
  const almost = (progress.data ?? []).filter((c) => !c.ready || c.lessons.done > 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Award className="h-7 w-7 text-[#0B1F3A] dark:text-[#FF8A66]" /> My certificates
          </h1>
          <p className="mt-1 text-muted-foreground">
            A certificate comes when every lesson is completed and every quiz and assignment of the course is passed.
          </p>
        </div>
        {list.length ? <Badge variant="secondary" className="text-sm">{list.length} earned</Badge> : null}
      </div>

      {!list.length ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="py-14 text-center">
            <Award className="mx-auto h-14 w-14 text-muted-foreground/30" />
            <h3 className="mt-4 text-lg font-semibold">No certificates yet</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Finish a course — its lessons, quizzes and assignments — to earn your first certificate.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((cert) => {
              const title = cert.course_title ?? cert.course?.title ?? "Course certificate";
              const cover = publicCourseCoverImageUrlFromRaw(cert.course?.cover_image_url ?? null);
              const verifyUrl = typeof window !== "undefined" ? `${window.location.origin}/verify/${cert.verification_id}` : `/verify/${cert.verification_id}`;
              return (
                <Card key={cert.id} className="group flex flex-col overflow-hidden border shadow-sm transition-shadow hover:shadow-lg">
                  <div className="relative aspect-video overflow-hidden bg-[#0B1F3A]">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" className="h-full w-full object-cover opacity-90 transition group-hover:scale-[1.02]" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Award className="h-14 w-14 text-white/80" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                    <Badge className="absolute right-3 top-3 border-0 bg-emerald-600 text-white">
                      <ShieldCheck className="mr-1 h-3 w-3" /> Verified
                    </Badge>
                    <p className="absolute bottom-3 left-3 right-3 text-xs font-medium text-white/90">Issued {day(cert.issued_at)}</p>
                  </div>
                  <CardContent className="flex flex-1 flex-col gap-3 p-5">
                    <h3 className="line-clamp-2 font-bold leading-snug">{title}</h3>
                    <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                      <span className="shrink-0 text-[11px] text-muted-foreground">ID</span>
                      <code className="min-w-0 flex-1 truncate font-mono text-[11px]">{cert.verification_id}</code>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Copy the certificate ID" onClick={() => copy(cert.verification_id, `id-${cert.id}`, "Certificate ID copied")}>
                        {copied === `id-${cert.id}` ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                    <div className="mt-auto grid grid-cols-3 gap-2">
                      <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand-hover" asChild>
                        <Link href={`/dashboard/certificates/${cert.id}`}>
                          <Eye className="h-4 w-4" /> View
                        </Link>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => copy(verifyUrl, `link-${cert.id}`, "Link copied — anyone can check your certificate with it")}>
                        <Link2 className="h-4 w-4" /> Share
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href={`/verify/${cert.verification_id}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" /> Verify
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <PaginationBar page={page} pageSize={PAGE} total={list.length} onPage={setPage} noun="certificates" />
        </>
      )}

      {almost.length ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold">Almost there</h2>
            <p className="text-sm text-muted-foreground">Courses you started — what is left before their certificate.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {almost.map((c) => (
              <Card key={c.course.id} className="shadow-sm">
                <CardContent className="space-y-2 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-2 font-semibold leading-snug">{c.course.title}</p>
                    <Button asChild size="sm" variant="outline" className="shrink-0">
                      <Link href={`/learn/${encodeURIComponent(c.course.slug)}?tab=grades`}>Continue</Link>
                    </Button>
                  </div>
                  <CertificateSteps r={c} compact />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
