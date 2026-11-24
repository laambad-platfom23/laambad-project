"use client";

import { useEffect, useState } from "react";
import { ABeeZee, Akaya_Kanadaka, Lexend } from "next/font/google";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CERT_H, CERT_W, renderCertificate, type CertificateDesign, type CertificateFonts } from "@/lib/certificate-render";
import type { Certificate } from "@/types";

/**
 * The certificate shown on the page is the same canvas picture that is downloaded (PNG / PDF),
 * so what the student sees is exactly what they get. Template: WordPress Tutor `tutor_cb_25649`.
 */

const akaya = Akaya_Kanadaka({ weight: "400", subsets: ["latin"], display: "block" });
const abeezee = ABeeZee({ weight: "400", subsets: ["latin"], display: "block" });
const lexend = Lexend({ weight: "400", subsets: ["latin"], display: "block" });

export const CERTIFICATE_FONTS: CertificateFonts = {
  script: akaya.style.fontFamily,
  body: abeezee.style.fontFamily,
  mono: lexend.style.fontFamily,
};
/** The fonts are only fetched once something on the page uses them. */
export const CERTIFICATE_FONT_CLASSES = cn(akaya.className, abeezee.className, lexend.className);

export function verifyUrl(verificationId: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://laambad.com";
  return `${origin}/verify/${verificationId}`;
}

/** Render the certificate canvas at `scale` (2 = sharp on screen, 3 = print quality). */
export function useCertificateCanvas(
  cert: Certificate | null | undefined,
  scale = 2,
  /** A5 builder preview: draw with this design instead of the certificate's own */
  designOverride?: Partial<CertificateDesign> | null
) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [error, setError] = useState(false);
  const key = cert
    ? `${cert.id}|${cert.verification_id}|${cert.student_name}|${cert.course_title}|${cert.duration}|${cert.completed_at}|${JSON.stringify(designOverride ?? cert.design ?? null)}`
    : "";
  useEffect(() => {
    if (!cert) return;
    let alive = true;
    setError(false);
    renderCertificate(cert, CERTIFICATE_FONTS, scale, verifyUrl(cert.verification_id), designOverride)
      .then((c) => alive && setCanvas(c))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, scale]);
  return { canvas, error };
}

export function CertificateImage({
  cert,
  canvas,
  error,
  className,
}: {
  cert: Certificate;
  canvas: HTMLCanvasElement | null;
  error?: boolean;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!canvas) return;
    let url: string | null = null;
    canvas.toBlob((b) => {
      if (!b) return;
      url = URL.createObjectURL(b);
      setSrc(url);
    }, "image/png");
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [canvas]);

  return (
    <div className={cn("certificate-print-area relative w-full overflow-hidden", CERTIFICATE_FONT_CLASSES, className)} style={{ aspectRatio: `${CERT_W} / ${CERT_H}` }}>
      {/* hidden sample text makes the browser fetch the three certificate fonts */}
      <span aria-hidden className="pointer-events-none absolute -left-[9999px] select-none">
        <span className={akaya.className}>Aa</span>
        <span className={abeezee.className}>Aa</span>
        <span className={lexend.className}>Aa</span>
      </span>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`Certificate: ${cert.student_name ?? ""} — ${cert.course_title ?? ""}`} className="certificate-image block h-full w-full" />
      ) : error ? (
        <div className="flex h-full items-center justify-center text-sm text-destructive">Could not draw the certificate. Refresh the page.</div>
      ) : (
        <Skeleton className="h-full w-full rounded-none" />
      )}
    </div>
  );
}
