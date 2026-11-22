"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Download, FileImage, FileText, Loader2, Printer, Share2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CertificateImage, useCertificateCanvas, verifyUrl } from "@/components/certificates/certificate-view";
import { certificateFileName, certificatePdf, certificatePng, saveBlob } from "@/lib/certificate-render";
import type { Certificate } from "@/types";

function share(cert: Certificate) {
  const url = verifyUrl(cert.verification_id);
  const title = `${cert.student_name ?? "Certificate"} — ${cert.course_title ?? ""}`.trim();
  if (typeof navigator !== "undefined" && navigator.share) {
    navigator.share({ title, url }).catch(() => undefined);
    return;
  }
  navigator.clipboard?.writeText(url).then(
    () => toast.success("Certificate link copied"),
    () => toast.error("Could not copy the link"),
  );
}

/** Toolbar (share · print · download PDF/PNG) + the certificate, as on the old Tutor certificate page. */
export function CertificateWithToolbar({ cert }: { cert: Certificate }) {
  // 3× = 3417×2640 px: sharp when printed on letter paper
  const { canvas, error } = useCertificateCanvas(cert, 3);
  const [busy, setBusy] = useState<"pdf" | "png" | null>(null);

  const download = async (kind: "pdf" | "png") => {
    if (!canvas) return;
    setBusy(kind);
    try {
      const blob = kind === "pdf" ? await certificatePdf(canvas) : await certificatePng(canvas);
      saveBlob(blob, certificateFileName(cert, kind));
    } catch {
      toast.error("Could not create the file. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const ready = !!canvas && !busy;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-2.5 shadow-sm">
        <Button variant="secondary" size="icon" className="h-10 w-10 rounded-xl" title="Share" aria-label="Share" onClick={() => share(cert)}>
          <Share2 className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="icon" className="h-10 w-10 rounded-xl" title="Print" aria-label="Print" disabled={!canvas} onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
        </Button>
        <span className="ml-2 hidden items-center gap-1.5 text-[13px] font-medium text-success sm:inline-flex">
          <ShieldCheck className="h-4 w-4" /> Verified · ID <code className="font-mono">{cert.verification_id}</code>
        </span>
        <div className="ml-auto flex">
          <Button
            className="h-10 gap-2 rounded-l-xl rounded-r-none bg-brand-navy px-4 text-white hover:bg-brand-navy/90 dark:bg-white dark:text-brand-navy dark:hover:bg-white/90"
            disabled={!ready}
            onClick={() => download("pdf")}
          >
            {busy || !canvas ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download Certificate
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="h-10 w-10 rounded-l-none rounded-r-xl border-l border-white/20 bg-brand-navy p-0 text-white hover:bg-brand-navy/90 dark:border-brand-navy/20 dark:bg-white dark:text-brand-navy dark:hover:bg-white/90"
                disabled={!ready}
                aria-label="More download formats"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => download("pdf")}>
                <FileText className="mr-2 h-4 w-4" /> Download PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => download("png")}>
                <FileImage className="mr-2 h-4 w-4" /> Download image (PNG)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-5">
        <CertificateImage cert={cert} canvas={canvas} error={error} className="rounded-md shadow-[0_2px_18px_rgba(15,23,42,0.08)]" />
      </div>
    </div>
  );
}
