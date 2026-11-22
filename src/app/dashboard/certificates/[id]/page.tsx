"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Award } from "lucide-react";
import { certificatesApi } from "@/services/api/certificates";
import { Skeleton } from "@/components/ui/skeleton";
import { CertificateWithToolbar } from "@/components/certificates/certificate-page";
import { getApiErrorMessage } from "@/lib/utils";

export default function CertificateDetailPage() {
  const id = String(useParams().id ?? "");
  const { data: cert, isLoading, error } = useQuery({
    queryKey: ["certificate", id],
    queryFn: () => certificatesApi.get(id).then((r) => r.data),
    enabled: !!id,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Award className="h-7 w-7 text-brand" /> Certificate
        </h1>
        <Link href="/dashboard/certificates" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All certificates
        </Link>
      </div>
      {isLoading ? (
        <>
          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="aspect-[1139/880] w-full rounded-2xl" />
        </>
      ) : !cert ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          {getApiErrorMessage(error, "Certificate not found")}
        </div>
      ) : (
        <CertificateWithToolbar cert={cert} />
      )}
    </div>
  );
}
