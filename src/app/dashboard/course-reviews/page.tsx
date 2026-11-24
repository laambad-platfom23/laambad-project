"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, ExternalLink, Loader2, MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { reviewApi, money, type ReviewItem } from "@/services/api/course-features";
import { useAuthStore } from "@/store/auth-store";
import { isAdminUser } from "@/lib/auth-routing";
import { formatDateTime, getApiErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

/** A5 admin: courses instructors submitted for review → approve (publish) or send back with a note. */
export default function CourseReviewsPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [deciding, setDeciding] = useState<{ item: ReviewItem; approve: boolean } | null>(null);
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["course-reviews"],
    queryFn: () => reviewApi.queue().then((r) => r.data),
    enabled: isAdminUser(user),
  });
  const decide = useMutation({
    mutationFn: () => (deciding!.approve ? reviewApi.approve(deciding!.item.id, note || undefined) : reviewApi.reject(deciding!.item.id, note)),
    onSuccess: () => {
      toast.success(deciding!.approve ? "Course approved and published" : "Sent back to the instructor");
      setDeciding(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["course-reviews"] });
      qc.invalidateQueries({ queryKey: ["course-reviews-count"] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not save the decision")),
  });

  if (!isAdminUser(user)) return <p className="py-16 text-center text-muted-foreground">Admins only.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ClipboardCheck className="h-7 w-7 text-primary" /> Course reviews
        </h1>
        <p className="mt-1 text-muted-foreground">Courses instructors submitted. Approve to publish, or send back with what to change.</p>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : !data?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-success" /> Nothing waiting for review.
          </CardContent>
        </Card>
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {data.map((c) => (
            <div key={c.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{c.title}</p>
                <p className="text-xs text-muted-foreground">
                  {c.instructor.name} · {c.sections} sections · {c.lessons} lessons · {c.price === null ? "no price" : c.price === 0 ? "Free" : money(c.price * 100)}
                  {c.submitted_at ? ` · submitted ${formatDateTime(c.submitted_at)}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/dashboard/courses/${c.id}/builder`}>
                    <ExternalLink className="h-4 w-4" /> Open
                  </Link>
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDeciding({ item: c, approve: false })}>
                  <MessageSquareWarning className="h-4 w-4" /> Request changes
                </Button>
                <Button size="sm" onClick={() => setDeciding({ item: c, approve: true })}>
                  <CheckCircle2 className="h-4 w-4" /> Approve
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!deciding} onOpenChange={(o) => !o && setDeciding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deciding?.approve ? "Approve and publish" : "Request changes"}</DialogTitle>
            <DialogDescription>{deciding?.item.title}</DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={deciding?.approve ? "Optional note for the instructor" : "What should the instructor change? (required)"}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
            <Button onClick={() => decide.mutate()} disabled={decide.isPending || (!deciding?.approve && !note.trim())}>
              {decide.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {deciding?.approve ? "Approve" : "Send back"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
