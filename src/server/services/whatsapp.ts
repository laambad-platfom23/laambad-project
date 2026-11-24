/**
 * A2 — WhatsApp (consent-based). Nothing is sent automatically: the student opts in with a number in
 * Settings, and staff open a pre-filled chat (https://wa.me/<number>?text=…) from the admin page.
 * Students who did not opt in (or opted out) are never listed.
 */
import { prisma, now } from "@/lib/db";
import { Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { normalizeSomaliMobile } from "@/server/waafipay";
import { learningDayKey } from "./learning";

/** Any international number (E.164 digits, 8–15), Somali numbers also without the country code. */
export function normalizeWhatsappNumber(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const somali = normalizeSomaliMobile(s);
  if (somali) return somali;
  let d = s.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (!s.startsWith("+") && !String(raw).trim().startsWith("00")) return null; // non-Somali: needs +country
  return /^[1-9]\d{7,14}$/.test(d) ? d : null;
}

export async function getMyWhatsapp(userId: string) {
  const u = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { whatsappPhone: true, whatsappConsentAt: true, phone: true },
  });
  if (!u) throw Err.notFound("user not found");
  return {
    consent: !!u.whatsappConsentAt,
    consent_at: u.whatsappConsentAt?.toISOString() ?? null,
    whatsapp_phone: u.whatsappPhone ? `+${u.whatsappPhone}` : null,
    suggested_phone: u.phone ?? null,
  };
}

/** Opt in (with a number) or opt out (consent=false clears the consent, keeps nothing to message). */
export async function setMyWhatsapp(userId: string, input: { consent?: boolean; whatsapp_phone?: string }) {
  const t = now();
  if (!input.consent) {
    await prisma.user.update({ where: { id: userId }, data: { whatsappConsentAt: null, updatedAt: t } });
    return getMyWhatsapp(userId);
  }
  const phone = normalizeWhatsappNumber(input.whatsapp_phone);
  if (!phone) throw Err.invalidInput("enter a valid WhatsApp number (e.g. 61 234 5678 or +44 …)");
  await prisma.user.update({
    where: { id: userId },
    data: { whatsappPhone: phone, whatsappConsentAt: t, updatedAt: t },
  });
  return getMyWhatsapp(userId);
}

const SEGMENTS = ["all", "inactive", "pending_payment", "not_started"] as const;
type Segment = (typeof SEGMENTS)[number];

function waLink(phone: string, text: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function firstName(name: string) {
  return (name || "").trim().split(/\s+/)[0] || "";
}

/**
 * Staff list of consenting students with a ready message per segment:
 *  - inactive: no learning activity for `days` days (default 7);
 *  - pending_payment: a course payment is waiting for verification;
 *  - not_started: enrolled but no lesson progress yet;
 *  - all: everyone who opted in.
 */
export async function adminContacts(
  user: AuthUser,
  opts: { segment?: string | null; days?: number; q?: string | null; site?: string }
) {
  const segment = (SEGMENTS as readonly string[]).includes(String(opts.segment)) ? (opts.segment as Segment) : "all";
  const days = Math.max(1, Math.min(90, Math.floor(Number(opts.days) || 7)));
  const site = opts.site || "https://laambad.online";
  const q = (opts.q ?? "").trim();

  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      whatsappConsentAt: { not: null },
      whatsappPhone: { not: null },
      ...(q
        ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
        : {}),
    },
    select: { id: true, name: true, email: true, whatsappPhone: true, whatsappConsentAt: true },
    orderBy: { whatsappConsentAt: "desc" },
    take: 1000,
  });
  const ids = users.map((u) => u.id);
  if (!ids.length) return { segment, days, total: 0, data: [] };

  const [lastDays, pending, enrollments, progressUsers] = await Promise.all([
    prisma.learningDay.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _max: { day: true } }),
    prisma.payment.findMany({
      where: { userId: { in: ids }, status: "pending", deletedAt: null },
      select: { userId: true, course: { select: { title: true } } },
    }),
    prisma.enrollment.findMany({
      where: { userId: { in: ids }, deletedAt: null, status: "active", paymentStatus: { in: ["paid", "not_required", "free"] } },
      select: { userId: true, course: { select: { id: true, title: true, slug: true } } },
    }),
    prisma.lessonProgress.findMany({
      where: { userId: { in: ids }, deletedAt: null },
      select: { userId: true },
      distinct: ["userId"],
    }),
  ]);
  const lastDay = new Map(lastDays.map((l) => [l.userId, l._max.day?.toISOString().slice(0, 10) ?? null]));
  const pendingBy = new Map<string, string[]>();
  for (const p of pending) {
    if (!p.userId) continue;
    pendingBy.set(p.userId, [...(pendingBy.get(p.userId) ?? []), decodeHtmlEntities(p.course?.title ?? "")]);
  }
  const coursesBy = new Map<string, { title: string; slug: string }[]>();
  for (const e of enrollments) {
    if (!e.course) continue;
    coursesBy.set(e.userId, [...(coursesBy.get(e.userId) ?? []), { title: decodeHtmlEntities(e.course.title), slug: e.course.slug }]);
  }
  const hasProgress = new Set(progressUsers.map((p) => p.userId));
  const cutoff = learningDayKey(new Date(Date.now() - days * 86_400_000));

  const rows = users
    .map((u) => {
      const last = lastDay.get(u.id) ?? null;
      const courses = coursesBy.get(u.id) ?? [];
      const pend = pendingBy.get(u.id) ?? [];
      const name = firstName(u.name);
      let message: string;
      let include = true;
      if (segment === "inactive") {
        include = courses.length > 0 && (!last || last < cutoff);
        message = `Asc ${name}, waan ku xiisnay! 📚 Muddo ma aadan barannin Laambad. Sii wad koorsadaada "${courses[0]?.title ?? ""}": ${site}/learn/${courses[0]?.slug ?? ""}`;
      } else if (segment === "pending_payment") {
        include = pend.length > 0;
        message = `Asc ${name}, codsigaaga lacag-bixinta ee "${pend[0] ?? ""}" waa nala soo gaarsiiyay. Fadlan noo soo dir lambarka aad lacagta ka dirtay ama sawirka rasiidka si aan u furno koorsada.`;
      } else if (segment === "not_started") {
        include = courses.length > 0 && !hasProgress.has(u.id);
        message = `Asc ${name}, ku soo dhawoow Laambad! 🎓 Weli ma aadan bilaabin "${courses[0]?.title ?? ""}". Halkan ka bilow: ${site}/learn/${courses[0]?.slug ?? ""}`;
      } else {
        message = `Asc ${name}, `;
      }
      return {
        include,
        row: {
          user_id: u.id,
          name: u.name,
          email: u.email,
          whatsapp_phone: `+${u.whatsappPhone}`,
          consent_at: u.whatsappConsentAt?.toISOString() ?? null,
          last_active_day: last,
          active_courses: courses.length,
          pending_payments: pend.length,
          message,
          wa_link: waLink(u.whatsappPhone!, message),
        },
      };
    })
    .filter((r) => r.include)
    .map((r) => r.row);

  void user;
  return { segment, days, total: rows.length, data: rows };
}
