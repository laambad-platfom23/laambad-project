"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { reviewsApi } from "@/services/api/reviews";
import { coursesApi } from "@/services/api/courses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Star,
  MessageSquare,
  Send,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import type {
  CourseReview,
  CourseRatingStats,
  Course,
  PaginatedResponse,
} from "@/types";
import { cn } from "@/lib/utils";

function StarRating({
  value,
  onChange,
  readonly = false,
  size = "md",
}: {
  value: number;
  onChange?: (v: number) => void;
  readonly?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-7 w-7" : "h-5 w-5";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(i)}
          className={cn(
            "transition-transform",
            !readonly && "hover:scale-110 cursor-pointer",
            readonly && "cursor-default"
          )}
        >
          <Star
            className={cn(
              sizeClass,
              i <= value
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/30"
            )}
          />
        </button>
      ))}
    </div>
  );
}

export default function ReviewsPage() {
  const [selectedCourse, setSelectedCourse] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const queryClient = useQueryClient();

  const { data: coursesResp, isLoading: loadingCourses } =
    useQuery<PaginatedResponse<Course>>({
      queryKey: ["all-courses-for-reviews"],
      queryFn: async () => (await coursesApi.list(1, 100)).data,
    });

  const { data: stats } = useQuery<CourseRatingStats>({
    queryKey: ["review-stats", selectedCourse],
    queryFn: async () => (await reviewsApi.stats(selectedCourse)).data,
    enabled: !!selectedCourse,
  });

  const { data: reviewsResp, isLoading: loadingReviews } = useQuery<
    PaginatedResponse<CourseReview>
  >({
    queryKey: ["reviews", selectedCourse],
    queryFn: async () => (await reviewsApi.list(selectedCourse)).data,
    enabled: !!selectedCourse,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      reviewsApi.create(selectedCourse, { rating, comment }),
    onSuccess: () => {
      toast.success("Review submitted!");
      setRating(0);
      setComment("");
      queryClient.invalidateQueries({ queryKey: ["reviews", selectedCourse] });
      queryClient.invalidateQueries({
        queryKey: ["review-stats", selectedCourse],
      });
    },
    onError: (err: any) => {
      const msg =
        err.response?.data?.error?.message || "Failed to submit review";
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (reviewId: string) => reviewsApi.delete(reviewId),
    onSuccess: () => {
      toast.success("Review deleted");
      queryClient.invalidateQueries({ queryKey: ["reviews", selectedCourse] });
      queryClient.invalidateQueries({
        queryKey: ["review-stats", selectedCourse],
      });
    },
    onError: () => toast.error("Failed to delete review"),
  });

  const courses = coursesResp?.data ?? [];
  const reviews = reviewsResp?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Star className="h-7 w-7 text-amber-500" />
          Course Reviews
        </h1>
        <p className="text-muted-foreground mt-1">
          Rate and review courses you have taken.
        </p>
      </div>

      {/* Course Selector */}
      <div className="flex flex-wrap gap-2">
        {loadingCourses ? (
          <Skeleton className="h-9 w-40" />
        ) : (
          courses.map((c) => (
            <Button
              key={c.id}
              variant={selectedCourse === c.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCourse(c.id)}
            >
              {c.title}
            </Button>
          ))
        )}
      </div>

      {!selectedCourse ? (
        <Card className="border-none shadow-sm">
          <CardContent className="py-16 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground mt-3">
              Select a course to view and write reviews.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Stats + Write */}
          <div className="space-y-6">
            {/* Rating Stats */}
            {stats && (
              <Card className="border-none shadow-sm">
                <CardContent className="p-6 text-center space-y-3">
                  <p className="text-5xl font-bold">
                    {stats.average.toFixed(1)}
                  </p>
                  <StarRating
                    value={Math.round(stats.average)}
                    readonly
                    size="lg"
                  />
                  <p className="text-sm text-muted-foreground">
                    {stats.count} review{stats.count !== 1 ? "s" : ""}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Write Review */}
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Write a Review</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Your Rating
                  </p>
                  <StarRating value={rating} onChange={setRating} size="lg" />
                </div>
                <Textarea
                  placeholder="Share your experience with this course..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                />
                <Button
                  className="w-full"
                  disabled={
                    rating === 0 || createMutation.isPending
                  }
                  onClick={() => createMutation.mutate()}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {createMutation.isPending
                    ? "Submitting..."
                    : "Submit Review"}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right: Reviews List */}
          <div className="lg:col-span-2 space-y-4">
            {loadingReviews ? (
              [1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))
            ) : reviews.length === 0 ? (
              <Card className="border-none shadow-sm">
                <CardContent className="py-12 text-center">
                  <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/40" />
                  <p className="text-muted-foreground mt-3">
                    No reviews yet. Be the first!
                  </p>
                </CardContent>
              </Card>
            ) : (
              reviews.map((rev) => (
                <Card
                  key={rev.id}
                  className="border-none shadow-sm hover:shadow-md transition-shadow"
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">
                            {rev.user?.name ?? "Student"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(rev.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StarRating
                          value={rev.rating}
                          readonly
                          size="sm"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteMutation.mutate(rev.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {rev.comment && (
                      <p className="text-sm text-muted-foreground mt-3 pl-13 leading-relaxed">
                        {rev.comment}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
