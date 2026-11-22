"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Plus, Search, BookOpen } from "lucide-react";
import { useStaffOnlyPage } from "@/hooks/use-staff-only";
import { useAuthStore } from "@/store/auth-store";
import { isAdminUser } from "@/lib/auth-routing";
import { cn, getApiErrorMessage } from "@/lib/utils";
import { coursesApi, type CourseStatusValue } from "@/services/api/courses";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateCourseWizard } from "@/components/dashboard/create-course-wizard";
import { CoursePricingDialog } from "@/components/dashboard/course-pricing-dialog";
import { CourseManageList } from "@/components/dashboard/course-manage-list";
import type { Course } from "@/types";

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "pending", label: "Pending" },
  { value: "draft", label: "Draft" },
  { value: "private", label: "Private" },
  { value: "suspended", label: "Suspended" },
];

const STATUS_DONE: Record<string, string> = {
  published: "Course published",
  pending: "Submitted for review",
  draft: "Moved to draft",
  private: "Course is now private",
  suspended: "Course suspended — hidden from the catalog (nothing deleted)",
};

export default function CoursesPage() {
  const { ready } = useStaffOnlyPage();
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminUser(user);
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState(""); // debounced
  const [status, setStatus] = useState("all");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pricingCourse, setPricingCourse] = useState<Course | null>(null);
  const pageSize = 20;

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Admins manage every course; instructors only their own (as in Tutor LMS).
  const mine = !isAdmin;
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["courses", "manage", { page, pageSize, q, status, mine }],
    queryFn: () => coursesApi.list(page, pageSize, mine, { q, status }).then((r) => r.data),
    enabled: ready,
    placeholderData: keepPreviousData,
  });

  const statusMut = useMutation({
    mutationFn: ({ course, status: s }: { course: Course; status: CourseStatusValue }) =>
      coursesApi.setStatus(course.id, s),
    onSuccess: (_r, v) => {
      toast.success(STATUS_DONE[v.status] ?? "Status updated");
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not change the status")),
  });

  const courses = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (!ready) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
            {isAdmin ? "Courses" : "My courses"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? "Every course on the platform. Change the status from the pill; open a course to edit it in the Course Builder."
              : "Your courses. Open one to edit it step by step in the Course Builder, then submit it for review."}
          </p>
        </div>
        <Button
          size="lg"
          className="shrink-0 gap-2 bg-brand font-semibold text-brand-foreground hover:bg-brand-hover"
          onClick={() => setWizardOpen(true)}
        >
          <Plus className="h-5 w-5" /> New course
        </Button>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex max-w-full gap-1 self-start overflow-x-auto rounded-xl border border-border bg-card p-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => {
                setStatus(t.value);
                setPage(1);
              }}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold transition",
                status === t.value ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative w-full xl:max-w-sm">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={isAdmin ? "Search by course or instructor…" : "Search your courses…"}
            className="h-10 rounded-xl pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          <b className="text-foreground">{total.toLocaleString()}</b> {total === 1 ? "course" : "courses"}
        </span>
        {isFetching && !isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      </div>

      {isLoading ? (
        <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
          <p className="font-medium">Could not load courses</p>
          <p className="mt-1 text-muted-foreground">{(error as Error)?.message || "Check your connection and try again."}</p>
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">No courses found.</p>
        </div>
      ) : (
        <CourseManageList
          courses={courses}
          isAdmin={isAdmin}
          currentUserId={user?.id}
          busyId={statusMut.isPending ? statusMut.variables?.course.id : null}
          onStatus={(course, s) => {
            if (s === "suspended" && !globalThis.confirm(`Suspend "${course.title}"? It will be hidden from the catalog. You can restore it any time.`)) return;
            statusMut.mutate({ course, status: s });
          }}
          onPricing={(c) => setPricingCourse(c)}
        />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <CreateCourseWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      <CoursePricingDialog
        courseId={pricingCourse?.id ?? null}
        courseTitle={pricingCourse?.title}
        open={pricingCourse !== null}
        onOpenChange={(open) => {
          if (!open) setPricingCourse(null);
        }}
      />
    </div>
  );
}
