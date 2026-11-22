"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { coursesApi } from "@/services/api/courses";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { Course } from "@/types";

type Props = {
  course: Course | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after successful delete (e.g. close curriculum modal if same course). */
  onDeleted?: (courseId: string) => void;
};

export function DeleteCourseDialog({ course, open, onOpenChange, onDeleted }: Props) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!course) throw new Error("missing");
      await coursesApi.delete(course.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["course"] });
      toast.success("Course deleted", {
        description: "All modules, lessons, enrollments, and assignments for this course were removed.",
      });
      if (course) onDeleted?.(course.id);
      onOpenChange(false);
    },
    onError: () => toast.error("Could not delete course"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete course?</DialogTitle>
          <DialogDescription>
            This will permanently remove{" "}
            <span className="font-semibold text-foreground">{course?.title ?? "this course"}</span> and all
            related data listed below.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm text-muted-foreground">
          <ul className="list-inside list-disc text-left text-xs">
            <li>All sections and lessons (including videos and attachment links)</li>
            <li>Student enrollments and lesson progress</li>
            <li>Assignments and submissions for this course</li>
          </ul>
          <p className="text-destructive">This action cannot be undone.</p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!course || deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete course
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
