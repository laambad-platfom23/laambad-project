"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { CertificateImage, useCertificateCanvas } from "@/components/certificates/certificate-view";
import { DEFAULT_CERTIFICATE_DESIGN, type CertificateDesign } from "@/lib/certificate-render";
import { certTemplateApi, type CertTemplate } from "@/services/api/course-features";
import { uploadsApi } from "@/services/api/uploads";
import { useAuthStore } from "@/store/auth-store";
import { isAdminUser } from "@/lib/auth-routing";
import { getApiErrorMessage } from "@/lib/utils";
import type { Certificate } from "@/types";
import { toast } from "sonner";

const SAMPLE: Certificate = {
  id: "preview",
  user_id: "preview",
  course_id: "preview",
  verification_id: "a1b2c3d4e5f60718",
  issued_at: new Date().toISOString(),
  completed_at: new Date().toISOString(),
  student_name: "Amina Hassan Abdi",
  course_title: "Applied Descriptive Statistics",
  duration: "12h 30m",
} as unknown as Certificate;

const COLORS: [keyof CertificateDesign, string][] = [
  ["background", "Background"],
  ["ribbon", "Ribbon"],
  ["frame", "Frame"],
  ["accent", "Signature line"],
  ["name_color", "Name & course"],
  ["text_color", "Body text"],
];
const IMAGES: [keyof CertificateDesign, string][] = [
  ["brand_logo_url", "Top logo"],
  ["partner_logo_url", "Ribbon logo"],
  ["signature_url", "Signature"],
];

/** A5 admin: certificate builder — design templates and see the real certificate while editing. */
export default function CertificateTemplatesPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CertTemplate | "new" | null>(null);
  const list = useQuery({ queryKey: ["cert-templates"], queryFn: () => certTemplateApi.list().then((r) => r.data), enabled: isAdminUser(user) });
  const remove = useMutation({
    mutationFn: (id: string) => certTemplateApi.remove(id),
    onSuccess: () => {
      toast.success("Template removed (its courses use the default design)");
      qc.invalidateQueries({ queryKey: ["cert-templates"] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not remove")),
  });

  if (!isAdminUser(user)) return <p className="py-16 text-center text-muted-foreground">Admins only.</p>;
  if (editing) {
    return (
      <TemplateEditor
        template={editing === "new" ? null : editing}
        onDone={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["cert-templates"] });
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Award className="h-7 w-7 text-primary" /> Certificate templates
          </h1>
          <p className="mt-1 text-muted-foreground">Design certificates and pick one per course (course builder → Additional).</p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> New template
        </Button>
      </div>
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <Award className="h-5 w-5 text-brand" />
          <div className="flex-1">
            <p className="font-medium">Laambad default</p>
            <p className="text-xs text-muted-foreground">Used by every course without its own template (the design from the old site).</p>
          </div>
        </CardContent>
      </Card>
      {list.isLoading ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {(list.data ?? []).map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3">
              <div className="h-8 w-8 rounded-md border" style={{ background: t.design.ribbon ?? DEFAULT_CERTIFICATE_DESIGN.ribbon }} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.course_count ?? 0} courses</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => window.confirm(`Remove "${t.name}"?`) && remove.mutate(t.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {!list.data?.length ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">No custom templates yet.</p> : null}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({ template, onDone }: { template: CertTemplate | null; onDone: () => void }) {
  const [name, setName] = useState(template?.name ?? "");
  const [design, setDesign] = useState<CertificateDesign>({ ...DEFAULT_CERTIFICATE_DESIGN, ...(template?.design ?? {}) });
  const [debounced, setDebounced] = useState(design);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<keyof CertificateDesign | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(design), 350);
    return () => clearTimeout(t);
  }, [design]);
  const { canvas, error } = useCertificateCanvas(SAMPLE, 1, debounced);
  const set = (k: keyof CertificateDesign, v: string | boolean) => setDesign((d) => ({ ...d, [k]: v }));

  const save = useMutation({
    mutationFn: () => (template ? certTemplateApi.update(template.id, name, design) : certTemplateApi.create(name, design)),
    onSuccess: () => {
      toast.success("Template saved");
      onDone();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not save")),
  });

  const upload = async (file?: File) => {
    const key = target.current;
    if (!file || !key) return;
    setUploading(key);
    try {
      const r = await uploadsApi.uploadMedia(file, "assets");
      set(key, r.url);
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Upload failed"));
    } finally {
      setUploading(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{template ? "Edit template" : "New template"}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
          </Button>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-2">
          <CertificateImage cert={SAMPLE} canvas={canvas} error={error} className="rounded-xl border shadow-sm" />
          <p className="text-xs text-muted-foreground">Preview with sample data. Real certificates use the student, course and date.</p>
        </div>
        <div className="space-y-4 rounded-2xl border bg-card p-4">
          <div className="space-y-1.5">
            <Label>Template name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Diploma — gold" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {COLORS.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="color" value={String(design[k])} onChange={(e) => set(k, e.target.value)} className="h-8 w-10 cursor-pointer rounded border" />
                {label}
              </label>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>Ribbon heading</Label>
            <Input value={String(design.heading).replace(/\n/g, "\\n")} onChange={(e) => set("heading", e.target.value.replace(/\\n/g, "\n"))} />
            <p className="text-[11px] text-muted-foreground">Use \n for a new line.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Line above the course name</Label>
            <Input value={design.completed_text} onChange={(e) => set("completed_text", e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label>Body text</Label>
            <Textarea rows={3} value={design.body_text} onChange={(e) => set("body_text", e.target.value)} maxLength={400} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Signer name</Label>
              <Input value={design.signer_name} onChange={(e) => set("signer_name", e.target.value)} maxLength={60} />
            </div>
            <div className="space-y-1.5">
              <Label>Signer title</Label>
              <Input value={design.signer_title} onChange={(e) => set("signer_title", e.target.value)} maxLength={60} />
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          <div className="space-y-2">
            {IMAGES.map(([k, label]) => (
              <div key={k} className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={String(design[k])} alt="" className="h-10 w-16 rounded border bg-white object-contain" />
                <span className="flex-1 text-sm">{label}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!uploading}
                  onClick={() => {
                    target.current = k;
                    fileRef.current?.click();
                  }}
                >
                  {uploading === k ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Change
                </Button>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">PNG with a transparent background looks best for logos and signatures.</p>
          </div>
          <div className="space-y-1.5">
            {(
              [
                ["show_qr", "Verification QR code"],
                ["show_duration", "Course duration"],
                ["show_pattern", "Background pattern"],
              ] as [keyof CertificateDesign, string][]
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!design[k]} onChange={(e) => set(k, e.target.checked)} /> {label}
              </label>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setDesign({ ...DEFAULT_CERTIFICATE_DESIGN })}>
            Reset to the Laambad default
          </Button>
        </div>
      </div>
    </div>
  );
}
