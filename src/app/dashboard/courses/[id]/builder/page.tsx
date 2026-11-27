"use client";

import { CourseSettingsCard } from "@/components/dashboard/course-settings-card";
import { CourseCoverField } from "@/components/dashboard/course-cover-field";
import { UnsavedContext, createUnsavedStore, useLeaveWarning, useUnsavedCount } from "@/components/dashboard/course-builder/unsaved";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, ExternalLink, Loader2, Save, Tag } from "lucide-react";
import { coursesApi, type CourseStatusValue } from "@/services/api/courses";
import { courseCategoriesApi } from "@/services/api/course-categories";
import { useStaffOnlyPage } from "@/hooks/use-staff-only";
import { useAuthStore } from "@/store/auth-store";
import { isAdminUser } from "@/lib/auth-routing";
import { cn, getApiErrorMessage } from "@/lib/utils";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { courseCoverRawUrl, publicCourseCoverImageUrlFromRaw } from "@/lib/course-cover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurriculumEditor } from "@/components/dashboard/manage-course-curriculum-dialog";
import { CoursePricingDialog } from "@/components/dashboard/course-pricing-dialog";
import type { Course } from "@/types";

const STEPS = [
  { key: "basics", label: "Basics" },
  { key: "curriculum", label: "Curriculum" },
  { key: "additional", label: "Additional" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

const LEVELS = [
  { value: "all_levels", label: "All levels" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "expert", label: "Expert" },
];

const STATUS_LABEL: Record<string, string> = {
  published: "Published",
  draft: "Draft",
  pending: "Pending",
  pending_review: "Pending",
  private: "Private",
  suspended: "Suspended",
};

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-sm font-semibold text-foreground">{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const card = "rounded-2xl border border-border bg-card p-5 sm:p-6";

export default function CourseBuilderPage() {
  const { ready } = useStaffOnlyPage();
  const params = useParams() as { id: string };
  const courseId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminUser(user);

  const initialStep = (searchParams.get("step") as StepKey) || "basics";
  const [step, setStep] = useState<StepKey>(STEPS.some((s) => s.key === initialStep) ? initialStep : "basics");
  const [pricingOpen, setPricingOpen] = useState(false);

  const { data: course, isLoading, isError, error } = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => coursesApi.get(courseId).then((r) => r.data as Course),
    enabled: ready && !!courseId,
  });
  const { data: categories } = useQuery({
    queryKey: ["course-categories", "all"],
    queryFn: () => courseCategoriesApi.list().then((r) => r.data),
    enabled: ready,
    staleTime: 5 * 60 * 1000,
  });

  // ---- form state (pre-filled from the course)
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [level, setLevel] = useState<string>("");
  const [benefits, setBenefits] = useState("");
  const [requirements, setRequirements] = useState("");
  const [audience, setAudience] = useState("");
  const [materials, setMaterials] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [coverUrl, setCoverUrl] = useState("");

  // the form as it is now, and as the server sent it the last time we took the server's values
  const form: BuilderForm = { title, slug, excerpt, description, categoryId, level, coverUrl, benefits, requirements, audience, materials, isPublic };
  const applied = useRef<BuilderForm | null>(null);
  const setForm = (f: BuilderForm) => {
    setTitle(f.title);
    setSlug(f.slug);
    setExcerpt(f.excerpt);
    setDescription(f.description);
    setCategoryId(f.categoryId);
    setLevel(f.level);
    setCoverUrl(f.coverUrl);
    setBenefits(f.benefits);
    setRequirements(f.requirements);
    setAudience(f.audience);
    setMaterials(f.materials);
    setIsPublic(f.isPublic);
  };

  // A course reload (e.g. after a lesson is saved) must NOT wipe what the user typed and did not save
  // yet: the server's values are taken only on the first load or when there are no local edits.
  useEffect(() => {
    if (!course) return;
    const server = formFromCourse(course);
    if (!applied.current || sameForm(form, applied.current)) {
      setForm(server);
      applied.current = server;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course]);

  const basicsDirty = !!applied.current && !sameForm(form, applied.current, BASICS);
  const additionalDirty = !!applied.current && !sameForm(form, applied.current, ADDITIONAL);

  // unsaved topics / lessons of the curriculum step
  const [unsaved] = useState(createUnsavedStore);
  const curriculumPending = useUnsavedCount(unsaved);
  const anyUnsaved = basicsDirty || additionalDirty || curriculumPending > 0;
  useLeaveWarning(anyUnsaved);

  const canEdit = !!course && (isAdmin || course.instructor_id === user?.id);

  const save = useMutation({
    mutationFn: (part: "basics" | "additional") =>
      coursesApi.update(
        courseId,
        part === "basics"
          ? {
              title: title.trim(),
              slug: slug.trim(),
              excerpt: excerpt.trim() || null,
              description,
              category_id: categoryId || undefined,
              level: level || null,
              cover_url: coverUrl.trim() || null,
            }
          : {
              benefits: benefits.trim() || null,
              requirements: requirements.trim() || null,
              target_audience: audience.trim() || null,
              materials: materials.trim() || null,
              is_public: isPublic,
            },
      ),
    onSuccess: (_r, part) => {
      toast.success("Saved");
      // what was just saved is now the server's state
      if (applied.current) {
        const keys = part === "basics" ? BASICS : ADDITIONAL;
        const next = { ...applied.current };
        for (const k of keys) (next as Record<string, unknown>)[k] = form[k];
        applied.current = next;
      }
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not save")),
  });

  /** Save what is open before leaving a step; false = stay (an error message was shown). */
  const saveCurrentStep = async (): Promise<boolean> => {
    if (step === "curriculum" && unsaved.count() > 0) {
      const r = await unsaved.saveAll();
      if (r.failed) {
        toast.error(`${r.failed} change${r.failed === 1 ? "" : "s"} could not be saved — fix ${r.failed === 1 ? "it" : "them"} first.`);
        return false;
      }
      return true;
    }
    const part = step === "basics" ? "basics" : step === "additional" ? "additional" : null;
    if (part && (part === "basics" ? basicsDirty : additionalDirty)) {
      if (part === "basics" && !title.trim()) {
        toast.error("The course needs a title.");
        return false;
      }
      try {
        await save.mutateAsync(part);
      } catch {
        return false;
      }
    }
    return true;
  };
  const [moving, setMoving] = useState(false);

  const statusMut = useMutation({
    mutationFn: (s: CourseStatusValue) => coursesApi.setStatus(courseId, s),
    onSuccess: (_r, s) => {
      toast.success(s === "published" ? "Course published" : s === "pending" ? "Submitted for review" : "Status updated");
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not change the status")),
  });

  // every way of changing step (stepper, Next, Previous) saves the open step first
  const goStep = async (k: StepKey) => {
    if (k === step || moving) return;
    setMoving(true);
    const ok = await saveCurrentStep();
    setMoving(false);
    if (!ok) return;
    setStep(k);
    const p = new URLSearchParams(searchParams.toString());
    p.set("step", k);
    router.replace(`/dashboard/courses/${courseId}/builder?${p.toString()}`, { scroll: false });
  };
  const idx = STEPS.findIndex((s) => s.key === step);

  /** Save every unsaved change of every step (top-bar button, and before publishing). */
  const saveEverything = async (): Promise<boolean> => {
    if (unsaved.count() > 0) {
      const r = await unsaved.saveAll();
      if (r.failed) {
        toast.error(`${r.failed} change${r.failed === 1 ? "" : "s"} could not be saved.`);
        return false;
      }
    }
    try {
      if (basicsDirty) {
        if (!title.trim()) {
          toast.error("The course needs a title.");
          return false;
        }
        await save.mutateAsync("basics");
      }
      if (additionalDirty) await save.mutateAsync("additional");
    } catch {
      return false;
    }
    return true;
  };

  // the cover just uploaded (not saved yet) shows at once; otherwise the course's cover
  const cover = useMemo(
    () => (coverUrl.trim() ? publicCourseCoverImageUrlFromRaw(coverUrl.trim()) : course ? publicCourseCoverImageUrlFromRaw(courseCoverRawUrl(course)) : null),
    [course, coverUrl]
  );
  const price = course?.active_pricing;

  if (!ready || isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-[420px] w-full rounded-2xl" />
      </div>
    );
  }
  if (isError || !course) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        {getApiErrorMessage(error, "Course not found")}
      </div>
    );
  }
  if (!canEdit) {
    return <div className={card}>You can only edit your own courses.</div>;
  }

  const status = course.status ?? "draft";

  return (
    <UnsavedContext.Provider value={unsaved}>
    <div className="space-y-6">
      {/* top bar: back · title · stepper · status / publish */}
      <div className="sticky top-16 z-20 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            href="/dashboard/courses"
            onClick={(e) => {
              if (anyUnsaved && !window.confirm("You have changes that are not saved. Leave without saving them?")) e.preventDefault();
            }}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Courses
          </Link>
          <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
          <span className="text-sm font-semibold text-muted-foreground">Course Builder</span>
          <ol className="flex items-center gap-2">
            {STEPS.map((s, i) => {
              const done = i < idx;
              const active = s.key === step;
              return (
                <li key={s.key} className="flex items-center gap-2">
                  {i > 0 ? <span className="h-px w-5 bg-border sm:w-8" aria-hidden /> : null}
                  <button
                    type="button"
                    onClick={() => goStep(s.key)}
                    className={cn("flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 text-sm font-medium transition", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold",
                        active ? "border-brand bg-brand text-brand-foreground" : done ? "border-success bg-success text-success-foreground" : "border-border",
                      )}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="ml-auto flex items-center gap-2">
            {anyUnsaved ? (
              <Button
                size="sm"
                variant="outline"
                className="border-warning/50 bg-warning-soft text-foreground hover:bg-warning-soft/80"
                disabled={moving || save.isPending}
                onClick={async () => {
                  setMoving(true);
                  const ok = await saveEverything();
                  setMoving(false);
                  if (ok && unsaved.count() === 0) toast.success("All changes saved");
                }}
                title={curriculumPending ? unsaved.labels().join(", ") : undefined}
              >
                {moving || save.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                {(() => {
                  const total = curriculumPending + (basicsDirty ? 1 : 0) + (additionalDirty ? 1 : 0);
                  return total > 1 ? `Save changes (${total})` : "Save changes";
                })()}
              </Button>
            ) : null}
            <span className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              {STATUS_LABEL[status] ?? status}
            </span>
            <Button asChild variant="outline" size="sm">
              <Link href={`/courses/${course.slug}`} target="_blank">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Preview
              </Link>
            </Button>
            {status !== "published" ? (
              <Button
                size="sm"
                className="bg-brand text-brand-foreground hover:bg-brand-hover"
                disabled={statusMut.isPending || moving}
                onClick={async () => {
                  // publish / send for review what is on screen, not an older saved version
                  setMoving(true);
                  const ok = await saveEverything();
                  setMoving(false);
                  if (ok) statusMut.mutate(isAdmin ? "published" : "pending");
                }}
              >
                {statusMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                {isAdmin ? "Publish" : "Submit for review"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {course.review_note && status !== "published" ? (
        <div className="rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm">
          <p className="font-semibold text-warning">Changes requested by the reviewer</p>
          <p className="mt-1 whitespace-pre-wrap text-foreground">{course.review_note}</p>
        </div>
      ) : null}

      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{decodeHtmlEntities(course.title)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {course.section_count ?? course.sections?.length ?? 0} topics · {course.lesson_count ?? 0} lessons · by {course.instructor_name}
        </p>
      </div>

      {/* ---- step 1: basics */}
      {step === "basics" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className={cn(card, "space-y-5")}>
            <Field label="Course title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Applied Descriptive Statistics" />
            </Field>
            <Field label="Course URL" hint={`laambad.com/courses/${slug || "…"}`}>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="font-mono text-sm" />
            </Field>
            <Field label="Short summary" hint="One or two sentences shown on cards and at the top of the course page.">
              <Textarea rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
            </Field>
            <Field
              label="Description"
              hint="Edit the text directly. Use the toolbar for headings, bold, lists, links and images; “HTML” shows the source."
            >
              <RichTextEditor
                value={description}
                onChange={setDescription}
                placeholder="Describe what the course covers, who teaches it and what learners will achieve…"
                minHeight={280}
              />
            </Field>
          </div>

          <div className="space-y-6">
            <div className={cn(card, "space-y-4")}>
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" className="aspect-video w-full rounded-xl object-cover" />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground">No cover image</div>
              )}
              <Field label="Cover image" hint="Shown on course cards and the course page. Saved with “Save”.">
                <CourseCoverField id="builder-cover" value={coverUrl} onChange={setCoverUrl} />
              </Field>
              <Field label="Category">
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {decodeHtmlEntities(c.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Difficulty level">
                <Select value={level} onValueChange={setLevel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a level" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex items-center justify-between rounded-xl border border-border px-3.5 py-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Price</p>
                  <p className="text-lg font-extrabold text-foreground">
                    {!price || price.is_free ? "Free" : `USD ${((price.discount_price ?? price.price) / 100).toFixed(2)}`}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setPricingOpen(true)}>
                  <Tag className="mr-1.5 h-3.5 w-3.5" /> Edit price
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---- step 2: curriculum */}
      {step === "curriculum" ? (
        <div className={card}>
          <CurriculumEditor courseId={courseId} />
        </div>
      ) : null}

      {/* ---- step 3: additional */}
      {step === "additional" ? (
        <div className={cn(card, "grid gap-5 lg:grid-cols-2")}>
          <Field label="What will students learn?" hint="One point per line.">
            <Textarea rows={6} value={benefits} onChange={(e) => setBenefits(e.target.value)} />
          </Field>
          <Field label="Requirements / instructions" hint="One per line.">
            <Textarea rows={6} value={requirements} onChange={(e) => setRequirements(e.target.value)} />
          </Field>
          <Field label="Target audience" hint="Who is this course for? One per line.">
            <Textarea rows={6} value={audience} onChange={(e) => setAudience(e.target.value)} />
          </Field>
          <Field label="Materials included" hint="Files, tools or resources. One per line.">
            <Textarea rows={6} value={materials} onChange={(e) => setMaterials(e.target.value)} />
          </Field>
          <label className="flex items-start gap-3 rounded-xl border border-border px-4 py-3 lg:col-span-2">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[hsl(var(--brand))]" />
            <span>
              <span className="text-sm font-semibold text-foreground">Public course</span>
              <span className="block text-xs text-muted-foreground">Anyone can see the lessons without enrolling (Tutor “public course”).</span>
            </span>
          </label>
        </div>
      ) : null}
      {step === "additional" ? (
        <CourseSettingsCard
          key={course.id}
          courseId={course.id}
          sequential={!!course.sequential_lessons}
          templateId={course.certificate_template_id ?? null}
        />
      ) : null}

      {/* footer: previous / save / next — changing step saves the open step first */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <Button variant="outline" disabled={idx === 0 || moving} onClick={() => goStep(STEPS[Math.max(0, idx - 1)].key)}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Previous
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {step === "curriculum" && curriculumPending > 0 ? (
            <span className="text-xs font-medium text-warning">
              {curriculumPending} unsaved {curriculumPending === 1 ? "change" : "changes"}
            </span>
          ) : null}
          {step === "curriculum" ? (
            <Button
              variant="outline"
              disabled={moving || curriculumPending === 0}
              onClick={async () => {
                setMoving(true);
                const r = await unsaved.saveAll();
                setMoving(false);
                if (!r.failed && r.saved) toast.success(r.saved === 1 ? "Change saved" : `${r.saved} changes saved`);
              }}
            >
              {moving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              Save all
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={save.isPending || moving || (step === "basics" && !title.trim())}
              onClick={() => save.mutate(step === "basics" ? "basics" : "additional")}
            >
              {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              Save
            </Button>
          )}
          {idx < STEPS.length - 1 ? (
            <Button
              className="bg-brand text-brand-foreground hover:bg-brand-hover"
              disabled={save.isPending || moving}
              onClick={() => goStep(STEPS[idx + 1].key)}
            >
              {moving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Next <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <CoursePricingDialog courseId={courseId} courseTitle={course.title} open={pricingOpen} onOpenChange={setPricingOpen} />
    </div>
    </UnsavedContext.Provider>
  );
}

// ── the Basics / Additional form ──

type BuilderForm = {
  title: string;
  slug: string;
  excerpt: string;
  description: string;
  categoryId: string;
  level: string;
  coverUrl: string;
  benefits: string;
  requirements: string;
  audience: string;
  materials: string;
  isPublic: boolean;
};
const BASICS: (keyof BuilderForm)[] = ["title", "slug", "excerpt", "description", "categoryId", "level", "coverUrl"];
const ADDITIONAL: (keyof BuilderForm)[] = ["benefits", "requirements", "audience", "materials", "isPublic"];

function formFromCourse(course: Course): BuilderForm {
  return {
    title: course.title ?? "",
    slug: course.slug ?? "",
    excerpt: course.excerpt ?? "",
    description: course.description ?? "",
    categoryId: course.category_id ?? "",
    level: course.level ?? "",
    coverUrl: course.cover_url ?? "",
    benefits: course.benefits ?? "",
    requirements: course.requirements ?? "",
    audience: course.target_audience ?? "",
    materials: course.materials ?? "",
    isPublic: !!course.is_public,
  };
}

function sameForm(a: BuilderForm, b: BuilderForm, keys: (keyof BuilderForm)[] = [...BASICS, ...ADDITIONAL]) {
  return keys.every((k) => a[k] === b[k]);
}
