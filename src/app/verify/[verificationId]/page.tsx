"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { certificatesApi } from "@/services/api/certificates";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Award,
  ShieldCheck,
  ShieldX,
  User,
  BookOpen,
  CalendarDays,
} from "lucide-react";
import type { Certificate } from "@/types";
import { CertificateWithToolbar } from "@/components/certificates/certificate-page";

export default function VerifyCertificatePage() {
  const params = useParams();
  const verificationId = params.verificationId as string;
  const [cert, setCert] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);

  useEffect(() => {
    if (!verificationId) return;
    certificatesApi
      .verify(verificationId)
      .then((res) => {
        setValid(res.data.valid);
        setCert(res.data.certificate);
      })
      .catch(() => {
        setValid(false);
      })
      .finally(() => setLoading(false));
  }, [verificationId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0B1F3A] p-4">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (valid && cert) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-[#0B1F3A] sm:py-12">
        <div className="mx-auto max-w-5xl space-y-5">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white shadow">
              <ShieldCheck className="h-4 w-4" /> Verified certificate
            </span>
            <p className="text-sm text-muted-foreground">
              Issued by Laambad E-Learning Platform to <b className="text-foreground">{cert.student_name ?? cert.user?.name}</b>.
            </p>
          </div>
          <CertificateWithToolbar cert={cert} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0B1F3A] p-4">
      <div className="w-full max-w-md">
        <Card className="overflow-hidden shadow-2xl border-none">
          {/* Header */}
          <div
            className={`h-36 flex flex-col items-center justify-center ${
              valid ? "bg-emerald-600" : "bg-red-600"
            }`}
          >
            {valid ? (
              <>
                <ShieldCheck className="h-14 w-14 text-white mb-2" />
                <Badge className="bg-white/20 text-white border-0 backdrop-blur-sm text-sm px-4 py-1">
                  Verified Certificate
                </Badge>
              </>
            ) : (
              <>
                <ShieldX className="h-14 w-14 text-white mb-2" />
                <Badge className="bg-white/20 text-white border-0 backdrop-blur-sm text-sm px-4 py-1">
                  Invalid Certificate
                </Badge>
              </>
            )}
          </div>

          <CardContent className="p-6 space-y-5">
            {valid && cert ? (
              <>
                <div className="text-center">
                  <h2 className="text-xl font-bold">Certificate of Completion</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    This certificate has been verified as authentic.
                  </p>
                </div>

                <div className="space-y-4">
                  {cert.user && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                      <User className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Awarded To
                        </p>
                        <p className="font-semibold">{cert.user.name}</p>
                      </div>
                    </div>
                  )}

                  {cert.course && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                      <BookOpen className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Course</p>
                        <p className="font-semibold">{cert.course.title}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                    <CalendarDays className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Date Issued
                      </p>
                      <p className="font-semibold">
                        {new Date(cert.issued_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                    <Award className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Verification ID
                      </p>
                      <p className="font-mono text-sm">
                        {cert.verification_id}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <h2 className="text-xl font-bold">Certificate Not Found</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  This verification ID does not match any issued certificate.
                  Please check the ID and try again.
                </p>
                <code className="text-xs font-mono mt-3 block text-muted-foreground">
                  {verificationId}
                </code>
              </div>
            )}

            {/* Footer */}
            <div className="pt-4 border-t text-center">
              <p className="text-xs text-muted-foreground">
                Powered by <span className="font-semibold">Laambad</span>{" "}
                E-Learning Platform
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
