"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStaffOnlyPage } from "@/hooks/use-staff-only";
import Link from "next/link";
import { courseCategoriesApi } from "@/services/api/course-categories";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import type { CourseCategory } from "@/types";
import { categorySlugFromName } from "@/lib/utils";

export default function CourseCategoriesPage() {
  const { ready } = useStaffOnlyPage();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<CourseCategory | null>(null);

  const { data: categories, isLoading } = useQuery({
    queryKey: ["course-categories"],
    queryFn: () => courseCategoriesApi.list().then((r) => r.data),
    enabled: ready,
  });

  const rows = categories ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["course-categories"] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => courseCategoriesApi.delete(id),
    onSuccess: () => {
      invalidate();
      toast.success("Category removed");
    },
    onError: () => toast.error("Could not delete category"),
  });

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Course categories</h1>
          <p className="text-muted-foreground">
            Subjects shown when creating or editing a course.{" "}
            <Link href="/dashboard/courses" className="font-medium text-primary underline-offset-4 hover:underline">
              Back to courses
            </Link>
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add category
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Tags className="h-5 w-5" />
            Catalog subjects
          </CardTitle>
          <CardDescription>Names appear in the course wizard. The URL slug is generated from the name.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">
              <Tags className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p>No categories yet. Add one to classify new courses.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Slug</th>
                    <th className="w-[120px] px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.slug}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Edit"
                            onClick={() => setEditRow(c)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            aria-label="Delete"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (!confirm(`Delete “${c.name}”? Courses using it will lose this label.`)) return;
                              deleteMutation.mutate(c.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <CategoryFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onSaved={() => {
          invalidate();
          setCreateOpen(false);
        }}
      />
      <CategoryFormDialog
        open={Boolean(editRow)}
        onOpenChange={(o) => !o && setEditRow(null)}
        mode="edit"
        initial={editRow}
        onSaved={() => {
          invalidate();
          setEditRow(null);
        }}
      />
    </div>
  );
}

function CategoryFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial?: CourseCategory | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setName(initial.name);
    } else if (mode === "create") {
      setName("");
    }
  }, [open, mode, initial]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      const slug = categorySlugFromName(trimmed);
      if (mode === "create") {
        await courseCategoriesApi.create({
          name: trimmed,
          slug,
          sort_order: 0,
        });
      } else {
        if (!initial) throw new Error("missing");
        await courseCategoriesApi.update(initial.id, {
          name: trimmed,
          slug,
        });
      }
    },
    onSuccess: () => {
      toast.success(mode === "create" ? "Category created" : "Category updated");
      onSaved();
      onOpenChange(false);
    },
    onError: () => toast.error(mode === "create" ? "Could not create" : "Could not update"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required");
      return;
    }
    if (!categorySlugFromName(trimmed)) {
      toast.error("Use letters or numbers in the name so a slug can be generated");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Add category" : "Edit category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Graphic Design"
                required
              />
              <p className="text-xs text-muted-foreground">
                Slug:{" "}
                <span className="font-mono text-foreground/80">
                  {name.trim() ? categorySlugFromName(name) || "—" : "—"}
                </span>
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
