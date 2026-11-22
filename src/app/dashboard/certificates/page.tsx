"use client";

import { useQuery } from "@tanstack/react-query";
import { certificatesApi } from "@/services/api/certificates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Award,
  ExternalLink,
  ShieldCheck,
  Copy,
  CheckCircle2,
  Eye,
} from "lucide-react";
import type { Certificate } from "@/types";
import { toast } from "sonner";
import { useState } from "react";
import Link from "next/link";

export default function CertificatesPage() {
  const { data: certificates, isLoading } = useQuery<Certificate[]>({
    queryKey: ["my-certificates"],
    queryFn: async () => {
      const res = await certificatesApi.list();
      return res.data.data;
    },
  });

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyVerificationId = (vid: string) => {
    navigator.clipboard.writeText(vid);
    setCopiedId(vid);
    toast.success("Verification ID copied!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Award className="h-7 w-7 text-[#0B1F3A] dark:text-[#FF8A66]" />
          My Certificates
        </h1>
        <p className="text-muted-foreground mt-1">
          Certificates earned from completed courses.
        </p>
      </div>

      {!certificates?.length ? (
        <Card className="border-none shadow-sm">
          <CardContent className="py-16 text-center">
            <Award className="h-16 w-16 mx-auto text-muted-foreground/30" />
            <h3 className="mt-4 text-lg font-semibold">
              No certificates yet
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Complete a course and pass all required quizzes to earn your first
              certificate.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {certificates.map((cert) => (
            <Card
              key={cert.id}
              className="overflow-hidden border-none shadow-sm hover:shadow-lg transition-all duration-300 group"
            >
              {/* Gradient header */}
              <div className="relative flex h-28 items-center justify-center bg-[#0B1F3A] dark:bg-[#0B1F3A]">
                <Award className="h-14 w-14 text-white/90" />
                <Badge className="absolute top-3 right-3 bg-white/20 text-white border-0 backdrop-blur-sm">
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  Verified
                </Badge>
              </div>

              <CardContent className="p-5 space-y-3">
                <div>
                  <h3 className="font-bold text-base">
                    {cert.course_title ?? cert.course?.title ?? "Course Certificate"}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Issued{" "}
                    {new Date(cert.issued_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>

                {cert.user && (
                  <p className="text-sm text-muted-foreground">
                    Awarded to{" "}
                    <span className="font-medium text-foreground">
                      {cert.user.name}
                    </span>
                  </p>
                )}

                {/* Verification ID */}
                <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                  <code className="text-[11px] font-mono text-muted-foreground flex-1 truncate">
                    {cert.verification_id}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                    onClick={() => copyVerificationId(cert.verification_id)}
                  >
                    {copiedId === cert.verification_id ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" className="w-full bg-brand text-brand-foreground hover:bg-brand-hover" asChild>
                    <Link href={`/dashboard/certificates/${cert.id}`}>
                      <Eye className="mr-1.5 h-4 w-4" />
                      View
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <a href={`/verify/${cert.verification_id}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1.5 h-4 w-4" />
                      Verify
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
