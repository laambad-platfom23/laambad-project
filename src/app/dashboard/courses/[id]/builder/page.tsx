"use client";

import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    if (!course) return;
    setTitle(course.title ?? "");
    setSlug(course.slug ?? "");
    setExcerpt(course.excerpt ?? "");
    setDescription(course.description ?? "");
    setCategoryId(course.category_id ?? "");
    setLevel(course.level ?? "");
    setBenefits(course.benefits ?? "");
    setRequirements(course.requirements ?? "");
    setAudience(course.target_audience ?? "");
    setMaterials(course.materials ?? "");
    setIsPublic(!!course.is_public);
  }, [course]);

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
            }
          : {
              benefits: benefits.trim() || null,
              requirements: requirements.trim() || null,
              target_audience: audience.trim() || null,
              materials: materials.trim() || null,
              is_public: isPublic,
            },
      ),
    onSuccess: () => {
      toast.success("Saved");
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not save")),
  });

  const statusMut = useMutation({
    mutationFn: (s: CourseStatusValue) => coursesApi.setStatus(courseId, s),
    onSuccess: (_r, s) => {
      toast.success(s === "published" ? "Course published" : s === "pending" ? "Submitted for review" : "Status updated");
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not change the status")),
  });

  const goStep = (k: StepKey) => {
    setStep(k);
    const p = new URLSearchParams(searchParams.toString());
    p.set("step", k);
    router.replace(`/dashboard/courses/${courseId}/builder?${p.toString()}`, { scroll: false });
  };
  const idx = STEPS.findIndex((s) => s.key === step);

  const cover = useMemo(() => (course ? publicCourseCoverImageUrlFromRaw(courseCoverRawUrl(course)) : null), [course]);
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
    <div className="space-y-6">
      {/* top bar: back · title · stepper · status / publish */}
      <div className="sticky top-16 z-20 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link href="/dashboard/courses" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
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
                disabled={statusMut.isPending}
                onClick={() => statusMut.mutate(isAdmin ? "published" : "pending")}
              >
                {statusMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                {isAdmin ? "Publish" : "Submit for review"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

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

      {/* footer: previous / save / next */}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
        <Button variant="outline" disabled={idx === 0} onClick={() => goStep(STEPS[Math.max(0, idx - 1)].key)}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Previous
        </Button>
        <div className="flex gap-2">
          {step !== "curriculum" ? (
            <Button
              variant="outline"
              disabled={save.isPending || (step === "basics" && !title.trim())}
              onClick={() => save.mutate(step === "basics" ? "basics" : "additional")}
            >
              {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              Save
            </Button>
          ) : null}
          {idx < STEPS.length - 1 ? (
            <Button
              className="bg-brand text-brand-foreground hover:bg-brand-hover"
              disabled={save.isPending}
              onClick={async () => {
                if (step !== "curriculum") await save.mutateAsync(step === "basics" ? "basics" : "additional").catch(() => null);
                goStep(STEPS[idx + 1].key);
              }}
            >
              Next <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <CoursePricingDialog courseId={courseId} courseTitle={course.title} open={pricingOpen} onOpenChange={setPricingOpen} />
    </div>
  );
}
