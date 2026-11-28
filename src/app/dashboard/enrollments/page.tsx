"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { dashboardApi } from "@/services/api/dashboard";
import { enrollmentsApi } from "@/services/api/enrollments";
import { paymentsApi } from "@/services/api/payments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CheckCircle2, GraduationCap, Loader2, MoreHorizontal, RotateCcw, Trash2, Ban } from "lucide-react";
import { formatDate, getApiErrorMessage } from "@/lib/utils";
import type { AdminEnrollmentRow, EnrolledCourseDTO } from "@/types";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { OrdersTable } from "@/components/dashboard/orders-table";
import { isAdminUser } from "@/lib/auth-routing";
import { enrollmentStatusClass, enrollmentStatusLabel, paymentMethodLabel } from "@/lib/payment-labels";

function paymentBadgeClass(status: string | undefined) {
  switch (status) {
    case "paid":
      return "bg-success-soft text-success";
    case "pending":
      return "bg-warning-soft text-warning";
    case "failed":
      return "bg-destructive/10 text-destructive";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function paymentLabel(status: string | undefined) {
  switch (status) {
    case "paid":
      return "Access active";
    case "pending":
      return "Awaiting verification";
    case "failed":
      return "Payment failed";
    default:
      return status ?? "—";
  }
}

function formatMinor(amount: number | undefined, currency: string | undefined) {
  if (amount == null || currency == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase() || "USD",
  }).format(amount / 100);
}



function paymentRowStatusLabel(s: string | undefined) {
  if (!s) return null;
  if (s === "pending") return "Payment record: pending";
  if (s === "success" || s === "paid") return "Payment record: paid";
  return `Payment record: ${s}`;
}

function canApproveOfflineEnrollment(row: AdminEnrollmentRow) {
  const st = (row.enrollment_status || "").toLowerCase();
  if (st === "canceled" || st === "cancelled") return false;
  return (
    row.payment_status === "pending" &&
    (row.payment_method || "").toLowerCase() === "offline" &&
    (row.payment_row_status || "").toLowerCase() === "pending"
  );
}

/** A11 (Phase 2): admins see course enrollments and book enrollments (book orders) side by side. */
export default function EnrollmentsPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<"courses" | "books">("courses");
  if (!isAdminUser(user)) return <CourseEnrollments />;
  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-lg border p-1">
        {(["courses", "books"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition",
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "courses" ? "Course enrollments" : "Book enrollments"}
          </button>
        ))}
      </div>
      {tab === "courses" ? (
        <CourseEnrollments />
      ) : (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Book enrollments</h1>
            <p className="text-muted-foreground">
              Students who bought a book (Completed), who wait for approval (Pending) or were rejected — approve, reject or give a coupon like a course order.
            </p>
          </div>
          <OrdersTable defaultStatus="completed" fixedType="book" />
        </div>
      )}
    </div>
  );
}

function CourseEnrollments() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminUser(user);
  const queryClient = useQueryClient();
  const [approveRow, setApproveRow] = useState<AdminEnrollmentRow | null>(null);
  const [confirmCancelRow, setConfirmCancelRow] = useState<AdminEnrollmentRow | null>(null);
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<AdminEnrollmentRow | null>(null);

  const approveOffline = useMutation({
    mutationFn: (payload: { enrollmentId: string; mode: "offline_paid" | "grant_free" }) =>
      paymentsApi
        .approveOfflineAdmin(payload.enrollmentId, { mode: payload.mode })
        .then((r) => r.data),
    onSuccess: (_, variables) => {
      toast.success(
        variables.mode === "grant_free"
          ? "Free access granted — recorded in payment history."
          : "Payment verified — access activated."
      );
      setApproveRow(null);
      queryClient.invalidateQueries({ queryKey: ["admin-enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (err: unknown) => {
      toast.error(getApiErrorMessage(err, "Could not approve"));
    },
  });

  const cancelEnrollment = useMutation({
    mutationFn: (enrollmentId: string) => enrollmentsApi.adminCancel(enrollmentId).then((r) => r.data),
    onSuccess: () => {
      toast.success("Enrollment canceled. Pending payments were voided.");
      setConfirmCancelRow(null);
      queryClient.invalidateQueries({ queryKey: ["admin-enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, "Could not cancel")),
  });

  const deleteEnrollment = useMutation({
    mutationFn: (enrollmentId: string) => enrollmentsApi.adminDelete(enrollmentId).then((r) => r.data),
    onSuccess: () => {
      toast.success("Enrollment removed. Payment history is kept for records.");
      setConfirmDeleteRow(null);
      queryClient.invalidateQueries({ queryKey: ["admin-enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, "Could not delete")),
  });

  const reactivateEnrollment = useMutation({
    mutationFn: (enrollmentId: string) => enrollmentsApi.adminReactivate(enrollmentId).then((r) => r.data),
    onSuccess: () => {
      toast.success("Enrollment reactivated.");
      queryClient.invalidateQueries({ queryKey: ["admin-enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, "Could not reactivate")),
  });

  const studentUserId = user?.id ?? "";
  const studentQuery = useQuery({
    queryKey: ["dashboard-overview", "enrollments", studentUserId],
    queryFn: () => dashboardApi.overview().then((r) => r.data),
    enabled: !!user && !isAdmin && !!studentUserId,
  });

  const ADMIN_PAGE_SIZE = 50;
  const [adminPage, setAdminPage] = useState(1);
  const adminQuery = useQuery({
    queryKey: ["admin-enrollments", adminPage],
    queryFn: () => enrollmentsApi.listAdmin(adminPage, ADMIN_PAGE_SIZE).then((r) => r.data),
    enabled: !!user && isAdmin,
  });

  const isLoading = isAdmin ? adminQuery.isLoading : studentQuery.isLoading;
  const courses: EnrolledCourseDTO[] = studentQuery.data?.courses ?? [];
  const adminRows: AdminEnrollmentRow[] = adminQuery.data?.data ?? [];
  const adminTotal = adminQuery.data?.total ?? 0;
  const adminPages = Math.max(1, Math.ceil(adminTotal / ADMIN_PAGE_SIZE));

  return (
    <>
      <Dialog open={!!approveRow} onOpenChange={(open) => !open && setApproveRow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Activate access</DialogTitle>
            <DialogDescription>
              This student requested offline payment for{" "}
              <span className="font-medium text-foreground">{approveRow?.course_title}</span>. Choose how to complete
              the request — both options grant course access and add a row to their{" "}
              <span className="font-medium">Payment history</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Payment verified</span> — use when the transfer or receipt is
              confirmed (full price).
            </p>
            <p>
              <span className="font-medium text-foreground">Grant free access</span> — waive the fee; we record a $0.00
              waiver so the transaction still appears in history.
            </p>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              className="w-full gap-2"
              disabled={approveOffline.isPending}
              onClick={() =>
                approveRow &&
                approveOffline.mutate({ enrollmentId: approveRow.enrollment_id, mode: "offline_paid" })
              }
            >
              {approveOffline.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Payment verified (offline)
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={approveOffline.isPending}
              onClick={() =>
                approveRow &&
                approveOffline.mutate({ enrollmentId: approveRow.enrollment_id, mode: "grant_free" })
              }
            >
              Grant free access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmCancelRow} onOpenChange={(open) => !open && setConfirmCancelRow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel enrollment?</DialogTitle>
            <DialogDescription>
              {confirmCancelRow?.user_name} will lose access to <strong>{confirmCancelRow?.course_title}</strong>. Any{" "}
              <strong>pending</strong> payment will be marked failed. Completed payments stay in history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setConfirmCancelRow(null)}>
              Back
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={cancelEnrollment.isPending}
              onClick={() =>
                confirmCancelRow && cancelEnrollment.mutate(confirmCancelRow.enrollment_id)
              }
            >
              {cancelEnrollment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Cancel enrollment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDeleteRow} onOpenChange={(open) => !open && setConfirmDeleteRow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete enrollment permanently?</DialogTitle>
            <DialogDescription>
              This removes the enrollment and progress for <strong>{confirmDeleteRow?.user_name}</strong> on{" "}
              <strong>{confirmDeleteRow?.course_title}</strong>. The student can enroll again later.{" "}
              <strong>Payment records are not deleted.</strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setConfirmDeleteRow(null)}>
              Back
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteEnrollment.isPending}
              onClick={() =>
                confirmDeleteRow && deleteEnrollment.mutate(confirmDeleteRow.enrollment_id)
              }
            >
              {deleteEnrollment.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Enrollments</h1>
        {isAdmin ? (
          <p className="text-muted-foreground">
            All student enrollments across the institute. <strong>Payment status</strong> controls lesson access;{" "}
            <strong>Method</strong> comes from the latest payment record. For offline (manual) transfers still pending,
            Use the <strong>⋮</strong> menu to approve offline payment, cancel, reactivate, or delete. Cancel voids pending
            payments; delete removes the enrollment but keeps payment records.
          </p>
        ) : (
          <p className="text-muted-foreground">
            Your enrolled courses, lesson progress, and payment access status. For transaction history, open{" "}
            <a href="/dashboard/payments" className="text-primary underline underline-offset-2">
              Payments
            </a>
            .
          </p>
        )}
      </div>

      {!user ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : isLoading ? (
        isAdmin ? (
          <Skeleton className="h-96 w-full rounded-xl" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        )
      ) : isAdmin ? (
        adminRows.length === 0 ? (
          <div className="text-center py-20">
            <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No enrollments yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              When students enroll or start an offline checkout, they will appear here with status and payment method.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Enrollment</TableHead>
                  <TableHead>Access (payment)</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Enrolled</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminRows.map((row) => (
                  <TableRow key={row.enrollment_id}>
                    <TableCell>
                      <div className="font-medium">{row.user_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{row.user_email}</div>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <div className="truncate font-medium" title={row.course_title}>
                        {row.course_title}
                      </div>
                      {row.instructor_name ? (
                        <div className="text-xs text-muted-foreground truncate">{row.instructor_name}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn("border-0 font-semibold", enrollmentStatusClass(row.enrollment_status))}>
                        {enrollmentStatusLabel(row.enrollment_status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        <span
                          className={cn(
                            "inline-block whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md",
                            paymentBadgeClass(row.payment_status)
                          )}
                        >
                          {paymentLabel(row.payment_status)}
                        </span>
                        {row.payment_row_status ? (
                          <span className="text-[10px] text-muted-foreground">
                            {paymentRowStatusLabel(row.payment_row_status)}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{paymentMethodLabel(row.payment_method)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatMinor(row.amount_minor, row.currency)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(row.enrolled_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Enrollment actions"
                            disabled={
                              approveOffline.isPending ||
                              cancelEnrollment.isPending ||
                              deleteEnrollment.isPending ||
                              reactivateEnrollment.isPending
                            }
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {canApproveOfflineEnrollment(row) ? (
                            <DropdownMenuItem onClick={() => setApproveRow(row)}>
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Approve payment…
                            </DropdownMenuItem>
                          ) : null}
                          {(row.enrollment_status || "").toLowerCase() !== "canceled" ? (
                            <DropdownMenuItem onClick={() => setConfirmCancelRow(row)}>
                              <Ban className="mr-2 h-4 w-4" />
                              Cancel enrollment
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => reactivateEnrollment.mutate(row.enrollment_id)}
                            >
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Reactivate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setConfirmDeleteRow(row)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete enrollment
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
              <span>
                {adminTotal.toLocaleString()} enrollments · page {adminPage} of {adminPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={adminPage <= 1 || adminQuery.isFetching}
                  onClick={() => setAdminPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={adminPage >= adminPages || adminQuery.isFetching}
                  onClick={() => setAdminPage((p) => Math.min(adminPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )
      ) : courses.length === 0 ? (
        <div className="text-center py-20">
          <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">No enrollments yet</p>
          <p className="text-sm text-muted-foreground mt-1">Enroll from the catalog to see courses here.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {courses.map((row) => {
            const progress = Math.round(row.completion_percent ?? 0);
            const done = progress >= 100 || row.status === "completed";
            return (
              <Card key={row.course_id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-snug">{row.course_title}</CardTitle>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant={done ? "success" : "secondary"}>
                        {done ? "Completed" : "In progress"}
                      </Badge>
                      <span
                        className={cn(
                          "inline-block whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md",
                          paymentBadgeClass(row.payment_status)
                        )}
                      >
                        {paymentLabel(row.payment_status)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                  <p className="text-xs text-muted-foreground">Enrolled on {formatDate(row.enrolled_at)}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
    </>
  );
}
