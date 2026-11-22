"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  Loader2,
  Play,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton as SkeletonPrimitive } from "@/components/ui/skeleton";
import { cn, formatDate, getApiErrorMessage, getInitials } from "@/lib/utils";
import { certificatesApi } from "@/services/api/certificates";
import { extractCoverImageUrl, publicCourseCoverImageUrlFromRaw } from "@/lib/course-cover";
import { useAuthenticatedImageSrc } from "@/hooks/use-authenticated-image-src";
import type { EnrolledCourseDTO } from "@/types";

/** Same resolution as catalog: public file URL when possible, else JWT blob fetch for /api/v1/files/:id */
function EnrolledCourseCoverImage({ description, coverUrl }: { description?: string; coverUrl?: string | null }) {
  const raw = coverUrl?.trim() || extractCoverImageUrl(description);
  const publicUrl = publicCourseCoverImageUrlFromRaw(raw);
  const { displaySrc, loading, failed } = useAuthenticatedImageSrc(publicUrl ? null : raw);
  const src = publicUrl ?? displaySrc;
  const [broken, setBroken] = useState(false);

  useEffect(() => setBroken(false), [raw, publicUrl]);

  if (!raw) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted dark:bg-[#061528]">
        <BookOpen className="h-10 w-10 text-muted-foreground/35 sm:h-12 sm:w-12" strokeWidth={1.25} />
      </div>
    );
  }

  if (!publicUrl && loading) {
    return <SkeletonPrimitive className="h-full min-h-[7rem] w-full rounded-none" />;
  }

  if (!src || failed || broken) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted dark:bg-[#061528]">
        <BookOpen className="h-10 w-10 text-muted-foreground/35 sm:h-12 sm:w-12" strokeWidth={1.25} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
      onError={() => setBroken(true)}
    />
  );
}

/** Instructor photo (uploaded or migrated Tutor profile photo); initials if missing or broken. */
function InstructorAvatar({ name, src }: { name: string; src?: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-navy/10 text-[11px] font-bold text-brand-navy ring-2 ring-background dark:bg-white/10 dark:text-white">
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setBroken(true)} />
      ) : name ? (
        getInitials(name)
      ) : (
        <User className="h-3.5 w-3.5" />
      )}
    </span>
  );
}

const pct = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

export function EnrolledCourseCard({
  course,
  className,
}: {
  course: EnrolledCourseDTO;
  className?: string;
}) {
  /** Only paid enrollments may open the learning player; pending/offline approval stays on marketing / details. */
  const hasPaidAccess = course.payment_status === "paid";
  const learnHref = `/learn/${encodeURIComponent(course.course_slug)}`;
  const coursePageHref = `/courses/${encodeURIComponent(course.course_slug)}`;
  const href = hasPaidAccess ? learnHref : coursePageHref;
  const done = course.status === "completed" || pct(course.completion_percent) >= 100;
  const progress = pct(course.completion_percent);

  const router = useRouter();
  const queryClient = useQueryClient();
  const [claiming, setClaiming] = useState(false);
  const claim = async () => {
    setClaiming(true);
    try {
      const { data } = await certificatesApi.issue(course.course_id);
      toast.success("Congratulations! Your certificate is ready.");
      queryClient.invalidateQueries();
      router.push(`/dashboard/certificates/${data.id}`);
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not issue the certificate"));
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div
      className={cn(
        "group relative flex w-full flex-col overflow-hidden rounded-xl border border-border/70 bg-card text-left shadow-sm",
        hasPaidAccess &&
          "transition-all duration-300 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md hover:shadow-brand-navy/10 dark:hover:shadow-black/30",
        !hasPaidAccess &&
          "border-amber-500/25 transition-all duration-300 hover:-translate-y-0.5 hover:border-amber-500/40 hover:shadow-md hover:shadow-amber-950/10",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
    >
      {/* stretched link: the whole card opens the course; the certificate button sits above it */}
      <Link
        href={href}
        className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={course.course_title}
      />
      <div className="relative h-32 w-full shrink-0 overflow-hidden bg-brand-navy sm:h-36">
        <EnrolledCourseCoverImage description={course.description} coverUrl={course.cover_image_url} />
        <div
          className="pointer-events-none absolute inset-0 bg-black/45"
          aria-hidden
        />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          <Badge
            variant="secondary"
            className={cn(
              "border-0 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide shadow-sm backdrop-blur-sm",
              done
                ? "bg-success text-success-foreground"
                : "bg-white/90 text-brand-navy dark:bg-brand-navy-deep/90 dark:text-white"
            )}
          >
            {done ? (
              <CheckCircle2 className="mr-0.5 h-2.5 w-2.5" />
            ) : (
              <Clock className="mr-0.5 h-2.5 w-2.5" />
            )}
            {course.status}
          </Badge>
          {course.payment_status === "pending" ? (
            <Badge className="border-0 bg-warning px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide text-white shadow-sm">
              Pending
            </Badge>
          ) : null}
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-2.5 pt-8">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug tracking-tight text-white drop-shadow-md sm:text-base">
            {course.course_title}
          </h3>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3 pt-2">
        {course.instructor_name ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <InstructorAvatar name={course.instructor_name} src={course.instructor_avatar_url} />
            <span className="min-w-0 truncate">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
                Instructor
              </span>
              <span className="block truncate font-medium text-foreground">{course.instructor_name}</span>
            </span>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
            <span className="flex items-center gap-1">
              <GraduationCap className="h-3 w-3 text-brand" />
              {course.completed_lessons}/{course.total_lessons} lessons
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500 ease-out",
                done ? "bg-success" : "bg-brand"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground">Enrolled {formatDate(course.enrolled_at)}</p>

        <div className="mt-auto flex gap-2">
          <span
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors",
              hasPaidAccess
                ? done
                  ? "border border-primary/25 bg-transparent text-foreground group-hover:border-primary/50 group-hover:bg-accent"
                  : "bg-brand text-brand-foreground shadow-sm group-hover:bg-brand-hover"
                : "border border-warning/40 bg-warning-soft text-foreground group-hover:border-warning/60"
            )}
          >
            {hasPaidAccess ? <Play className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
            {hasPaidAccess ? (done ? "Review" : "Continue") : "Awaiting approval"}
          </span>
          {course.certificate_id ? (
            <Link
              href={`/dashboard/certificates/${course.certificate_id}`}
              className="relative z-20 inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-success py-2 text-xs font-semibold text-success-foreground shadow-sm transition hover:brightness-95"
            >
              <Award className="h-3.5 w-3.5" /> Certificate
            </Link>
          ) : course.certificate_available ? (
            <button
              type="button"
              disabled={claiming}
              onClick={claim}
              className="relative z-20 inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-success py-2 text-xs font-semibold text-success-foreground shadow-sm transition hover:brightness-95 disabled:opacity-70"
            >
              {claiming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Award className="h-3.5 w-3.5" />}
              Get certificate
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function EnrolledCourseCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm",
        className
      )}
    >
      <SkeletonPrimitive className="h-32 w-full rounded-none sm:h-36" />
      <div className="space-y-2 p-3">
        <SkeletonPrimitive className="h-8 w-full rounded-lg" />
        <SkeletonPrimitive className="h-2 w-full rounded-full" />
        <SkeletonPrimitive className="h-8 w-full rounded-lg" />
      </div>
    </div>
  );
}
