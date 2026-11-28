"use client";

/** A12 (Phase 2 test): pieces of the book pages — the cover and the reviews (rating + list + my review). */
import { useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Loader2, MessageSquareQuote, Pencil, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Stars, StarInput } from "@/components/learning/star-rating";
import { RatingSummary, ReviewItem } from "@/components/learning/reviews-panel";
import { booksApi, type MyBookReview } from "@/services/api/student-features";
import { cn, getApiErrorMessage } from "@/lib/utils";

export function BookCover({ url, className, iconClass }: { url?: string | null; className?: string; iconClass?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={cn("object-cover", className)} draggable={false} />
  ) : (
    <div className={cn("flex items-center justify-center bg-gradient-to-br from-muted to-muted/40", className)}>
      <BookOpen className={cn("h-12 w-12 text-muted-foreground/40", iconClass)} aria-hidden />
    </div>
  );
}

export function formatBookPrice(b: { is_free: boolean; price: number; currency: string }) {
  if (b.is_free) return "Free";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: b.currency || "USD" }).format(b.price / 100);
}

/** ★ 4.6 (13 reviews) */
export function RatingLine({ rating, size = 16, className }: { rating?: { average: number; count: number }; size?: number; className?: string }) {
  if (!rating?.count) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Stars value={rating.average} size={size} />
      <span className="font-semibold tabular-nums">{rating.average.toFixed(1)}</span>
      <span className="text-muted-foreground">
        ({rating.count} review{rating.count === 1 ? "" : "s"})
      </span>
    </span>
  );
}

/** Reviews of a book: summary, my review (readers only), the list (10 at a time). */
export function BookReviews({ bookId, signedIn }: { bookId: string; signedIn: boolean }) {
  const list = useInfiniteQuery({
    queryKey: ["book-reviews", bookId],
    queryFn: ({ pageParam }) => booksApi.reviews(bookId, pageParam).then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
  });
  const mine = useQuery({
    queryKey: ["book-review-mine", bookId],
    queryFn: () => booksApi.myReview(bookId).then((r) => r.data),
    enabled: signedIn,
    retry: false,
  });
  const first = list.data?.pages[0];
  const rows = list.data?.pages.flatMap((p) => p.reviews) ?? [];
  if (list.isLoading) return <p className="py-6 text-sm text-muted-foreground">Loading reviews…</p>;
  if (!first) return null;
  return (
    <div className="space-y-4">
      <RatingSummary s={first} />
      {mine.data?.can_review ? <MyBookReview bookId={bookId} mine={mine.data.mine} /> : null}
      {rows.length ? (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {rows.map((r) => (
            <ReviewItem key={r.id} r={r} />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed bg-card px-6 py-8 text-center text-sm text-muted-foreground">
          No reviews yet{mine.data?.can_review ? " — be the first to rate this book." : "."}
        </p>
      )}
      {list.hasNextPage ? (
        <div className="text-center">
          <Button variant="outline" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
            {list.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Show more reviews
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function MyBookReview({ bookId, mine }: { bookId: string; mine: MyBookReview | null }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(!mine);
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["book-reviews", bookId] });
    qc.invalidateQueries({ queryKey: ["book-review-mine", bookId] });
    qc.invalidateQueries({ queryKey: ["book"] });
  };
  const save = async () => {
    if (!rating) return toast.error("Choose 1 to 5 stars.");
    setBusy(true);
    try {
      await booksApi.saveReview(bookId, { rating, comment: comment.trim() });
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
      await booksApi.deleteReview(mine.id);
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
      <div className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">Your review</p>
          <Stars value={mine.rating} size={16} />
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
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquareQuote className="h-4 w-4 text-brand" /> {mine ? "Edit your review" : "Rate this book"}
      </p>
      <StarInput value={rating} onChange={setRating} disabled={busy} />
      <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What did you like? What could be better? (optional)" maxLength={5000} />
      <div className="flex justify-end gap-2">
        {mine ? (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>
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
