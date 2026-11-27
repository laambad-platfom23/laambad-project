"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { coursesApi } from "@/services/api/courses";
import { courseCategoriesApi } from "@/services/api/course-categories";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Layers, Plus } from "lucide-react";
import { cn, getApiErrorMessage, slugFromTitle } from "@/lib/utils";
import { CourseCoverField } from "@/components/dashboard/course-cover-field";
import { Skeleton } from "@/components/ui/skeleton";

const SUBJECT_NONE = "none";
const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
const LANGUAGES = ["English", "Somali", "Arabic", "Other"] as const;

/** Wizard level → the course's level field (the Course Builder uses the same values). */
const LEVEL_VALUE: Record<string, string> = { Beginner: "beginner", Intermediate: "intermediate", Advanced: "expert" };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateCourseWizard({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [tab, setTab] = useState("general");

  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ["course-categories"],
    queryFn: () => courseCategoriesApi.list().then((r) => r.data),
    enabled: open,
  });

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");

  const [categoryId, setCategoryId] = useState<string>(SUBJECT_NONE);
  const [level, setLevel] = useState<string>(LEVELS[1]);
  const [estHours, setEstHours] = useState("");
  const [language, setLanguage] = useState<string>(LANGUAGES[0]);
  const [coverUrl, setCoverUrl] = useState("");
  const [published, setPublished] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  /** When false, slug tracks title; set true if the user edits the slug field. */
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const addCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data } = await courseCategoriesApi.create({ name });
      return data;
    },
    onSuccess: (newCat) => {
      queryClient.invalidateQueries({ queryKey: ["course-categories"] });
      setCategoryId(newCat.id);
      setNewCategoryName("");
      setShowAddCategory(false);
      toast.success(`Category "${newCat.name}" created`);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || "Failed to create category");
    },
  });

  const handleAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name) {
      toast.error("Enter a category name");
      return;
    }
    addCategoryMutation.mutate(name);
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!slugManuallyEdited) {
      setSlug(slugFromTitle(value));
    }
  };

  const handleSlugChange = (value: string) => {
    setSlug(value);
    if (value.trim() === "") {
      setSlugManuallyEdited(false);
    } else {
      setSlugManuallyEdited(true);
    }
  };

  const reset = useCallback(() => {
    setTab("general");
    setTitle("");
    setSlug("");
    setSummary("");
    setDescription("");
    setCategoryId(SUBJECT_NONE);
    setLevel(LEVELS[1]);
    setEstHours("");
    setLanguage(LANGUAGES[0]);
    setCoverUrl("");
    setPublished(false);
    setSlugManuallyEdited(false);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const categoryDefaultApplied = useRef(false);
  useEffect(() => {
    if (!open) categoryDefaultApplied.current = false;
  }, [open]);
  useEffect(() => {
    if (!open || categories.length === 0 || categoryDefaultApplied.current) return;
    setCategoryId(categories[0].id);
    categoryDefaultApplied.current = true;
  }, [open, categories]);


  const createMutation = useMutation({
    mutationFn: async () => {
      // A8: summary, level and cover go to the course's own fields (the Course Builder shows and edits
      // them); before, they were written into the description text and looked lost in the builder.
      const details = [
        language && language !== "Other" ? `Language: ${language}` : "",
        estHours.trim() ? `Estimated time: ${estHours.trim()} hours` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const payload = {
        title: title.trim(),
        ...(slug.trim() ? { slug: slug.trim() } : {}),
        description: [description.trim(), details].filter(Boolean).join("\n\n"),
        excerpt: summary.trim() || null,
        level: LEVEL_VALUE[level] ?? null,
        cover_url: coverUrl.trim() || null,
        ...(categoryId !== SUBJECT_NONE ? { category_id: categoryId } : {}),
      };
      const { data: course } = await coursesApi.create(payload);
      let publishedOk = false;
      let publishSkippedReason = "";
      if (published) {
        try {
          await coursesApi.publish(course.id);
          publishedOk = true;
        } catch (e: unknown) {
          publishSkippedReason = getApiErrorMessage(
            e,
            "Add curriculum (sections + lessons) and pricing, then publish from Edit.",
          );
        }
      }
      return { course, publishedOk, publishSkippedReason, wantedPublish: published };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      if (result.wantedPublish && !result.publishedOk) {
        toast.success("Course created as draft", {
          description:
            result.publishSkippedReason ||
            "Publishing needs at least one section, one lesson, and active pricing. Use Manage curriculum, then Edit → Publish.",
        });
      } else if (result.publishedOk) {
        toast.success("Course created and published");
      } else {
        toast.success("Course created", { description: "Continue in the Course Builder: curriculum and details." });
      }
      onOpenChange(false);
      reset();
      // continue step by step in the Course Builder (Tutor-style)
      router.push(`/dashboard/courses/${result.course.id}/builder?step=curriculum`);
    },
    onError: (e: unknown) => {
      const err = e as {
        response?: {
          status?: number;
          data?: { message?: string; error?: { code?: string; message?: string } };
        };
      };
      const status = err.response?.status;
      const apiMsg =
        err.response?.data?.error?.message ||
        err.response?.data?.message;
      if (status === 403) {
        toast.error("Not allowed to create courses", {
          description:
            apiMsg ||
            "Sign out and sign in again so your token picks up updated permissions, or ask an admin to grant course access.",
        });
        return;
      }
      toast.error(apiMsg || "Failed to create course");
    },
  });

  const goNext = () => {
    if (tab === "general") {
      if (!title.trim()) {
        toast.error("Add a course title to continue");
        return;
      }
      setTab("settings");
    }
  };

  const goBack = () => {
    if (tab === "settings") setTab("general");
  };

  const submitCreate = () => {
    if (!title.trim()) {
      toast.error("Add a course title");
      return;
    }
    createMutation.mutate();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "flex h-full w-full max-w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl lg:max-w-[44rem] xl:max-w-5xl"
        )}
      >
        <div className="shrink-0 border-b bg-muted/30 px-6 py-4 pr-14">
          <SheetHeader className="space-y-1 text-left">
            <SheetTitle className="text-xl">Create course</SheetTitle>
            <SheetDescription>
              Side panel from the right — same layout as Edit course. After the course exists, open{" "}
              <span className="font-medium text-foreground">Manage curriculum</span> on its card to add sections
              and lessons.
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-transparent p-0">
              <TabsTrigger
                value="general"
                className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Layers className="h-4 w-4 shrink-0" />
                General
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="cc-title">Course title *</Label>
                  <Input
                    id="cc-title"
                    placeholder="e.g. Graphic Design for Beginners"
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cc-slug">URL slug</Label>
                  <Input
                    id="cc-slug"
                    placeholder="Filled from title — edit to override"
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Lowercase letters, numbers, and hyphens. Cleared slug syncs with the title again.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Subject (for catalog)</Label>
                    <button
                      type="button"
                      onClick={() => setShowAddCategory(!showAddCategory)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                      title="Quick-add a new category"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </button>
                  </div>
                  {showAddCategory && (
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="New category name…"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCategory(); } }}
                        className="h-9 text-sm"
                        autoFocus
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="shrink-0 h-9"
                        disabled={addCategoryMutation.isPending}
                        onClick={handleAddCategory}
                      >
                        {addCategoryMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                      </Button>
                    </div>
                  )}
                  {categoriesLoading ? (
                    <Skeleton className="h-10 w-full" />
                  ) : categories.length === 0 && !showAddCategory ? (
                    <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                      Click <strong>+ Add</strong> above to create your first category, or{" "}
                      <Link href="/dashboard/course-categories" className="font-medium text-primary underline-offset-4 hover:underline">
                        manage categories
                      </Link>.
                    </p>
                  ) : (
                    <Select value={categoryId} onValueChange={setCategoryId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Subject" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SUBJECT_NONE}>No subject</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
              <CourseCoverField id="cc-cover" value={coverUrl} onChange={setCoverUrl} />
              <div className="space-y-2">
                <Label htmlFor="cc-summary">Short summary</Label>
                <Textarea
                  id="cc-summary"
                  placeholder="One or two sentences for cards and search"
                  rows={3}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cc-body">Full description</Label>
                <Textarea
                  id="cc-body"
                  placeholder="Learning outcomes, prerequisites, who this course is for…"
                  rows={6}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="settings" className="mt-5 space-y-4">
              <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                Sections and lessons are not added here. After you create the course, use{" "}
                <strong className="text-foreground">Manage curriculum</strong> on the course card.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Difficulty</Label>
                  <Select value={level} onValueChange={setLevel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVELS.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cc-hours">Estimated hours</Label>
                  <Input
                    id="cc-hours"
                    inputMode="decimal"
                    placeholder="e.g. 12"
                    value={estHours}
                    onChange={(e) => setEstHours(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Primary language</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="cc-published" className="text-base">
                    Publish immediately
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    If on, we try to publish after create — that only works when curriculum and pricing already exist. Usually: leave off, add modules in{" "}
                    <strong className="font-medium text-foreground">Curriculum</strong>, set pricing, then use{" "}
                    <strong className="font-medium text-foreground">Edit → Published</strong>.
                  </p>
                </div>
                <Switch id="cc-published" checked={published} onCheckedChange={setPublished} />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <SheetFooter className="mt-auto shrink-0 flex-col gap-2 border-t bg-muted/20 px-6 py-4 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
            {tab === "settings" && (
              <Button type="button" variant="outline" onClick={goBack}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
            )}
            {tab === "general" ? (
              <Button type="button" onClick={goNext}>
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={submitCreate}
                disabled={!title.trim() || createMutation.isPending}
              >
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create course
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
