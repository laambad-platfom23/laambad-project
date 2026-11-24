/**
 * A5 — Certificate builder: admins design certificate templates; a course picks one
 * (courses.certificate_template_id, null = the Laambad default design).
 */
import { prisma, newId, now } from "@/lib/db";
import { Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { assertUuid } from "@/lib/uuid";

const COLOR_KEYS = ["background", "ribbon", "frame", "accent", "name_color", "text_color"] as const;
const TEXT_KEYS: Record<string, number> = {
  heading: 60,
  completed_text: 80,
  body_text: 400,
  signer_name: 60,
  signer_title: 60,
};
const IMAGE_KEYS = ["partner_logo_url", "brand_logo_url", "signature_url"] as const;
const BOOL_KEYS = ["show_qr", "show_duration", "show_pattern"] as const;

/** Keep only known keys with safe values (colours, short texts, image addresses, flags). */
function cleanDesign(raw: unknown) {
  if (!raw || typeof raw !== "object") throw Err.invalidInput("design is required");
  const d = raw as Record<string, unknown>;
  const out: Record<string, string | boolean> = {};
  for (const k of COLOR_KEYS) {
    if (d[k] === undefined || d[k] === "") continue;
    const v = String(d[k]).trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw Err.invalidInput(`${k} must be a colour like #1e1b4b`);
    out[k] = v;
  }
  for (const [k, max] of Object.entries(TEXT_KEYS)) {
    if (d[k] === undefined) continue;
    out[k] = String(d[k]).replace(/[\u0000-\u0009\u000B-\u001F]/g, "").slice(0, max);
  }
  for (const k of IMAGE_KEYS) {
    if (d[k] === undefined || d[k] === "") continue;
    const v = String(d[k]).trim().slice(0, 1024);
    if (!/^https:\/\//i.test(v) && !/^\/[\w\-./]+$/.test(v)) throw Err.invalidInput(`${k} must be an uploaded image`);
    out[k] = v;
  }
  for (const k of BOOL_KEYS) if (d[k] !== undefined) out[k] = !!d[k];
  return out;
}

function view(t: { id: string; name: string; design: unknown; isDefault: boolean; createdAt: Date; updatedAt: Date }, courses?: number) {
  return {
    id: t.id,
    name: t.name,
    design: t.design,
    is_default: t.isDefault,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
    ...(courses !== undefined ? { course_count: courses } : {}),
  };
}

export async function list(user: AuthUser) {
  if (user.role !== "admin" && user.role !== "instructor") throw Err.forbidden();
  const rows = await prisma.certificateTemplate.findMany({
    where: { deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: { _count: { select: { courses: { where: { deletedAt: null } } } } },
  });
  return rows.map((r) => view(r, r._count.courses));
}

export async function create(user: AuthUser, input: { name?: string; design?: unknown }) {
  if (user.role !== "admin") throw Err.forbidden();
  const name = String(input.name ?? "").trim().slice(0, 120);
  if (!name) throw Err.invalidInput("name is required");
  const t = now();
  const row = await prisma.certificateTemplate.create({
    data: { id: newId(), name, design: cleanDesign(input.design ?? {}), createdBy: user.user_id, createdAt: t, updatedAt: t },
  });
  return view(row, 0);
}

export async function update(user: AuthUser, id: string, input: { name?: string; design?: unknown }) {
  if (user.role !== "admin") throw Err.forbidden();
  assertUuid(id, "template not found");
  const row = await prisma.certificateTemplate.findFirst({ where: { id, deletedAt: null } });
  if (!row) throw Err.notFound("template not found");
  const name = input.name !== undefined ? String(input.name).trim().slice(0, 120) : undefined;
  if (name === "") throw Err.invalidInput("name is required");
  const updated = await prisma.certificateTemplate.update({
    where: { id },
    data: { name, design: input.design !== undefined ? cleanDesign(input.design) : undefined, updatedAt: now() },
  });
  return view(updated);
}

/** Soft delete; courses using it fall back to the default design. */
export async function remove(user: AuthUser, id: string) {
  if (user.role !== "admin") throw Err.forbidden();
  assertUuid(id, "template not found");
  const row = await prisma.certificateTemplate.findFirst({ where: { id, deletedAt: null } });
  if (!row) throw Err.notFound("template not found");
  const t = now();
  await prisma.$transaction([
    prisma.course.updateMany({ where: { certificateTemplateId: id }, data: { certificateTemplateId: null, updatedAt: t } }),
    prisma.certificateTemplate.update({ where: { id }, data: { deletedAt: t, updatedAt: t } }),
  ]);
  return { ok: true };
}
