"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, ListOrdered, Loader2, Lock, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { coursesApi } from "@/services/api/courses";
import { certTemplateApi, prereqApi, type PrereqCourse } from "@/services/api/course-features";
import apiClient from "@/services/api/client";
import { getApiErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

/** A5: lesson order, prerequisites and certificate design of one course (instructor / admin). */
export function CourseSettingsCard({
  courseId,
  sequential: initialSequential,
  templateId: initialTemplate,
}: {
  courseId: string;
  sequential: boolean;
  templateId: string | null;
}) {
  const qc = useQueryClient();
  const [sequential, setSequential] = useState(initialSequential);
  const [templateId, setTemplateId] = useState(initialTemplate ?? "");
  const [required, setRequired] = useState<PrereqCourse[]>([]);
  const [q, setQ] = useState("");

  const prereq = useQuery({ queryKey: ["prereq", courseId], queryFn: () => prereqApi.get(courseId).then((r) => r.data.data) });
  useEffect(() => {
    if (prereq.data) setRequired(prereq.data);
  }, [prereq.data]);
  const templates = useQuery({ queryKey: ["cert-templates"], queryFn: () => certTemplateApi.list().then((r) => r.data) });
  const search = useQuery({
    queryKey: ["prereq-search", q],
    queryFn: () => coursesApi.list(1, 20, false, { q, status: "published" }).then((r) => r.data.data ?? []),
    enabled: q.trim().length >= 2,
  });

  const save = useMutation({
    mutationFn: async () => {
      await apiClient.patch(`/api/v1/courses/${courseId}`, { sequential_lessons: sequential, certificate_template_id: templateId || null });
      await prereqApi.set(courseId, required.map((r) => r.id));
    },
    onSuccess: () => {
      toast.success("Course settings saved");
      qc.invalidateQueries({ queryKey: ["course", courseId] });
      qc.invalidateQueries({ queryKey: ["prereq", courseId] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not save the settings")),
  });

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-base font-bold text-foreground">Course settings</p>

      <label className="flex items-start gap-3 rounded-xl border border-border px-4 py-3">
        <input type="checkbox" checked={sequential} onChange={(e) => setSequential(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[hsl(var(--brand))]" />
        <span>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Lock className="h-4 w-4 text-brand" /> Lessons in order
          </span>
          <span className="block text-xs text-muted-foreground">
            A student opens the next lesson only after completing the previous one (preview lessons stay open).
          </span>
        </span>
      </label>

      <div className="space-y-2 rounded-xl border border-border px-4 py-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <ListOrdered className="h-4 w-4 text-brand" /> Prerequisites
        </p>
        <p className="text-xs text-muted-foreground">Courses a student must finish before enrolling in this one.</p>
        {required.length ? (
          <ul className="space-y-1.5">
            {required.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                <button type="button" onClick={() => setRequired(required.filter((x) => x.id !== r.id))} aria-label="Remove" className="text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">None — anyone can enroll.</p>
        )}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a required course…" />
        </div>
        {q.trim().length >= 2 ? (
          <div className="max-h-44 overflow-y-auto rounded-lg border">
            {(search.data ?? [])
              .filter((c) => c.id !== courseId)
              .map((c) => {
                const added = required.some((r) => r.id === c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={added}
                    onClick={() => {
                      setRequired([...required, { id: c.id, title: c.title, slug: c.slug, status: "published" }]);
                      setQ("");
                    }}
                    className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/60 disabled:opacity-50"
                  >
                    <span className="truncate">{c.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{added ? "Added" : "Add"}</span>
                  </button>
                );
              })}
            {search.isLoading ? <p className="p-3 text-sm text-muted-foreground">Searching…</p> : null}
          </div>
        ) : null}
      </div>

      <div className="space-y-2 rounded-xl border border-border px-4 py-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Award className="h-4 w-4 text-brand" /> Certificate design
        </p>
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
          <option value="">Laambad default</option>
          {(templates.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">Admins design templates in Certificate templates.</p>
      </div>

      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save settings
      </Button>
    </div>
  );
}
