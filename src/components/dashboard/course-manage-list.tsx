"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronDown,
  ClipboardList,
  Eye,
  FileText,
  HelpCircle,
  ListTree,
  Loader2,
  MoreVertical,
  Pencil,
  Tag,
} from "lucide-react";
import type { Course } from "@/types";
import type { CourseStatusValue } from "@/services/api/courses";
import { courseCoverRawUrl, publicCourseCoverImageUrlFromRaw } from "@/lib/course-cover";
import { cn, getInitials } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Status pill + the options each role may choose (suspend replaces delete). */
const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  published: { label: "Publish", cls: "border-success/40 bg-success-soft text-success", dot: "bg-success" },
  draft: { label: "Draft", cls: "border-border bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  pending: { label: "Pending", cls: "border-warning/40 bg-warning-soft text-warning", dot: "bg-warning" },
  private: { label: "Private", cls: "border-brand-navy/25 bg-brand-navy/10 text-brand-navy dark:border-white/20 dark:bg-white/10 dark:text-white", dot: "bg-brand-navy dark:bg-white" },
  suspended: { label: "Suspended", cls: "border-destructive/40 bg-destructive/10 text-destructive", dot: "bg-destructive" },
};
const statusKey = (s?: string) => (s === "pending_review" ? "pending" : s && STATUS_META[s] ? s : "draft");

/** Desktop columns: course | category | price | author | date | actions */
const COLS = "xl:grid-cols-[minmax(0,1fr)_130px_70px_minmax(150px,180px)_100px_auto]";

function priceText(c: Course): string {
  const p = c.active_pricing;
  if (!p || p.is_free) return "Free";
  const minor = p.discount_price ?? p.price;
  return `$${(minor / 100).toFixed(minor % 100 ? 2 : 0)}`;
}

function Thumb({ course }: { course: Course }) {
  const [broken, setBroken] = useState(false);
  const src = publicCourseCoverImageUrlFromRaw(courseCoverRawUrl(course));
  return (
    <span className="relative block h-[60px] w-[92px] shrink-0 overflow-hidden rounded-lg bg-brand-navy ring-1 ring-border">
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element -- covers come from several hosts
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <BookOpen className="absolute inset-0 m-auto h-5 w-5 text-white/50" aria-hidden />
      )}
    </span>
  );
}

function Author({ course }: { course: Course }) {
  const [broken, setBroken] = useState(false);
  const name = course.instructor_name || "—";
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-navy/10 text-[11px] font-bold text-brand-navy ring-2 ring-background dark:bg-white/10 dark:text-white">
        {course.instructor_avatar_url && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.instructor_avatar_url} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
        ) : (
          getInitials(name)
        )}
      </span>
      <span className="line-clamp-2 text-[13.5px] font-semibold leading-tight text-foreground">{name}</span>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof ListTree; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Icon className="h-3.5 w-3.5 opacity-70" aria-hidden />
      {label}: <b className="font-semibold text-foreground">{value}</b>
    </span>
  );
}

export function CourseManageList({
  courses,
  isAdmin,
  currentUserId,
  busyId,
  onStatus,
  onPricing,
}: {
  courses: Course[];
  isAdmin: boolean;
  currentUserId?: string;
  busyId?: string | null;
  onStatus: (course: Course, status: CourseStatusValue) => void;
  onPricing: (course: Course) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* header row (desktop) */}
      <div
        className={cn(
          "hidden items-center gap-5 border-b border-border bg-muted/50 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground xl:grid",
          COLS,
        )}
      >
        <span>Course</span>
        <span>Category</span>
        <span>Price</span>
        <span>Author</span>
        <span>Date</span>
        <span className="text-right">Actions</span>
      </div>
      <ul className="divide-y divide-border/70">
        {courses.map((c) => {
          const sk = statusKey(c.status);
          const meta = STATUS_META[sk];
          const canEdit = isAdmin || c.instructor_id === currentUserId;
          const options: CourseStatusValue[] = isAdmin
            ? ["published", "pending", "draft", "private", "suspended"]
            : ["pending", "draft", "suspended"];
          const date = c.updated_at || c.created_at;
          const builder = `/dashboard/courses/${c.id}/builder`;
          const publicHref = `/courses/${c.slug}`;
          return (
            <li
              key={c.id}
              className={cn(
                "group flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-4 transition-colors hover:bg-muted/30 sm:px-5 xl:grid",
                COLS,
                sk === "suspended" && "opacity-70",
              )}
            >
              {/* course */}
              <div className="flex w-full min-w-0 items-center gap-4 xl:w-auto">
                <Thumb course={c} />
                <div className="min-w-0">
                  <Link
                    href={canEdit ? builder : publicHref}
                    className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground transition-colors hover:text-brand"
                    title={c.title}
                  >
                    {c.title}
                  </Link>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-muted-foreground">
                    <Stat icon={ListTree} label="Topic" value={c.section_count ?? 0} />
                    <Stat icon={FileText} label="Lesson" value={c.lesson_count ?? 0} />
                    <Stat icon={HelpCircle} label="Quiz" value={c.quiz_count ?? 0} />
                    <Stat icon={ClipboardList} label="Assignment" value={c.assignment_count ?? 0} />
                  </div>
                </div>
              </div>

              {/* category / price / author / date: wrap on small screens, table columns on xl */}
              <div className="truncate text-[13.5px] text-muted-foreground" title={c.category?.name}>
                {c.category?.name ?? "Uncategorized"}
              </div>
              <div className="whitespace-nowrap text-[14px] font-semibold text-foreground">{priceText(c)}</div>
              <Author course={c} />
              <div className="whitespace-nowrap text-[13px] leading-snug text-muted-foreground">
                {date ? (
                  <>
                    <span className="block text-foreground">{new Date(date).toLocaleDateString()}</span>
                    <span>{new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                  </>
                ) : (
                  "—"
                )}
              </div>

              {/* status + view + more */}
              <div className="ml-auto flex items-center gap-2 xl:ml-0 xl:justify-end">
                {canEdit ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={busyId === c.id}
                        className={cn(
                          "inline-flex h-9 min-w-[118px] items-center justify-between gap-2 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold transition hover:brightness-95",
                          meta.cls,
                        )}
                        aria-label={`Status: ${meta.label}. Change status`}
                      >
                        <span className="inline-flex items-center gap-2">
                          {busyId === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                          )}
                          {meta.label}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-80" aria-hidden />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {options.map((o) => (
                        <DropdownMenuItem
                          key={o}
                          disabled={o === sk}
                          onClick={() => onStatus(c, o)}
                          className={cn(o === "suspended" && "text-destructive focus:text-destructive")}
                        >
                          <span className={cn("mr-2 h-2 w-2 rounded-full", STATUS_META[o].dot)} />
                          {o === "pending" && !isAdmin ? "Submit for review" : o === "published" ? "Published" : STATUS_META[o].label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className={cn("inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold", meta.cls)}>
                    <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                    {meta.label}
                  </span>
                )}

                <Link
                  href={publicHref}
                  target="_blank"
                  className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3.5 text-[13px] font-medium text-foreground transition hover:border-brand/40 hover:bg-accent"
                >
                  View
                </Link>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-brand transition hover:bg-brand/20"
                      aria-label="Course actions"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem asChild>
                      <Link href={publicHref} target="_blank">
                        <Eye className="mr-2 h-4 w-4" /> View
                      </Link>
                    </DropdownMenuItem>
                    {canEdit ? (
                      <>
                        <DropdownMenuItem asChild>
                          <Link href={builder}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit (Course Builder)
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`${builder}?step=curriculum`}>
                            <ListTree className="mr-2 h-4 w-4" /> Curriculum
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onPricing(c)}>
                          <Tag className="mr-2 h-4 w-4" /> Pricing
                        </DropdownMenuItem>
                        {sk !== "suspended" ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => onStatus(c, "suspended")}
                              className="text-destructive focus:text-destructive"
                            >
                              Suspend
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
