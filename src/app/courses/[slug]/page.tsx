"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  BadgeCheck,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  GraduationCap,
  Infinity,
  Languages,
  Gift,
  Loader2,
  Lock,
  Play,
  ShoppingCart,
  Star,
  Users,
} from "lucide-react";
import {
  CourseCheckoutAuthModal,
  CourseMobileCtaBar,
} from "@/components/courses/course-detail";
import { toast } from "sonner";
import { coursesApi } from "@/services/api/courses";
import { enrollmentsApi } from "@/services/api/enrollments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Course, Section } from "@/types";
import { extractCoverImageUrl, publicCourseCoverImageUrlFromRaw } from "@/lib/course-cover";
import { CourseDescriptionBlocks } from "@/components/courses/course-description-blocks";
import { useAuthenticatedImageSrc } from "@/hooks/use-authenticated-image-src";
import { getApiErrorMessage } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { useCartStore } from "@/store/cart-store";
import { cn } from "@/lib/utils";

/**
 * Hero intro uses full width of the content lane; subtitle keeps a comfortable measure.
 * Main body cards use `w-full min-w-0` — full width beside the floating purchase card.
 */
const HERO_INTRO = "relative z-10 w-full min-w-0";

const SHELL =
  "mx-auto w-full max-w-[1440px] px-4 pr-5 sm:px-6 sm:pr-7 lg:px-8 lg:pr-10";

/** Left column: fixed reading width with side margins; on lg+ reserves ~27.5rem for 400px card + gutter (Udemy-like). */
const CONTENT_LANE = cn(
  "w-full min-w-0",
  "max-w-[min(46rem,100%)]",
  "lg:max-w-[min(46rem,calc(100%-27.5rem))]",
);

function CourseHeroBackdrop() {
  return (
    <div
      className="pointer-events-none absolute inset-0 bg-[#0B1F3A]"
      aria-hidden
    />
  );
}

function stripMarkdownPreview(md: string) {
  if (!md) return "";
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)\s*/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_{2}([^_]+)_{2}/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n-{3,}\s*\n/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Prefer the summary after `---` so hero doesn’t show raw metadata lines */
function heroSubtitleFromDescription(md: string): string {
  const full = stripMarkdownPreview(md);
  const parts = full.split(/\s*---\s*/);
  if (parts.length > 1) {
    const rest = parts.slice(1).join(" — ").trim();
    const m = rest.match(/^summary[:\s]+(.+)/i);
    if (m) return m[1].trim();
    return rest;
  }
  return full;
}

/** Strip dev / upload boilerplate sometimes pasted into descriptions */
function stripDescriptionNoise(s: string): string {
  return s
    .replace(/\s*Upload stores the file[\s\S]*$/i, "")
    .replace(/\s*API file URLs[\s\S]*$/i, "")
    .replace(/\s*Next\.js public\/uploads[\s\S]*$/i, "")
    .trim();
}

/** Hero blurb: prefer structured Summary body, never the raw "Subject: … Level: …" line */
function buildHeroBlurb(description: string, plain: string, aboutParsed: ReturnType<typeof parseAboutStructured>): string {
  const fallbackTagline =
    "Practical, structured lessons designed to take you from curiosity to confidence.";
  const body = aboutParsed.body?.trim();
  if (body) {
    const cleaned = stripDescriptionNoise(body);
    if (cleaned.length >= 20) return cleaned;
  }
  const fromSplit = heroSubtitleFromDescription(description).trim();
  if (fromSplit && !/^subject\s*:/i.test(fromSplit.slice(0, 100))) {
    const cleaned = stripDescriptionNoise(fromSplit);
    if (cleaned.length >= 20) return cleaned;
  }
  const sm = plain.match(/summary\s*[:\s]+(.+)/i);
  if (sm) {
    const cleaned = stripDescriptionNoise(sm[1]);
    if (cleaned.length >= 20) return cleaned;
  }
  const lines = plain
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const good = lines.find(
    (l) =>
      !isMetaLine(l) &&
      !/^---+$/i.test(l) &&
      !/upload stores|public\/uploads|next\.js|api file url/i.test(l)
  );
  if (good) return stripDescriptionNoise(good).slice(0, 320);
  return fallbackTagline;
}

function isMetaLine(s: string) {
  return /^(subject|level|language|summary)\s*:/i.test(s.trim());
}

function learnBullets(course: Course): string[] {
  const out: string[] = [];
  if (course.sections) {
    for (const sec of course.sections) {
      for (const les of sec.lessons ?? []) {
        if (les.title && !isMetaLine(les.title)) out.push(les.title);
        if (out.length >= 10) return out;
      }
    }
  }
  const plain = stripMarkdownPreview(course.description || "");
  const first = plain
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .find((l) => !isMetaLine(l) && !l.startsWith("---"));
  if (first && out.length < 4) out.push(first.slice(0, 120));
  return out.slice(0, 10);
}

/** Pull Subject / Level / Language + summary from one-line or multi-line descriptions */
function parseAboutStructured(plain: string): {
  fields: { label: string; value: string }[];
  body: string;
} {
  const t = plain.replace(/\r\n/g, "\n").trim();
  const fields: { label: string; value: string }[] = [];

  const sub = t.match(/Subject:\s*([\s\S]+?)(?=\s+Level:|\s+Language:|\s+Summary|\s*---|\n|$)/i);
  const lev = t.match(/Level:\s*([\s\S]+?)(?=\s+Language:|\s+Summary|\s*---|\n|$)/i);
  const lang = t.match(/Language:\s*([\s\S]+?)(?=\s+Summary|\s*---|\n|$)/i);

  if (sub?.[1]?.trim()) fields.push({ label: "Subject", value: sub[1].trim() });
  if (lev?.[1]?.trim()) fields.push({ label: "Level", value: lev[1].trim() });
  if (lang?.[1]?.trim()) fields.push({ label: "Language", value: lang[1].trim() });

  const afterBreak = t.split(/\s*---\s*/).slice(1).join("\n\n").trim();
  let body = "";
  if (afterBreak) {
    const sm = afterBreak.match(/^\s*summary[:\s]+([\s\S]+)/i);
    body = sm ? sm[1].trim() : afterBreak;
  } else {
    const sm = t.match(/Summary\s*[:\s]+([\s\S]+)/i);
    body = sm ? sm[1].trim() : "";
  }

  if (fields.length === 0 && !body) return { fields: [], body: t };
  return { fields, body };
}

function fieldIcon(label: string) {
  const l = label.toLowerCase();
  if (l === "subject") return BookOpen;
  if (l === "level") return GraduationCap;
  if (l === "language") return Languages;
  return BookOpen;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-start gap-3 text-base font-bold tracking-tight text-[#0B1F3A] sm:text-lg md:text-xl dark:text-white">
      <span className="mt-1 h-6 w-1 shrink-0 rounded-full bg-[#E84A27] sm:h-7" aria-hidden />
      <span className="min-w-0 leading-snug">{children}</span>
    </h2>
  );
}

/** Fix common lesson typos in UI only */
function polishLessonTitle(title: string) {
  return title
    .replace(/\bIntrouciton\b/gi, "Introduction")
    .replace(/\bIntrodution\b/gi, "Introduction");
}

function sortSectionsForOutline(sections: Section[]): Section[] {
  return [...sections].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function sortLessonsInSection(lessons: NonNullable<Section["lessons"]>) {
  return [...lessons].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function formatLessonDuration(min?: number): string {
  if (min == null || min <= 0) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function formatMoney(minor: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
    minimumFractionDigits: 2,
  }).format(minor / 100);
}

function instructorInitials(name: string) {
  const parts = name.split(/[,\s]+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts[1]?.[0] ?? (parts[0]?.[1] ?? "");
  return (a + b).toUpperCase().slice(0, 2);
}

function sumSectionMinutes(lessons: Section["lessons"]) {
  if (!lessons?.length) return 0;
  return lessons.reduce((acc, l) => acc + (l.duration_minutes ?? 0), 0);
}

function formatTotalMinutes(total: number): string {
  if (total <= 0) return "";
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h ${m} min` : `${h}h`;
}

/** Udemy-style purchase panel: plan row, price, optional urgency, feature bullets */
function PurchasePlanPanel({
  course,
  isFree,
  guest,
}: {
  course: Course;
  isFree: boolean;
  /** Not signed in — emphasize that a free account is still required to watch */
  guest?: boolean;
}) {
  const p = course.active_pricing;

  if (!p) {
    return <p className="text-lg font-semibold text-gray-900 dark:text-white">Pricing unavailable</p>;
  }

  if (p.is_free || isFree) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-[#0B1F3A]/20 bg-[#0B1F3A]/[0.06] px-3 py-2.5 dark:border-white/30 dark:bg-[#0B1F3A]/70">
          <p className="text-sm font-semibold text-[#0B1F3A] dark:text-white">This course is free</p>
          <p className="mt-1 text-xs text-[#0B1F3A]/80 dark:text-white/80">
            {guest ? (
              <>
                <span className="font-semibold text-[#0B1F3A] dark:text-[#FF8A66]">Account required.</span>{" "}
                Sign in or create a free account, enroll, then watch — guests cannot play lessons, even
                for free courses.
              </>
            ) : (
              "Enroll to get full access to all lessons."
            )}
          </p>
        </div>
        <ul className="space-y-2.5">
          <li className="flex gap-3 text-[13px] leading-snug text-gray-700 dark:text-foreground/85">
            <Infinity className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-muted-foreground" strokeWidth={2} />
            Full lifetime access
          </li>
        </ul>
      </div>
    );
  }

  const cur = p.currency || "USD";
  const effective = p.effective_amount ?? p.price;
  const list = p.price;
  const hasDiscount =
    p.discount_price != null && p.discount_price > 0 && p.discount_price < list;
  const showStrike = hasDiscount || (list > effective && effective < list);
  const pctOff =
    showStrike && list > effective ? Math.round(((list - effective) / list) * 100) : null;

  return (
    <div className="space-y-3">
      <label className="flex cursor-default items-center gap-2.5 rounded-lg border border-[#0B1F3A]/15 bg-[#f5f8fd]/90 px-3 py-2.5 dark:border-white/25 dark:bg-muted/55">
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-[#0B1F3A] bg-[#0B1F3A] shadow-sm dark:border-[#FF6B45] dark:bg-[#0B1F3A]"
          aria-hidden
        >
          <span className="h-1.5 w-1.5 rounded-full bg-white dark:bg-[#0B1F3A]" />
        </span>
        <span className="text-sm font-semibold leading-tight text-gray-900 dark:text-foreground">
          Buy individual course
        </span>
      </label>

      <div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-2xl font-bold tabular-nums tracking-tight text-[#0B1F3A] dark:text-white">
            {formatMoney(effective, cur)}
          </span>
          {showStrike ? (
            <span className="text-lg text-gray-400 line-through dark:text-muted-foreground">
              {formatMoney(list, cur)}
            </span>
          ) : null}
          {pctOff != null && pctOff > 0 ? (
            <span className="rounded bg-[#0B1F3A]/25 px-2 py-0.5 text-sm font-bold text-white dark:bg-[#E84A27]/20 dark:text-[#FF8A66]">
              {pctOff}% off
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-muted-foreground">
          Taxes where applicable
        </p>
        {pctOff != null && pctOff > 0 ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-[#0B1F3A] dark:text-[#FF8A66]">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0" aria-hidden />
              Save {pctOff}% today
            </span>
            <span className="font-semibold text-red-600 dark:text-red-400">Limited time at this price</span>
          </p>
        ) : null}
      </div>

      <ul className="space-y-2 border-t border-gray-100 pt-3 dark:border-border">
        <li className="flex gap-2 text-[12px] leading-snug text-gray-700 dark:text-foreground/85">
          <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0B1F3A] dark:text-[#FF8A66]" strokeWidth={2} />
          30-day money-back
        </li>
        <li className="flex gap-2 text-[12px] leading-snug text-gray-700 dark:text-foreground/85">
          <Infinity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500 dark:text-muted-foreground" strokeWidth={2} />
          Lifetime access
        </li>
      </ul>
    </div>
  );
}

function StarRow({
  rating = 4.7,
  size = "sm",
}: {
  rating?: number;
  size?: "sm" | "md";
}) {
  const full = Math.floor(rating);
  const partial = rating - full;
  const starClass = size === "md" ? "h-5 w-5" : "h-4 w-4";
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            starClass,
            i < full
              ? "fill-[#E84A27] text-[#E84A27]"
              : i === full && partial > 0
                ? "fill-[#E84A27]/60 text-[#E84A27]"
                : "fill-gray-200 text-gray-200 dark:fill-white/20 dark:text-white/20"
          )}
        />
      ))}
    </div>
  );
}

function formatMonthYear(date: string | Date) {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getFullYear()}`;
}

function SidebarCover({ description, coverUrl }: { description: string | undefined; coverUrl?: string | null }) {
  const raw = coverUrl?.trim() || extractCoverImageUrl(description);
  const publicUrl = publicCourseCoverImageUrlFromRaw(raw);
  const [publicFetchFailed, setPublicFetchFailed] = useState(false);
  useEffect(() => setPublicFetchFailed(false), [raw, publicUrl]);

  const hookInput = publicUrl && !publicFetchFailed ? null : raw;
  const { displaySrc, loading, failed } = useAuthenticatedImageSrc(hookInput);
  const src = publicUrl && !publicFetchFailed ? publicUrl : displaySrc;
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [raw, publicUrl, publicFetchFailed, src]);

  if (loading && raw) {
    return <Skeleton className="aspect-video max-h-[200px] w-full rounded-t-xl" />;
  }
  if (!src || failed || broken) {
    return (
      <div className="flex aspect-video max-h-[200px] min-h-[120px] items-center justify-center rounded-t-xl bg-[#0B1F3A]">
        <div className="flex flex-col items-center gap-2 text-white/90">
          <div className="group relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/40 bg-white/10 shadow-lg backdrop-blur-sm transition-transform duration-300 hover:scale-105">
            <span className="absolute inset-0 rounded-full bg-[#E84A27]/25 opacity-75 blur-md transition group-hover:opacity-100" aria-hidden />
            <Play className="relative ml-0.5 h-8 w-8 fill-[#E84A27] text-[#E84A27] drop-shadow-md transition group-hover:scale-110" />
          </div>
          <span className="text-xs font-semibold tracking-wide text-white">Preview this course</span>
        </div>
      </div>
    );
  }
  return (
    <div className="relative aspect-video max-h-[200px] min-h-[120px] w-full overflow-hidden rounded-t-xl bg-[#0B1F3A]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover"
        onError={() => {
          if (publicUrl && !publicFetchFailed) {
            setPublicFetchFailed(true);
            return;
          }
          setBroken(true);
        }}
      />
          <div className="absolute inset-0 flex items-center justify-center bg-[#0B1F3A]/55">
        <div className="flex flex-col items-center gap-2">
          <div className="group relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/45 bg-[#0B1F3A]/55 shadow-xl backdrop-blur-md transition-transform duration-300 hover:scale-105">
            <span className="absolute inset-0 rounded-full bg-[#E84A27]/20 opacity-60 blur-md group-hover:opacity-90" aria-hidden />
            <Play className="relative ml-0.5 h-8 w-8 fill-[#E84A27] text-[#E84A27] drop-shadow-md transition group-hover:scale-110" />
          </div>
          <span className="rounded-full bg-[#0B1F3A] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white shadow-md backdrop-blur-sm">
            Preview
          </span>
        </div>
      </div>
    </div>
  );
}

export default function PublicCourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = typeof params.slug === "string" ? decodeURIComponent(params.slug) : "";
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const addCartLine = useCartStore((s) => s.addItem);

  const { data: course, isLoading, isError } = useQuery({
    queryKey: ["public-course-detail", slug],
    queryFn: () => coursesApi.publicGetBySlug(slug).then((r) => r.data as Course),
    enabled: !!slug,
  });

  const live = course ? (course.is_published ?? course.published ?? false) : false;

  const { data: enrollmentProgress } = useQuery({
    queryKey: ["course-enrollment-access", course?.id, user?.id],
    queryFn: () => enrollmentsApi.getProgress(course!.id).then((r) => r.data),
    enabled: !!user && !!course?.id,
    retry: false,
  });

  const userHasCourseAccess = !!enrollmentProgress;

  const learnHref = useMemo(
    () => (course ? `/learn/${encodeURIComponent(course.slug)}` : ""),
    [course],
  );

  const sortedOutlineSections = useMemo(
    () => (course?.sections?.length ? sortSectionsForOutline(course.sections) : []),
    [course?.sections],
  );

  const courseTotalMinutes = useMemo(() => {
    if (!course?.sections?.length) return 0;
    let t = 0;
    for (const s of course.sections) {
      for (const l of s.lessons ?? []) t += l.duration_minutes ?? 0;
    }
    return t;
  }, [course?.sections]);

  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const [checkoutAuthOpen, setCheckoutAuthOpen] = useState(false);
  const checkoutIntentRef = useRef<null | "buy" | "cart" | "enroll_free">(null);

  useEffect(() => {
    if (!sortedOutlineSections.length) return;
    setOpenSectionId((prev) => {
      if (prev && sortedOutlineSections.some((s) => s.id === prev)) return prev;
      return sortedOutlineSections[0]?.id ?? null;
    });
  }, [sortedOutlineSections]);

  const enrollMutation = useMutation({
    mutationFn: (courseId: string) => enrollmentsApi.enroll(courseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      queryClient.invalidateQueries({ queryKey: ["catalog-courses"] });
      queryClient.invalidateQueries({ queryKey: ["my-courses"] });
      queryClient.invalidateQueries({ queryKey: ["course-enrollment-access"] });
      toast.success("You're enrolled!");
      router.push(`/learn/${encodeURIComponent(slug)}`);
    },
    onError: (err: unknown, courseId: string) => {
      if (axios.isAxiosError(err) && err.response?.status === 402) {
        toast.message("Complete payment to enroll");
        router.push(`/checkout?slug=${encodeURIComponent(slug)}`);
        return;
      }
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        toast.message("You're already enrolled");
        router.push(`/learn/${encodeURIComponent(slug)}`);
        return;
      }
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        toast.error("Session expired — sign in again, then try enrolling.");
        return;
      }
      toast.error(getApiErrorMessage(err, "Could not enroll"));
    },
  });

  const addCourseToCartInternal = () => {
    if (!course || !live) return;
    if (userHasCourseAccess) {
      router.push(learnHref);
      toast.message("You already have access — opening your course.");
      return;
    }
    const p = course.active_pricing;
    const free = p?.is_free ?? false;
    const effective = p ? (p.effective_amount ?? p.price) : 0;
    const cur = p?.currency || "USD";
    const added = addCartLine({
      courseId: course.id,
      slug: course.slug,
      title: course.title,
      priceMinor: free ? 0 : effective,
      currency: cur,
      isFree: free,
    });
    if (added) toast.success("Added to cart");
    else toast.message("This course is already in your cart");
  };

  const handleCheckoutAuthSuccess = async () => {
    if (!course) return;
    const learnPath = `/learn/${encodeURIComponent(course.slug)}`;
    try {
      const { data } = await enrollmentsApi.getProgress(course.id);
      if (data) {
        const uid = useAuthStore.getState().user?.id;
        if (uid) queryClient.setQueryData(["course-enrollment-access", course.id, uid], data);
        router.push(learnPath);
        toast.message("You already have access — opening your course.");
        return;
      }
    } catch {
      // Not enrolled (e.g. 404) — continue with checkout / cart / enroll intent.
    }

    const intent = checkoutIntentRef.current;
    checkoutIntentRef.current = null;
    const checkoutPath = `/checkout?slug=${encodeURIComponent(course.slug)}`;
    const free = course.active_pricing?.is_free ?? false;
    if (intent === "buy") {
      router.push(checkoutPath);
    } else if (intent === "cart") {
      addCourseToCartInternal();
    } else if (intent === "enroll_free" && free) {
      enrollMutation.mutate(course.id);
    }
  };

  const handleAddToCart = () => {
    if (!course || !live) return;
    if (user && userHasCourseAccess) {
      router.push(learnHref);
      toast.message("You already have access — opening your course.");
      return;
    }
    if (!user) {
      checkoutIntentRef.current = "cart";
      setCheckoutAuthOpen(true);
      return;
    }
    addCourseToCartInternal();
  };

  const handleBuyNow = () => {
    if (!course || !live) return;
    if (user && userHasCourseAccess) {
      router.push(learnHref);
      toast.message("You already have access — opening your course.");
      return;
    }
    const free = course.active_pricing?.is_free ?? false;
    const checkoutPath = `/checkout?slug=${encodeURIComponent(course.slug)}`;
    if (free) {
      if (!user) {
        checkoutIntentRef.current = "enroll_free";
        setCheckoutAuthOpen(true);
        return;
      }
      enrollMutation.mutate(course.id);
      return;
    }
    if (!user) {
      checkoutIntentRef.current = "buy";
      setCheckoutAuthOpen(true);
      return;
    }
    router.push(checkoutPath);
  };

  if (!slug) {
    return (
      <div className="px-4 py-20 text-center text-muted-foreground">
        Invalid link. <Link href="/courses">Browse catalog</Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <section className="relative overflow-hidden text-white">
        <CourseHeroBackdrop />
        <div className="relative z-10 px-4 py-12">
          <div className="mx-auto max-w-7xl space-y-4">
            <Skeleton className="h-6 w-2/3 bg-white/10" />
            <Skeleton className="h-12 w-full max-w-2xl bg-white/10" />
            <Skeleton className="h-64 w-full max-w-md bg-white/10" />
          </div>
        </div>
      </section>
    );
  }

  if (isError || !course) {
    return (
      <div className="px-4 py-20 text-center">
        <p className="text-muted-foreground">We couldn&apos;t load this course.</p>
        <Button asChild className="mt-4" variant="outline">
          <Link href="/courses">Browse catalog</Link>
        </Button>
      </div>
    );
  }

  const lessons = course.lesson_count ?? 0;
  const enrolled = course.enrollment_count ?? 0;
  const pricing = course.active_pricing;
  const isFree = pricing?.is_free ?? false;
  const bullets = learnBullets(course);
  /** Migrated WordPress HTML descriptions arrive as safe blocks; Markdown ones keep the old parsing. */
  const descriptionBlocks = course.description_blocks?.length ? course.description_blocks : null;
  const about = descriptionBlocks ? course.summary ?? "" : stripMarkdownPreview(course.description || "");
  const aboutParsed = parseAboutStructured(descriptionBlocks ? "" : about);
  const levelLabel = aboutParsed.fields.find((f) => f.label.toLowerCase() === "level")?.value;
  const heroBlurb = descriptionBlocks
    ? course.summary || "Practical, structured lessons designed to take you from curiosity to confidence."
    : buildHeroBlurb(course.description || "", about, aboutParsed);
  const rating = course.rating && course.rating.count > 0 ? course.rating : null;
  const bestseller = enrolled >= 50 || lessons >= 8;
  const breadcrumbMid = course.category?.name ?? "All courses";
  let priceLabel = "";
  if (isFree) priceLabel = "Free";
  else if (pricing)
    priceLabel = formatMoney(pricing.effective_amount ?? pricing.price, pricing.currency || "USD");

  return (
    <>
      {/* ── Hero: compact blue band; card absolutely positioned on lg+ so it overlaps the light section below (reference-style) ── */}
      <section className="overflow-visible text-white selection:bg-[#0B1F3A]/25 selection:text-white dark:bg-[hsl(var(--background))]">
        <div className="w-full bg-[#0B1F3A] dark:bg-[hsl(var(--background))]">
          <div className={cn("relative", SHELL, "pb-3 pt-4 sm:pb-4 sm:pt-5")}>
            <div className={cn(HERO_INTRO, CONTENT_LANE)}>
              <nav
                className="mb-2 flex flex-wrap items-center gap-1 text-[12px] font-normal leading-snug text-[#c4d4f4] dark:text-white/55"
                aria-label="Breadcrumb"
              >
                <Link href="/" className="transition-colors hover:text-[#FF8A66] hover:underline">
                  Home
                </Link>
                <span className="text-white/35" aria-hidden>
                  ›
                </span>
                <Link href="/courses" className="transition-colors hover:text-[#FF8A66] hover:underline">
                  Courses
                </Link>
                <span className="text-white/35" aria-hidden>
                  ›
                </span>
                <span className="line-clamp-1 text-[#FF6B45]">{breadcrumbMid}</span>
              </nav>

              <h1 className="text-balance text-2xl font-bold leading-[1.15] tracking-tight text-white sm:text-3xl lg:text-[2.125rem] lg:leading-[1.12]">
                {course.title}
              </h1>

              <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-white/85 md:text-base">
                {heroBlurb.length > 220 ? `${heroBlurb.slice(0, 220)}…` : heroBlurb}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2 gap-y-2">
                {bestseller ? (
                  <span className="rounded-sm bg-[#0B1F3A] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
                    Bestseller
                  </span>
                ) : null}
                {levelLabel ? (
                  <span className="rounded-sm border border-[#E84A27]/50 bg-[#0B1F3A]/80 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#FF6B45] shadow-sm">
                    {levelLabel}
                  </span>
                ) : null}
                {course.category?.name ? (
                  <span className="rounded-sm border border-white/25 bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/95 backdrop-blur-sm">
                    {course.category.name}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/90">
                {rating ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <StarRow rating={rating.average} size="sm" />
                      <span className="font-bold tabular-nums text-[#FF6B45]">{rating.average.toFixed(1)}</span>
                      <span className="text-[#c4d4f4]/90">
                        ({rating.count.toLocaleString()} {rating.count === 1 ? "rating" : "ratings"})
                      </span>
                    </div>
                    <span className="text-white/35">·</span>
                  </>
                ) : null}
                <div className="flex items-center gap-1.5">
                  <Users className="h-4 w-4 shrink-0 text-[#FF6B45]" aria-hidden />
                  <span className="tabular-nums">{enrolled.toLocaleString()} students</span>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 border-t border-white/15 pt-4 text-[13px] text-white/80 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2">
                {course.instructor_name ? (
                  <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1">
                    <span className="shrink-0 text-white/55">Created by</span>
                    {course.instructor_name.split(",").map((p, i) => (
                      <span key={i}>
                        {i > 0 ? <span className="text-white/35">, </span> : null}
                        <span className="font-semibold text-[#FF6B45] underline decoration-[#FF6B45]/40 underline-offset-2">
                          {p.trim()}
                        </span>
                      </span>
                    ))}
                  </span>
                ) : null}
                {course.updated_at ? (
                  <span className="inline-flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-[#FF6B45]" aria-hidden />
                    Last updated {formatMonthYear(course.updated_at)}
                  </span>
                ) : null}
              </div>

              <a
                href="#course-main"
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#c4d4f4] underline-offset-4 transition-colors hover:text-[#FF8A66]"
              >
                View course details
                <ChevronDown className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
              </a>
            </div>

            <aside
              className={cn(
                "relative z-30 mx-auto mt-6 w-full max-w-[400px]",
                "lg:absolute lg:right-4 lg:top-9 lg:mx-0 lg:mt-0 lg:max-w-[400px]",
                "xl:right-8",
              )}
            >
              <div
                className="overflow-hidden rounded-2xl border border-white/20 bg-white/95 shadow-[0_24px_64px_-16px_rgba(11,31,58,0.28)] ring-1 ring-[#0B1F3A]/10 backdrop-blur-md dark:border-white/30 dark:bg-[#0B1F3A]/90 dark:shadow-[0_28px_70px_-20px_rgba(0,0,0,0.45)] dark:backdrop-blur-xl dark:ring-[#E84A27]/15"
                style={{ maxWidth: 400 }}
              >
                <SidebarCover description={course.description} coverUrl={course.cover_image_url} />
                <div className="border-b border-[#0B1F3A]/[0.08] bg-[#f5f8fd]/90 px-3 py-2 dark:border-border dark:bg-[#061528]/80">
                  <p className="text-[11px] leading-snug text-gray-700 dark:text-white/80">
                    <span className="font-semibold text-[#0B1F3A] dark:text-[#FF8A66]">Subscribe &amp; save</span>
                    <span className="text-gray-500 dark:text-white/60"> — Membership bundles coming soon.</span>
                  </p>
                </div>
                <div className="border-b border-[#0B1F3A]/[0.08] bg-white/90 px-4 py-4 dark:border-border dark:bg-white/5">
                  <PurchasePlanPanel course={course} isFree={isFree} guest={!user} />
                </div>
                <div className="space-y-2.5 bg-white px-4 pb-4 pt-3 dark:bg-[#061528]/90">
                  {userHasCourseAccess ? (
                    <>
                      <Button
                        asChild
                        className="group relative h-12 w-full overflow-hidden rounded-xl bg-[#0B1F3A] dark:bg-brand dark:hover:bg-brand-hover text-base font-bold text-white shadow-lg shadow-[#0B1F3A]/25 transition hover:bg-[#123252] hover:shadow-[0_0_32px_-4px_rgba(11,31,58,0.45)]"
                      >
                        <Link href={learnHref}>
                          <Play className="mr-2 h-5 w-5 shrink-0 fill-current" aria-hidden />
                          Continue learning
                        </Link>
                      </Button>
                      <p className="text-center text-xs text-[#0B1F3A]/90 dark:text-[#FF8A66]/90">
                        You have full access to this course.
                      </p>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        className="group relative h-12 w-full overflow-hidden rounded-xl bg-[#0B1F3A] dark:bg-brand dark:hover:bg-brand-hover text-base font-bold text-white shadow-lg shadow-[#0B1F3A]/25 transition hover:bg-[#123252] hover:shadow-[0_0_32px_-4px_rgba(11,31,58,0.45)] disabled:opacity-60"
                        disabled={!live || (isFree && !!user && enrollMutation.isPending)}
                        onClick={handleBuyNow}
                      >
                        {isFree && user && enrollMutation.isPending ? (
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        ) : null}
                        {isFree ? (!user ? "Sign in to enroll & watch" : "Start learning") : "Buy now"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 w-full rounded-xl border-2 border-[#0B1F3A]/25 bg-white text-sm font-semibold text-[#0B1F3A] transition hover:bg-[#0B1F3A]/5 dark:border-white/25 dark:bg-transparent dark:text-white dark:hover:bg-white/10"
                        disabled={!live}
                        onClick={handleAddToCart}
                      >
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        Add to cart
                      </Button>
                    </>
                  )}
                  {!live ? (
                    <p className="text-center text-xs text-muted-foreground">Not open for enrollment.</p>
                  ) : userHasCourseAccess ? null : (
                    <p className="text-center text-[10px] leading-snug text-gray-500 dark:text-gray-400">
                      {!user && isFree
                        ? "Free courses still need an account: sign in or register to enroll and watch."
                        : !user
                          ? "Sign in to add to cart. Buy now opens checkout."
                          : "Buy now or add to cart to get access."}
                    </p>
                  )}
                </div>
                <div className="border-t border-[#0B1F3A]/[0.08] bg-[#f5f8fd]/80 px-4 py-3 dark:border-border dark:bg-muted/40">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#0B1F3A]/80 dark:text-gray-400">
                    <Gift className="h-3.5 w-3.5 text-[#0B1F3A] dark:text-[#FF8A66]" aria-hidden />
                    Apply coupon
                  </p>
                  <div className="flex max-w-full gap-2">
                    <Input
                      placeholder="Code"
                      className="h-9 min-w-0 flex-1 rounded-md border-[#0B1F3A]/15 bg-white text-xs focus-visible:ring-[#0B1F3A]/30 dark:border-border dark:bg-card"
                      disabled
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0 rounded-md border-[#0B1F3A]/25 px-3 text-xs"
                      disabled
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* Main content — top padding clears the overlapping purchase card on large screens */}
      <section
        id="course-main"
        className="scroll-mt-24 border-t border-gray-200 bg-[#f7f9fb] dark:border-white/20 dark:bg-[hsl(var(--background))]"
      >
        <div
          className={cn(
            SHELL,
            "pb-10 pt-3 sm:pb-12 sm:pt-4 lg:pb-14",
            /* Space below hero for overlapping purchase card — keep moderate to avoid a huge white band */
            "lg:pt-12 xl:pt-16",
          )}
        >
          <div className={CONTENT_LANE}>
            <div className="w-full min-w-0 space-y-6 md:space-y-8">
              {bullets.length > 0 ? (
                <div className="rounded-none border border-gray-200 bg-white p-5 shadow-sm dark:border-white/20 dark:bg-card sm:rounded-lg sm:p-6 md:p-8">
                  <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-foreground md:text-2xl">
                    What you&apos;ll learn
                  </h2>
                  <ul
                    className={cn(
                      "mt-4 grid list-none gap-x-6 gap-y-2.5 sm:mt-5 sm:gap-y-3",
                      bullets.length <= 3 ? "sm:grid-cols-1" : "sm:grid-cols-2",
                    )}
                  >
                    {bullets.map((b, i) => (
                      <li key={i} className="flex gap-3 text-[14px] leading-snug text-gray-800 dark:text-foreground/90">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0B1F3A] text-white dark:bg-[#0B1F3A] dark:text-white">
                          <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                        </span>
                        <span className="min-w-0">{polishLessonTitle(b)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {about.length > 0 ? (
                <div className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-4 shadow-[0_2px_12px_rgba(232,93,4,0.04)] ring-1 ring-[#0B1F3A]/[0.04] dark:border-white/20 dark:bg-card dark:ring-[#E84A27]/10 sm:p-5">
                  <SectionTitle>About this course</SectionTitle>
                  {aboutParsed.fields.length > 0 ? (
                    <div
                      className="mt-3 grid grid-cols-1 gap-2 sm:mt-3.5 sm:grid-cols-3"
                      role="list"
                      aria-label="Course details"
                    >
                      {aboutParsed.fields.map((f, idx) => {
                        const Icon = fieldIcon(f.label);
                        const isGold = idx % 2 === 1;
                        return (
                          <div
                            key={f.label}
                            role="listitem"
                            className={cn(
                              "flex min-h-0 min-w-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 shadow-sm transition hover:border-[#E84A27]/35",
                              isGold
                                ? "border-[#E84A27]/25 bg-[#fffbeb] dark:border-white/30 dark:bg-[#0B1F3A]/65"
                                : "border-[#0B1F3A]/12 bg-card dark:border-white/20 dark:bg-[#0B1F3A]/55",
                            )}
                          >
                            <div
                              className={cn(
                                "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                                isGold
                                  ? "bg-[#0B1F3A] text-[#FF6B45]"
                                  : "bg-[#0B1F3A]/10 text-[#0B1F3A] dark:bg-[#061528] dark:text-[#FF8A66]",
                              )}
                            >
                              <Icon className="h-3 w-3" strokeWidth={2.25} />
                            </div>
                            <div className="min-w-0 flex-1 leading-none">
                              <p
                                className={cn(
                                  "text-[8px] font-bold uppercase tracking-[0.14em]",
                                  isGold
                                    ? "text-[#0B1F3A]/70 dark:text-[#FF8A66]/85"
                                    : "text-[#0B1F3A]/55 dark:text-white/75",
                                )}
                              >
                                {f.label}
                              </p>
                              <p
                                className="mt-0.5 truncate text-[13px] font-semibold leading-tight text-[#0B1F3A] dark:text-white"
                                title={f.value}
                              >
                                {f.value}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  {descriptionBlocks ? (
                    <CourseDescriptionBlocks blocks={descriptionBlocks} className="mt-3" />
                  ) : null}
                  {!descriptionBlocks && aboutParsed.body ? (
                    <div
                      className={cn(
                        "max-w-prose text-[14px] leading-relaxed text-[#475569] dark:text-muted-foreground",
                        aboutParsed.fields.length > 0 && "mt-3 border-t border-[#0B1F3A]/10 pt-3 dark:border-border"
                      )}
                    >
                      <p className="whitespace-pre-wrap text-pretty">
                        {aboutParsed.body.length > 4000
                          ? `${aboutParsed.body.slice(0, 4000)}…`
                          : aboutParsed.body}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {sortedOutlineSections.length > 0 ? (
                <div>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <SectionTitle>Course content</SectionTitle>
                      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                        After you enroll, you can ask the instructor questions on each lesson. Published answers are
                        visible to everyone browsing this course.
                      </p>
                    </div>
                    <p className="text-xs font-medium text-muted-foreground sm:pb-1">
                      {lessons} {lessons === 1 ? "lecture" : "lectures"}
                      {courseTotalMinutes > 0 ? ` · ${formatTotalMinutes(courseTotalMinutes)} total` : null}
                    </p>
                  </div>
                  <div
                    className="mt-4 overflow-hidden rounded-2xl border border-[#0B1F3A]/12 bg-card text-card-foreground shadow-md ring-1 ring-[#0B1F3A]/[0.04] transition-shadow duration-300 hover:shadow-lg dark:border-white/20 dark:ring-[#E84A27]/10 sm:mt-5"
                    role="region"
                    aria-label="Course curriculum"
                  >
                    {sortedOutlineSections.map((sec, secIdx) => {
                      const isOpen = openSectionId === sec.id;
                      const lessonList = sec.lessons?.length ? sortLessonsInSection(sec.lessons) : [];
                      const secMins = sumSectionMinutes(lessonList);
                      const curriculumShare = lessons > 0 ? Math.round((lessonList.length / lessons) * 100) : 0;
                      return (
                        <div
                          key={sec.id}
                          className={cn(
                            "border-b border-[#0B1F3A]/[0.08] last:border-b-0 dark:border-border",
                            isOpen && "bg-muted",
                          )}
                        >
                          <button
                            type="button"
                            id={`section-${sec.id}`}
                            aria-expanded={isOpen}
                            aria-controls={`panel-${sec.id}`}
                            onClick={() => setOpenSectionId((prev) => (prev === sec.id ? null : sec.id))}
                            className="flex w-full flex-col gap-2 bg-transparent px-3 py-3 text-left transition-colors hover:bg-[#0B1F3A]/[0.04] dark:hover:bg-[#0B1F3A]/20 sm:px-4 sm:py-3.5"
                          >
                            <div className="flex w-full items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0B1F3A]/10 text-xs font-bold tabular-nums text-[#0B1F3A] shadow-sm dark:bg-[#E84A27]/15 dark:text-[#FF8A66]">
                                  {secIdx + 1}
                                </span>
                                <div className="min-w-0">
                                  <span className="block text-[15px] font-semibold leading-snug text-[#0B1F3A] dark:text-white">
                                    {polishLessonTitle(sec.title)}
                                  </span>
                                  <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {lessonList.length} {lessonList.length === 1 ? "lecture" : "lectures"}
                                    {secMins > 0 ? ` · ${formatTotalMinutes(secMins)}` : ""}
                                  </span>
                                </div>
                              </div>
                              <ChevronDown
                                className={cn(
                                  "h-5 w-5 shrink-0 text-[#0B1F3A] transition-transform duration-200 dark:text-[#FF8A66]",
                                  isOpen && "rotate-180",
                                )}
                                aria-hidden
                              />
                            </div>
                            <div className="w-full px-0.5 pb-0.5">
                              <div className="h-1 w-full overflow-hidden rounded-full bg-[#0B1F3A]/10 dark:bg-white/10">
                                <div
                                  className="h-full rounded-full bg-[#E84A27] transition-all duration-500"
                                  style={{ width: `${curriculumShare}%` }}
                                />
                              </div>
                            </div>
                          </button>
                          <div
                            id={`panel-${sec.id}`}
                            role="region"
                            aria-labelledby={`section-${sec.id}`}
                            className="grid transition-[grid-template-rows] duration-200 ease-out"
                            style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                          >
                            <div className="min-h-0 overflow-hidden">
                              {lessonList.length > 0 ? (
                                <ul className="space-y-0 border-t border-[#0B1F3A]/[0.06] bg-muted/40 px-2 py-1 dark:border-border sm:px-3">
                                  {lessonList.map((l) => {
                                    const locked = !userHasCourseAccess;
                                    const dur = formatLessonDuration(l.duration_minutes);
                                    const learnHref = `/learn/${encodeURIComponent(course.slug)}?lesson=${encodeURIComponent(l.id)}`;
                                    return (
                                      <li key={l.id}>
                                        {locked ? (
                                          <div
                                            className="flex items-start gap-3 rounded-lg px-2 py-2.5 text-[13px] leading-snug text-gray-600 dark:text-muted-foreground sm:px-3"
                                            title={
                                              !user
                                                ? "Create a free account and enroll to watch this lesson"
                                                : "Enroll in this course to watch this lesson"
                                            }
                                          >
                                            <Lock
                                              className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6B45]"
                                              strokeWidth={2.5}
                                              aria-hidden
                                            />
                                            <span className="min-w-0 flex-1">
                                              <span className="font-medium text-gray-800 dark:text-foreground/90">
                                                {polishLessonTitle(l.title)}
                                              </span>
                                              {dur ? (
                                                <span className="ml-2 text-xs text-gray-400 dark:text-muted-foreground">
                                                  {dur}
                                                </span>
                                              ) : null}
                                              {!user ? (
                                                <span className="mt-0.5 block text-[11px] font-normal text-gray-500 dark:text-muted-foreground">
                                                  Account required to watch — sign in or register above.
                                                </span>
                                              ) : null}
                                            </span>
                                          </div>
                                        ) : (
                                          <Link
                                            href={learnHref}
                                            className="flex items-start gap-3 rounded-lg px-2 py-2.5 text-[13px] leading-snug text-gray-700 transition-colors hover:bg-[#0B1F3A]/[0.06] dark:text-foreground/90 dark:hover:bg-[#0B1F3A]/15 sm:px-3"
                                          >
                                            <Play
                                              className="mt-0.5 h-4 w-4 shrink-0 text-[#0B1F3A] dark:text-[#FF8A66]"
                                              aria-hidden
                                            />
                                            <span className="min-w-0 flex-1 font-medium">
                                              {polishLessonTitle(l.title)}
                                              {dur ? (
                                                <span className="ml-2 text-xs font-normal text-gray-500 dark:text-muted-foreground">
                                                  {dur}
                                                </span>
                                              ) : null}
                                            </span>
                                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#0B1F3A]/40 dark:text-white/65" />
                                          </Link>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              ) : (
                                <p className="border-t border-[#0B1F3A]/[0.06] px-4 py-3 text-sm text-gray-500 dark:border-border dark:text-muted-foreground">
                                  No lessons in this module yet.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-[#0B1F3A]/8 bg-[#f5f8fd]/90 px-4 py-3 text-[13px] font-medium text-[#0B1F3A]/85 dark:border-white/20 dark:bg-muted/45 dark:text-muted-foreground sm:mt-5">
                    <span>{course.section_count ?? sortedOutlineSections.length} sections</span>
                    <span className="text-gray-300 dark:text-[#FF8A66]/35" aria-hidden>
                      ·
                    </span>
                    <span>{lessons} lectures</span>
                    <span className="text-gray-300 dark:text-[#FF8A66]/35" aria-hidden>
                      ·
                    </span>
                    <span>All levels</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <CourseCheckoutAuthModal
        open={checkoutAuthOpen}
        onOpenChange={(o) => {
          setCheckoutAuthOpen(o);
          if (!o) checkoutIntentRef.current = null;
        }}
        onAuthenticated={handleCheckoutAuthSuccess}
        courseTitle={course.title}
        accountRequiredForFree={isFree}
      />

      <CourseMobileCtaBar
        priceLabel={priceLabel || "—"}
        live={live}
        isFree={isFree}
        guest={!user}
        enrollPending={enrollMutation.isPending}
        onBuy={handleBuyNow}
        onCart={handleAddToCart}
        learnHref={userHasCourseAccess ? learnHref : null}
      />
    </>
  );
}
