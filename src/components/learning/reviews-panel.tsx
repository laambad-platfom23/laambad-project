"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquareQuote, Pencil, Send, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Stars, StarInput } from "@/components/learning/star-rating";
import { courseReviewsApi, type MyReview, type ReviewSummary } from "@/services/api/course-extras";
import { formatDateTime, getApiErrorMessage, getInitials, timeAgo } from "@/lib/utils";

/**
 * Learn page → Reviews: the rating summary (average + 5…1 bars), my review, and the students' reviews.
 * `canModerate` (admins): a remove button on every review.
 */
export function ReviewsPanel({ courseId, canModerate }: { courseId: string; canModerate?: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["course-reviews", courseId],
    queryFn: () => courseReviewsApi.summary(courseId).then((r) => r.data),
  });
  const moderate = async (id: string, name: string) => {
    if (!window.confirm(`Remove the review by ${name}?`)) return;
    try {
      await courseReviewsApi.remove(id);
      toast.success("Review removed");
      qc.invalidateQueries({ queryKey: ["course-reviews", courseId] });
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not remove the review"));
    }
  };
  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-4">
      <h3 className="text-base font-bold">Student Ratings &amp; Reviews</h3>
      <RatingSummary s={data} />
      {data.can_review ? <MyReviewBox courseId={courseId} mine={data.mine} /> : null}
      {data.reviews.length ? (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {data.reviews.map((r) => (
            <li key={r.id} className="flex gap-4 px-5 py-5 even:bg-muted/30">
              <div className="w-32 shrink-0 sm:w-40">
                <Avatar className="h-10 w-10">
                  {r.user.avatar_url ? <AvatarImage src={r.user.avatar_url} alt="" /> : null}
                  <AvatarFallback className="bg-[#0B1F3A] text-sm font-semibold text-white">{getInitials(r.user.name)}</AvatarFallback>
                </Avatar>
                <p className="mt-2 break-words text-sm font-medium leading-snug">{r.user.name}</p>
                {r.created_at ? (
                  <p className="text-xs text-muted-foreground" title={formatDateTime(r.created_at)}>
                    {timeAgo(r.created_at)}
                  </p>
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <Stars value={r.rating} size={15} />
                  {canModerate ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => moderate(r.id, r.user.name)}
                      aria-label="Remove review"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
                {r.comment ? <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{r.comment}</p> : null}
                {r.mine ? <p className="mt-1 text-xs font-semibold text-brand">Your review</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
          No reviews yet{data.can_review ? " — be the first to rate this course." : "."}
        </p>
      )}
    </div>
  );
}

export function RatingSummary({ s }: { s: Pick<ReviewSummary, "average" | "count" | "distribution"> }) {
  return (
    <div className="grid gap-6 rounded-2xl border bg-card p-5 sm:grid-cols-[160px_1fr] sm:p-6">
      <div className="text-center">
        <p className="text-5xl font-extrabold tabular-nums leading-none">{s.average.toFixed(1)}</p>
        <Stars value={s.average} size={20} className="mt-2" />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Total {s.count} {s.count === 1 ? "Rating" : "Ratings"}
        </p>
      </div>
      <ul className="space-y-2 self-center">
        {s.distribution.map((d) => {
          const pct = s.count ? (d.count / s.count) * 100 : 0;
          return (
            <li key={d.stars} className="flex items-center gap-3 text-sm">
              <span className="inline-flex w-8 shrink-0 items-center gap-1 tabular-nums">
                <Star className="h-4 w-4 text-amber-500" strokeWidth={1.8} /> {d.stars}
              </span>
              <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
              </span>
              <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">
                {d.count} {d.count === 1 ? "Rating" : "Ratings"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Write / change / delete MY review of a course (one per course). */
export function MyReviewBox({ courseId, mine, compact }: { courseId: string; mine: MyReview | null; compact?: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(!mine);
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["course-reviews", courseId] });
    qc.invalidateQueries({ queryKey: ["my-reviews"] });
  };
  const save = async () => {
    if (!rating) {
      toast.error("Choose 1 to 5 stars.");
      return;
    }
    setBusy(true);
    try {
      await courseReviewsApi.save(courseId, { rating, comment: comment.trim() });
      toast.success(mine ? "Your review was updated" : "Thank you for your review!");
      setEditing(false);
      refresh();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not save your review"));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!mine || !window.confirm("Delete your review?")) return;
    setBusy(true);
    try {
      await courseReviewsApi.remove(mine.id);
      toast.success("Your review was deleted");
      setRating(0);
      setComment("");
      setEditing(true);
      refresh();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not delete your review"));
    } finally {
      setBusy(false);
    }
  };

  if (mine && !editing) {
    return (
      <div className={compact ? "space-y-1.5" : "space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4"}>
        <div className="flex flex-wrap items-center gap-2">
          {!compact ? <p className="text-sm font-semibold">Your review</p> : null}
          <Stars value={mine.rating} size={16} />
          {!mine.approved ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Waiting for approval</span> : null}
          <span className="ml-auto flex items-center gap-0.5">
            <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" disabled={busy} onClick={remove} aria-label="Delete review">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </span>
        </div>
        {mine.comment ? <p className="whitespace-pre-wrap text-sm text-foreground/85">{mine.comment}</p> : null}
      </div>
    );
  }
  return (
    <div className={compact ? "space-y-2" : "space-y-3 rounded-2xl border bg-card p-4 shadow-sm"}>
      {!compact ? (
        <p className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquareQuote className="h-4 w-4 text-brand" /> {mine ? "Edit your review" : "Rate this course"}
        </p>
      ) : null}
      <StarInput value={rating} onChange={setRating} size={compact ? 24 : 28} disabled={busy} />
      <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What did you like? What could be better? (optional)" maxLength={5000} />
      <div className="flex justify-end gap-2">
        {mine ? (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setEditing(false); setRating(mine.rating); setComment(mine.comment ?? ""); }}>
            Cancel
          </Button>
        ) : null}
        <Button type="button" size="sm" onClick={save} disabled={busy || !rating} className="bg-brand text-white hover:bg-brand-hover">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {mine ? "Save review" : "Submit review"}
        </Button>
      </div>
    </div>
  );
}
