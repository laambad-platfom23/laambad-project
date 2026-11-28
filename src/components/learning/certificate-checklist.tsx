"use client";

/**
 * Phase 2: "Your certificate" — what is done and what is left (lessons, quizzes, assignments).
 * The certificate comes when everything is done; an assignment waiting for its grade holds it back.
 */
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Award, CheckCircle2, CircleDashed, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { certificatesApi, type CertificateRequirements } from "@/services/api/certificates";
import { cn } from "@/lib/utils";

function Line({ ok, waiting, label, value, note }: { ok: boolean; waiting?: boolean; label: string; value: string; note?: string }) {
  const Icon = ok ? CheckCircle2 : waiting ? Clock : CircleDashed;
  return (
    <li className="flex items-start gap-3 py-2">
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", ok ? "text-success" : waiting ? "text-warning" : "text-muted-foreground/60")} />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-3 text-sm font-medium">
          {label} <span className="shrink-0 tabular-nums text-muted-foreground">{value}</span>
        </p>
        {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
      </div>
    </li>
  );
}

export function CertificateSteps({ r, compact }: { r: CertificateRequirements; compact?: boolean }) {
  return (
    <ul className={cn("divide-y", compact && "text-sm")}>
      <Line ok={r.lessons.total > 0 && r.lessons.done >= r.lessons.total} label="Lessons completed" value={`${r.lessons.done} / ${r.lessons.total}`} />
      {r.quizzes.total ? (
        <Line
          ok={!r.quizzes.left.length}
          label="Quizzes passed"
          value={`${r.quizzes.passed} / ${r.quizzes.total}`}
          note={r.quizzes.left.length ? `Still to pass: ${r.quizzes.left.map((q) => q.title).join(", ")}` : undefined}
        />
      ) : null}
      {r.assignments.total ? (
        <Line
          ok={!r.assignments.left.length && !r.assignments.pending.length}
          waiting={!r.assignments.left.length && r.assignments.pending.length > 0}
          label="Assignments passed"
          value={`${r.assignments.passed} / ${r.assignments.total}`}
          note={[
            r.assignments.pending.length ? `Waiting for the grade: ${r.assignments.pending.map((a) => a.title).join(", ")}` : "",
            r.assignments.left.length
              ? `Still to do: ${r.assignments.left.map((a) => `${a.title}${a.status === "not_passed" ? " (not passed — send it again)" : ""}`).join(", ")}`
              : "",
          ]
            .filter(Boolean)
            .join(" · ") || undefined}
        />
      ) : null}
    </ul>
  );
}

export function CertificateChecklist({ courseId }: { courseId: string }) {
  const { data: r } = useQuery({
    queryKey: ["certificate-requirements", courseId],
    queryFn: () => certificatesApi.requirements(courseId).then((x) => x.data),
    retry: false,
  });
  if (!r) return null;
  if (!r.gives_certificate && !r.certificate_id) {
    return <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">This course does not give a certificate.</p>;
  }
  return (
    <div className={cn("rounded-2xl border p-4 sm:p-5", r.certificate_id ? "border-success/30 bg-success-soft" : "bg-card")}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", r.certificate_id ? "bg-success text-white" : "bg-brand-soft text-brand")}>
          <Award className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{r.certificate_id ? "Your certificate is ready" : "Your certificate"}</p>
          <p className="text-xs text-muted-foreground">
            {r.certificate_id ? "You completed everything in this course." : "Complete every lesson and pass every quiz and assignment."}
          </p>
        </div>
        {r.certificate_id ? (
          <Button asChild size="sm" className="bg-success text-white hover:bg-success/90">
            <Link href={`/dashboard/certificates/${r.certificate_id}`}>View certificate</Link>
          </Button>
        ) : null}
      </div>
      {r.certificate_id ? null : (
        <div className="mt-3">
          <CertificateSteps r={r} />
        </div>
      )}
    </div>
  );
}
