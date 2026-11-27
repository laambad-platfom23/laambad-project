"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Search, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Stars } from "@/components/learning/star-rating";
import { MyReviewBox, ReviewsPanel } from "@/components/learning/reviews-panel";
import { courseReviewsApi } from "@/services/api/course-extras";
import { coursesApi } from "@/services/api/courses";
import { useAuthStore } from "@/store/auth-store";
import { isAdminUser, isStaffUser } from "@/lib/auth-routing";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { cn } from "@/lib/utils";

export default function ReviewsPage() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Skeleton className="h-64 rounded-xl" />;
  return isStaffUser(user) ? <StaffReviews admin={isAdminUser(user)} /> : <StudentReviews />;
}

/** Students: ONLY the courses they can open — rate each one once, change or delete it later. */
function StudentReviews() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-reviews"],
    queryFn: () => courseReviewsApi.myCourses().then((r) => r.data.data),
  });
  const list = data ?? [];
  const done = list.filter((c) => c.mine).length;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Star className="h-7 w-7 text-amber-500" /> Reviews
        </h1>
        <p className="mt-1 text-muted-foreground">
          Rate the courses you are taking. You can review each of your courses once and change your review any time.
          {list.length ? ` You reviewed ${done} of ${list.length}.` : ""}
        </p>
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : !list.length ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            <MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            When you are enrolled in a course, you can review it here.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {list.map((c) => (
            <li key={c.course.id} className="overflow-hidden rounded-2xl border bg-card">
              <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
                {c.course.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.course.cover_image_url} alt="" className="h-11 w-16 shrink-0 rounded-md object-cover" />
                ) : (
                  <span className="h-11 w-16 shrink-0 rounded-md bg-brand-soft" />
                )}
                <div className="min-w-0 flex-1">
                  <Link href={`/learn/${encodeURIComponent(c.course.slug)}?tab=reviews`} className="block truncate font-semibold hover:underline">
                    {c.course.title}
                  </Link>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Stars value={c.rating.average} size={12} />
                    {c.rating.count ? `${c.rating.average.toFixed(1)} · ${c.rating.count} ${c.rating.count === 1 ? "rating" : "ratings"}` : "No ratings yet"}
                  </span>
                </div>
                {!c.mine ? <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand">Not rated yet</span> : null}
              </div>
              <div className="px-4 py-3">
                <MyReviewBox courseId={c.course.id} mine={c.mine} compact />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Staff: the ratings of the courses they teach (admins: every course; admins can remove a review). */
function StaffReviews({ admin }: { admin: boolean }) {
  const [selected, setSelected] = useState("");
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["reviews-courses", admin],
    queryFn: () => coursesApi.list(1, 100, !admin).then((r) => r.data.data),
  });
  const courses = (data ?? []).filter((c) => !q.trim() || c.title.toLowerCase().includes(q.trim().toLowerCase()));
  const current = selected || courses[0]?.id || "";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Star className="h-7 w-7 text-amber-500" /> Course reviews
        </h1>
        <p className="mt-1 text-muted-foreground">What students say about {admin ? "the courses" : "your courses"}.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a course" className="pl-9" />
          </div>
          {isLoading ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : (
            <ul className="max-h-[70vh] space-y-1 overflow-y-auto rounded-xl border bg-card p-1.5">
              {courses.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(c.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                      current === c.id ? "bg-brand-soft font-semibold text-brand" : "hover:bg-muted"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{decodeHtmlEntities(c.title)}</span>
                    {c.rating?.count ? (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        ★ {c.rating.average.toFixed(1)} ({c.rating.count})
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
              {!courses.length ? <li className="px-3 py-6 text-center text-sm text-muted-foreground">No courses.</li> : null}
            </ul>
          )}
        </div>
        <div>{current ? <ReviewsPanel key={current} courseId={current} canModerate={admin} /> : null}</div>
      </div>
    </div>
  );
}
