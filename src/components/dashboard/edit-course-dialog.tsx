"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Layers, Loader2, Plus } from "lucide-react";
import { cn, slugFromTitle } from "@/lib/utils";
import { applyCoverUrlToDescription, extractCoverImageUrl } from "@/lib/course-cover";
import { CourseCoverField } from "@/components/dashboard/course-cover-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SUBJECT_NONE = "none";

type Props = {
  courseId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

async function fetchPricingOrNull(courseId: string) {
  try {
    const r = await coursesApi.getPricing(courseId);
    return r.data;
  } catch (e) {
    const err = e as AxiosError<{ code?: string }>;
    if (err.response?.status === 404) return null;
    throw e;
  }
}

export function EditCourseDialog({ courseId, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const enabled = Boolean(open && courseId);
  const [tab, setTab] = useState("general");
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const { data: course, isLoading } = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => coursesApi.get(courseId!).then((r) => r.data),
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: pricing } = useQuery({
    queryKey: ["course-pricing", courseId],
    queryFn: () => fetchPricingOrNull(courseId!),
    enabled,
  });

  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ["course-categories"],
    queryFn: () => courseCategoriesApi.list().then((r) => r.data),
    enabled,
  });

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

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  /** First image in description; kept in sync with markdown via upload or edits. */
  const [coverUrl, setCoverUrl] = useState("");
  const [published, setPublished] = useState(false);
  const [categoryId, setCategoryId] = useState<string>(SUBJECT_NONE);
  const [priceFree, setPriceFree] = useState(true);
  const [priceMajor, setPriceMajor] = useState("");
  const [currency, setCurrency] = useState("USD");
  /** When false, slug updates from title; true if slug was customized vs API or user-edited. */
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  useEffect(() => {
    if (!open) {
      setTab("general");
      setShowAddCategory(false);
      setNewCategoryName("");
    }
  }, [open]);

  useEffect(() => {
    if (!course) return;
    setTitle(course.title);
    setSlug(course.slug);
    const desc = course.description ?? "";
    setDescription(desc);
    setCoverUrl(extractCoverImageUrl(desc) ?? "");
    setPublished(course.is_published ?? course.published ?? false);
    const derived = slugFromTitle(course.title);
    setSlugManuallyEdited(course.slug.trim() !== "" && course.slug !== derived);
    const cid = course.category_id;
    if (!cid) {
      setCategoryId(SUBJECT_NONE);
    } else if (categories.length === 0) {
      setCategoryId(cid);
    } else if (categories.some((c) => c.id === cid)) {
      setCategoryId(cid);
    } else {
      setCategoryId(SUBJECT_NONE);
    }
  }, [course, categories]);

  const isLive = course ? (course.is_published ?? course.published ?? false) : false;
  const sectionCount = course?.section_count ?? 0;
  const lessonCount = course?.lesson_count ?? 0;
  /** Matches server PublishCourse rules (pricing is saved in the same submit before publish). */
  const readyToPublish = sectionCount >= 1 && lessonCount >= 1;
  const publishSwitchLocked = !isLive && !readyToPublish;

  useEffect(() => {
    if (!course) return;
    if (publishSwitchLocked) {
      setPublished(false);
    }
  }, [course, publishSwitchLocked]);

  useEffect(() => {
    if (pricing === undefined) return;
    if (!pricing) {
      setPriceFree(true);
      setPriceMajor("");
      setCurrency("USD");
      return;
    }
    setPriceFree(pricing.is_free);
    setCurrency((pricing.currency || "USD").toUpperCase());
    if (pricing.is_free) {
      setPriceMajor("");
    } else {
      setPriceMajor((pricing.price / 100).toFixed(2));
    }
  }, [pricing]);

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

  const handleCoverChange = (url: string) => {
    setCoverUrl(url);
    setDescription((d) => applyCoverUrlToDescription(d, url));
  };

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
    setCoverUrl(extractCoverImageUrl(value) ?? "");
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!courseId || !course) throw new Error("missing");
      await coursesApi.update(courseId, {
        title: title.trim(),
        slug: slug.trim() || undefined,
        description: applyCoverUrlToDescription(description.trim(), coverUrl).trim(),
        category_id: categoryId === SUBJECT_NONE ? "" : categoryId,
      });
      const cents = priceFree ? 0 : Math.round(parseFloat(priceMajor || "0") * 100);
      if (!priceFree) {
        if (!Number.isFinite(cents) || cents <= 0) {
          throw new Error("invalid_price");
        }
      }
      await coursesApi.updatePricing(courseId, {
        is_free: priceFree,
        price: priceFree ? 0 : cents,
        currency: currency.trim() || "USD",
      });
      const wasPub = course.is_published ?? course.published ?? false;
      if (published && !wasPub) {
        await coursesApi.publish(courseId);
      } else if (!published && wasPub) {
        await coursesApi.unpublish(courseId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
      queryClient.invalidateQueries({ queryKey: ["course-pricing", courseId] });
      queryClient.invalidateQueries({ queryKey: ["catalog-courses"] });
      toast.success("Course updated");
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof Error && err.message === "invalid_price") {
        toast.error("Enter a valid price greater than zero, or enable Free course");
        return;
      }
      const ax = err as AxiosError<{ error?: { code?: string; message?: string } }>;
      const code = ax.response?.data?.error?.code;
      const msg = ax.response?.data?.error?.message;
      if (code === "cannot_publish_course") {
        setPublished(false);
        toast.error("Add at least one module and one lesson in Curriculum before publishing.");
        return;
      }
      if (code === "pricing_required") {
        toast.error("Set pricing (including free) before publishing.");
        return;
      }
      toast.error(msg || "Could not update course");
    },
  });

  const goNext = () => {
    if (!title.trim()) {
      toast.error("Add a course title to continue");
      return;
    }
    setTab("settings");
  };

  const goBack = () => setTab("general");

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === "general") {
      goNext();
      return;
    }
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    updateMutation.mutate();
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
            <SheetTitle className="text-xl">Edit course</SheetTitle>
            <SheetDescription>
              Side panel — same layout as <span className="font-medium text-foreground">Create course</span>. Curriculum is edited from{" "}
              <span className="font-medium text-foreground">Curriculum</span> on the course card.
            </SheetDescription>
          </SheetHeader>
        </div>

        {isLoading || !course ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-6">
            <Skeleton className="h-10 w-full max-w-md" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <form
            id="edit-course-form"
            onSubmit={handleFormSubmit}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
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
                      <Label htmlFor="ec-title">Course title *</Label>
                      <Input
                        id="ec-title"
                        placeholder="e.g. Graphic Design for Beginners"
                        value={title}
                        onChange={(e) => handleTitleChange(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ec-slug">URL slug</Label>
                      <div className="space-y-1.5">
                        <Input
                          id="ec-slug"
                          placeholder="Filled from title — edit to override"
                          value={slug}
                          onChange={(e) => handleSlugChange(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Auto-updates when you change the title unless you edit this field. Clear it to sync again.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label>Subject (for catalog)</Label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowAddCategory(!showAddCategory)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                            title="Quick-add a new category"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add
                          </button>
                          <Link
                            href="/dashboard/course-categories"
                            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                          >
                            Manage
                          </Link>
                        </div>
                      </div>
                      {showAddCategory && (
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="New category name…"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddCategory();
                              }
                            }}
                            className="h-9 text-sm"
                            autoFocus
                          />
                          <Button
                            type="button"
                            size="sm"
                            className="h-9 shrink-0"
                            disabled={addCategoryMutation.isPending}
                            onClick={handleAddCategory}
                          >
                            {addCategoryMutation.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              "Save"
                            )}
                          </Button>
                        </div>
                      )}
                      {categoriesLoading ? (
                        <Skeleton className="h-10 w-full" />
                      ) : categories.length === 0 && !showAddCategory ? (
                        <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                          Click <strong>+ Add</strong> above to create your first category, or{" "}
                          <Link
                            href="/dashboard/course-categories"
                            className="font-medium text-primary underline-offset-4 hover:underline"
                          >
                            manage categories
                          </Link>
                          .
                        </p>
                      ) : (
                        <Select value={categoryId} onValueChange={setCategoryId}>
                          <SelectTrigger id="ec-category">
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
                  <CourseCoverField id="ec-cover" value={coverUrl} onChange={handleCoverChange} />
                  <div className="space-y-2">
                    <Label htmlFor="ec-desc">Description (Markdown)</Label>
                    <Textarea
                      id="ec-desc"
                      rows={10}
                      value={description}
                      onChange={(e) => handleDescriptionChange(e.target.value)}
                      placeholder="Summary, learning outcomes, prerequisites… (first image line stays in sync with Course image above)"
                      className="min-h-[200px] font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      The first markdown image is the catalog cover; use <strong className="font-medium text-foreground">Course image</strong>{" "}
                      above to upload or change it.
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="settings" className="mt-5 space-y-4">
                  <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    Sections and lessons are not edited here. Use{" "}
                    <strong className="text-foreground">Curriculum</strong> on the course card to add modules and lessons.
                  </p>
                  <Separator />
                  {publishSwitchLocked ? (
                    <div className="rounded-lg border border-amber-500/35 bg-amber-500/5 px-3 py-2.5 text-sm text-foreground">
                      <p className="font-medium text-amber-900 dark:text-amber-100">
                        Publishing is locked until there is content
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        This course has <strong className="text-foreground">{sectionCount}</strong> module
                        {sectionCount !== 1 ? "s" : ""} and <strong className="text-foreground">{lessonCount}</strong>{" "}
                        lesson{lessonCount !== 1 ? "s" : ""}. Add at least <strong className="text-foreground">one module</strong>{" "}
                        and <strong className="text-foreground">one lesson</strong> using{" "}
                        <strong className="text-foreground">Curriculum</strong> on the course card, then return here and
                        turn on Published.
                      </p>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5 pr-4">
                      <Label htmlFor="ec-published" className="text-base">
                        Published
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        When you save, we publish or unpublish on the server. Pricing below is required (free is OK).
                        {!publishSwitchLocked ? (
                          <span className="block pt-1 text-xs">
                            Ready: {sectionCount} module{sectionCount !== 1 ? "s" : ""}, {lessonCount} lesson
                            {lessonCount !== 1 ? "s" : ""}.
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <Switch
                      id="ec-published"
                      checked={publishSwitchLocked ? false : published}
                      disabled={publishSwitchLocked}
                      onCheckedChange={setPublished}
                    />
                  </div>
                  <Separator />
                  <div className="space-y-4 rounded-lg border border-dashed bg-muted/20 p-4">
                    <div>
                      <p className="text-base font-medium">Pricing</p>
                      <p className="text-sm text-muted-foreground">
                        Free = no payment to enroll. Paid = student pays the amount below before full access. Amounts are
                        stored in minor units (e.g. USD: dollars you enter → cents in the system).
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label htmlFor="ec-free">Free course</Label>
                        <p className="text-xs text-muted-foreground">No payment required for access</p>
                      </div>
                      <Switch id="ec-free" checked={priceFree} onCheckedChange={setPriceFree} />
                    </div>
                    {!priceFree && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="ec-price">Price</Label>
                          <Input
                            id="ec-price"
                            inputMode="decimal"
                            value={priceMajor}
                            onChange={(e) => setPriceMajor(e.target.value)}
                            placeholder="e.g. 29.99"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ec-currency">Currency</Label>
                          <Input
                            id="ec-currency"
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                            placeholder="USD"
                            maxLength={8}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </form>
        )}

        {!isLoading && course && (
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
                <Button type="submit" form="edit-course-form">
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button type="submit" form="edit-course-form" disabled={updateMutation.isPending}>
                  {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save changes
                </Button>
              )}
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
