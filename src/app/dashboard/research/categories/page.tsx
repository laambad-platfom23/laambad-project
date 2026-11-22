"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { researchApi } from "@/services/api/research";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus, Tag, FolderOpen, Loader2, MoreHorizontal, Pencil, Trash2, Search,
} from "lucide-react";
import { toast } from "sonner";
import type { ResearchCategory } from "@/types";

export default function ResearchCategoriesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [addSheet, setAddSheet] = useState(false);
  const [editSheet, setEditSheet] = useState<ResearchCategory | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<ResearchCategory | null>(null);

  const { data: catsRaw, isLoading } = useQuery({
    queryKey: ["research-categories"],
    queryFn: () => researchApi.listCategories().then((r) => r.data),
  });
  const categories: ResearchCategory[] = Array.isArray(catsRaw)
    ? catsRaw : (catsRaw as { data?: ResearchCategory[] })?.data || [];

  const filtered = search
    ? categories.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.slug.toLowerCase().includes(search.toLowerCase()))
    : categories;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => researchApi.deleteCategory(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["research-categories"] }); toast.success("Category deleted"); setDeleteDialog(null); },
    onError: () => toast.error("Failed to delete category"),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B1F3A] dark:bg-[#E84A27]/20">
            <FolderOpen className="h-5 w-5 text-white dark:text-[#FF8A66]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Research Categories</h1>
            <p className="text-sm text-muted-foreground">Manage categories for organizing research papers</p>
          </div>
        </div>
        <Button size="sm" className="gap-1.5 bg-[#0B1F3A] text-white hover:bg-[#0B1F3A]/90 dark:bg-[#0B1F3A] dark:text-white" onClick={() => setAddSheet(true)}>
          <Plus className="h-4 w-4" /> Add Category
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search categories…" className="h-9 pl-9 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">{categories.length} total</Badge>
        {search && <Badge variant="outline" className="text-xs">{filtered.length} results</Badge>}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border bg-muted/30" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16">
          <FolderOpen className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="font-semibold text-muted-foreground">{search ? "No categories match your search" : "No categories yet"}</p>
          {!search && <Button className="mt-4 gap-1.5" onClick={() => setAddSheet(true)}><Plus className="h-4 w-4" /> Add Category</Button>}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((cat) => (
            <div key={cat.id} className="group rounded-xl border bg-card p-4 transition-all hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0B1F3A]/10 dark:bg-[#E84A27]/10">
                    <Tag className="h-5 w-5 text-[#0B1F3A] dark:text-[#FF8A66]" />
                  </div>
                  <div>
                    <p className="font-medium">{cat.name}</p>
                    <p className="text-xs text-muted-foreground">/{cat.slug}</p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => setEditSheet(cat)}>
                      <Pencil className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDeleteDialog(cat)} className="text-red-600">
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Sheet */}
      <CategoryFormSheet
        open={addSheet}
        onClose={() => setAddSheet(false)}
        category={null}
      />

      {/* Edit Sheet */}
      <CategoryFormSheet
        open={!!editSheet}
        onClose={() => setEditSheet(null)}
        category={editSheet}
      />

      {/* Delete Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(o) => !o && setDeleteDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteDialog?.name}</strong>? This action cannot be undone. Papers using this category will be unlinked.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              className="gap-1.5"
              disabled={deleteMutation.isPending}
              onClick={() => deleteDialog && deleteMutation.mutate(deleteDialog.id)}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Category Form Sheet (Create + Edit) ── */
function CategoryFormSheet({ open, onClose, category }: {
  open: boolean; onClose: () => void; category: ResearchCategory | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!category;
  const [name, setName] = useState(category?.name || "");
  const [slug, setSlug] = useState(category?.slug || "");

  // Reset form when category changes
  const key = category?.id || "new";
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setName(category?.name || "");
    setSlug(category?.slug || "");
  }

  const mutation = useMutation({
    mutationFn: () => {
      const payload: { name: string; slug?: string } = { name: name.trim() };
      if (slug.trim()) payload.slug = slug.trim();
      if (isEdit) {
        return researchApi.updateCategory(category!.id, payload);
      }
      return researchApi.createCategory(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["research-categories"] });
      toast.success(isEdit ? "Category updated!" : "Category created!");
      setName(""); setSlug("");
      onClose();
    },
    onError: () => toast.error(isEdit ? "Failed to update" : "Failed to create"),
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit Category" : "New Category"}</SheetTitle>
          <SheetDescription>{isEdit ? "Update category details." : "Add a new category for organizing papers."}</SheetDescription>
        </SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) { toast.error("Name required"); return; } mutation.mutate(); }} className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label>Name <span className="text-red-500">*</span></Label>
            <Input placeholder="e.g. Machine Learning" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label>Slug <span className="text-xs text-muted-foreground">(optional, auto-generated)</span></Label>
            <Input placeholder="machine-learning" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
          <Separator />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-1.5">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : isEdit ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {isEdit ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
