"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { extractCoverImageUrl, extractPreviewFileIdFromUrl } from "@/lib/course-cover";
import type { Course, CoursePricing } from "@/types";
import {
  BookMarked,
  CalendarDays,
  CheckCircle2,
  Clock,
  DollarSign,
  ImageOff,
  Layers,
  ListTree,
  Loader2,
  Pencil,
  Paperclip,
  PlayCircle,
  Rocket,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthenticatedImageSrc } from "@/hooks/use-authenticated-image-src";

function CoverThumb({ description, coverUrl }: { description: string | undefined; coverUrl?: string | null }) {
  const raw = coverUrl?.trim() || extractCoverImageUrl(description);
  const fileId = raw ? extractPreviewFileIdFromUrl(raw) : null;
  /** Draft courses cannot use GET /api/v1/public/files/:id — always resolve via JWT blob for file-backed covers. */
  const { displaySrc, loading, failed } = useAuthenticatedImageSrc(raw);
  const resolvedSrc = displaySrc;
  const [directBroken, setDirectBroken] = useState(false);

  useEffect(() => {
    setDirectBroken(false);
  }, [raw]);

  const frame =
    "relative aspect-[4/3] w-[7.5rem] shrink-0 overflow-hidden rounded-2xl sm:h-[7.25rem] sm:w-[9.5rem] sm:aspect-auto";

  if (!raw || failed) {
    return (
      <div
        className={cn(
          frame,
          "flex flex-col items-center justify-center gap-1.5 border border-dashed border-primary/15 bg-muted/70 text-muted-foreground"
        )}
        title={
          !raw
            ? "Add a cover in course description (![...](/your-image.png) — files in public/ use paths like /images/cover.jpg)"
            : failed
              ? "Could not load cover (sign in, or check file access)"
              : "Image failed to load"
        }
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-background/80 text-primary/45 shadow-inner ring-1 ring-border/50">
          <ImageOff className="h-4 w-4" strokeWidth={1.75} />
        </div>
        <span className="px-1 text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/80">
          No cover
        </span>
      </div>
    );
  }

  if (fileId && loading) {
    return (
      <div
        className={cn(
          frame,
          "flex items-center justify-center border border-border/50 bg-muted/40 ring-1 ring-inset ring-black/[0.04]"
        )}
      >
        <Loader2 className="h-7 w-7 animate-spin text-primary/40" aria-hidden />
      </div>
    );
  }

  if (!resolvedSrc) {
    return (
      <div
        className={cn(
          frame,
          "flex flex-col items-center justify-center gap-1.5 border border-dashed border-primary/15 bg-muted/70 text-muted-foreground"
        )}
        title="Could not resolve cover URL"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-background/80 text-primary/45 shadow-inner ring-1 ring-border/50">
          <ImageOff className="h-4 w-4" strokeWidth={1.75} />
        </div>
        <span className="px-1 text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/80">
          No cover
        </span>
      </div>
    );
  }

  if (!fileId && directBroken) {
    return (
      <div
        className={cn(
          frame,
          "flex flex-col items-center justify-center gap-1.5 border border-dashed border-primary/15 bg-muted/70 text-muted-foreground"
        )}
        title="Image failed to load"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-background/80 text-primary/45 shadow-inner ring-1 ring-border/50">
          <ImageOff className="h-4 w-4" strokeWidth={1.75} />
        </div>
        <span className="px-1 text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/80">
          No cover
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        frame,
        "ring-1 ring-black/[0.06] shadow-md shadow-black/[0.06] transition duration-500 group-hover/card:ring-primary/20 group-hover/card:shadow-lg group-hover/card:shadow-primary/10 dark:ring-white/[0.08]"
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolvedSrc}
        alt=""
        className="h-full w-full object-cover transition duration-500 ease-out group-hover/card:scale-[1.03]"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => {
          if (!fileId) setDirectBroken(true);
        }}
      />
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-black/20" />
    </div>
  );
}

function Metric({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Users;
  value: number;
  label: string;
}) {
  return (
    <div
      className="flex min-w-[3.25rem] flex-col items-center gap-0.5 rounded-xl bg-background/60 px-2.5 py-2 text-center ring-1 ring-border/40 sm:min-w-[4rem] sm:px-3"
      title={label}
    >
      <Icon className="mx-auto h-3.5 w-3.5 text-muted-foreground/80" strokeWidth={2} />
      <span className="text-sm font-bold tabular-nums tracking-tight text-foreground">{value}</span>
      <span className="hidden text-[10px] font-medium uppercase tracking-wide text-muted-foreground/90 sm:block">
        {label.split(" ")[0]}
      </span>
    </div>
  );
}

function formatPriceLine(ap: CoursePricing | null | undefined): { text: string; kind: "free" | "paid" | "unset" } {
  if (!ap) return { text: "Set pricing", kind: "unset" };
  if (ap.is_free) return { text: "Free", kind: "free" };
  const minor = ap.effective_amount ?? ap.price;
  const major = minor / 100;
  const cur = (ap.currency || "USD").toUpperCase();
  return { text: `${cur} ${major.toFixed(2)}`, kind: "paid" };
}

function PriceButton({
  course,
  onPricing,
}: {
  course: Course;
  onPricing: (course: Course) => void;
}) {
  const { text, kind } = formatPriceLine(course.active_pricing);
  return (
    <button
      type="button"
      onClick={() => onPricing(course)}
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-full border px-3.5 py-1.5 text-left text-sm font-semibold tracking-tight shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
        kind === "free" &&
          "border-emerald-500/25 bg-emerald-500/[0.09] text-emerald-950 hover:bg-emerald-500/15 dark:text-emerald-100",
        kind === "paid" &&
          "border-secondary/30 bg-secondary/[0.12] text-foreground hover:bg-secondary/20",
        kind === "unset" &&
          "border-dashed border-muted-foreground/30 bg-muted/50 text-muted-foreground hover:border-primary/30 hover:bg-primary/[0.05] hover:text-foreground"
      )}
    >
      <DollarSign className="h-4 w-4 shrink-0 opacity-85" strokeWidth={2} />
      <span className="min-w-0 truncate">{text}</span>
    </button>
  );
}

type Props = {
  courses: Course[];
  isAdmin?: boolean;
  busyId?: string | null;
  onManageCurriculum: (id: string) => void;
  onEdit: (id: string) => void;
  onPricing: (course: Course) => void;
  onDelete: (course: Course) => void;
  onApprove?: (course: Course) => void;
  onReject?: (course: Course) => void;
  onPublish?: (course: Course) => void;
};

export function CoursesTable({
  courses,
  isAdmin = false,
  busyId = null,
  onManageCurriculum,
  onEdit,
  onPricing,
  onDelete,
  onApprove,
  onReject,
  onPublish,
}: Props) {
  return (
    <div className="space-y-5">
      {courses.map((course) => {
        const sections = course.section_count ?? 0;
        const lessons = course.lesson_count ?? 0;
        const enrollments = course.enrollment_count ?? 0;
        const attachments = course.attachment_count ?? 0;
        const status = course.status ?? (course.is_published ?? course.published ? "published" : "draft");
        const isLive = status === "published";
        const isPending = status === "pending_review";
        const busy = busyId === course.id;

        return (
          <article
            key={course.id}
            className={cn(
              "group/card relative overflow-hidden rounded-2xl border border-border/50 bg-card",
              "shadow-[0_1px_2px_rgba(20,56,58,0.04),0_12px_32px_-8px_rgba(20,56,58,0.1)]",
              "transition-all duration-300 ease-out",
              "hover:border-primary/15 hover:shadow-[0_2px_4px_rgba(20,56,58,0.05),0_20px_40px_-12px_rgba(20,56,58,0.14)]",
              "hover:-translate-y-0.5"
            )}
          >
            {/* Accent bar */}
            <div
              className="absolute left-0 top-0 h-full w-[3px] bg-primary opacity-90"
              aria-hidden
            />
            <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-[100%] bg-secondary/[0.06] hidden" aria-hidden />
            <div className="absolute bottom-0 left-1/3 h-20 w-40 rounded-full bg-primary/[0.04] hidden" aria-hidden />

            <div className="relative flex flex-col gap-0 lg:flex-row lg:items-stretch">
              {/* Main */}
              <div className="flex min-w-0 flex-1 flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:gap-8 lg:pr-8">
                <CoverThumb description={course.description} coverUrl={course.cover_image_url} />

                <div className="min-w-0 flex-1 space-y-5">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/70">Course</span>
                      {isLive ? (
                        <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 pl-1.5 pr-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-500/20 dark:text-emerald-200">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]" />
                          Published
                        </span>
                      ) : isPending ? (
                        <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 pl-1.5 pr-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-200">
                          <Clock className="h-3 w-3 shrink-0" />
                          Pending review
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground ring-1 ring-border/60">
                          Draft
                        </span>
                      )}
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/[0.07] text-primary ring-1 ring-primary/10">
                        <BookMarked className="h-4 w-4" strokeWidth={2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl">
                          {course.title}
                        </h3>
                        <code className="mt-1.5 inline-block max-w-full truncate rounded-md bg-muted/70 px-2 py-0.5 font-mono text-[11px] text-muted-foreground ring-1 ring-border/50">
                          /{course.slug}
                        </code>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 border-y border-border/40 py-3">
                      <PriceButton course={course} onPricing={onPricing} />
                      <div className="hidden h-8 w-px bg-border/60 sm:block" aria-hidden />
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-secondary/80" />
                        <span className="tabular-nums">Created {formatDate(course.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/80">
                      Content overview
                    </p>
                    <div className="flex flex-wrap gap-2 sm:gap-3">
                      <Metric icon={Users} value={enrollments} label="Students enrolled" />
                      <Metric icon={PlayCircle} value={lessons} label="Lessons" />
                      <Metric icon={Layers} value={sections} label="Modules" />
                      <Metric icon={Paperclip} value={attachments} label="Attachments" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions rail */}
              <div className="flex flex-col border-t border-border/50 bg-muted/40 p-4 lg:w-[min(100%,17.5rem)] lg:shrink-0 lg:border-l lg:border-t-0 lg:p-5">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/90">Actions</p>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    size="default"
                    className={cn(
                      "h-11 w-full gap-2 rounded-xl font-semibold shadow-md",
                      "bg-primary text-primary-foreground",
                      "shadow-primary/20 transition hover:bg-primary/90 hover:shadow-lg"
                    )}
                    onClick={() => onManageCurriculum(course.id)}
                  >
                    <ListTree className="h-4 w-4" />
                    Curriculum
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10 gap-1.5 rounded-xl border-border/70 bg-background/90 font-medium shadow-sm hover:bg-primary/[0.04] hover:border-primary/25"
                      onClick={() => onEdit(course.id)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10 gap-1.5 rounded-xl border-border/70 bg-background/90 font-medium shadow-sm hover:bg-secondary/12 hover:border-secondary/40"
                      onClick={() => onPricing(course)}
                    >
                      <DollarSign className="h-3.5 w-3.5" />
                      Pricing
                    </Button>
                  </div>
                  {/* Approval workflow */}
                  {isAdmin && isPending ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        className="h-10 gap-1.5 rounded-xl bg-emerald-600 font-semibold text-white shadow-sm hover:bg-emerald-700"
                        onClick={() => onApprove?.(course)}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        className="h-10 gap-1.5 rounded-xl border-destructive/40 font-semibold text-destructive hover:bg-destructive/10"
                        onClick={() => onReject?.(course)}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  ) : isAdmin && !isLive ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      className="h-10 gap-1.5 rounded-xl bg-emerald-600 font-semibold text-white shadow-sm hover:bg-emerald-700"
                      onClick={() => onPublish?.(course)}
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                      Publish
                    </Button>
                  ) : !isAdmin && !isLive && !isPending ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      className="h-10 gap-1.5 rounded-xl bg-brand font-semibold text-brand-foreground shadow-sm hover:bg-brand-hover"
                      onClick={() => onPublish?.(course)}
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                      Submit for review
                    </Button>
                  ) : null}

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 gap-2 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onDelete(course)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete course
                  </Button>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
