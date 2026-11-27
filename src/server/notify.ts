/**
 * A4 — learning notifications: an in-app notification (notifications table) and, for important
 * events, an e-mail. Each e-mail is claimed in email_log first (unique user + kind + ref), so a
 * retry or a second trigger never sends it twice.
 *
 * Runs after the response (next/server `after`) when called inside a request, and never throws:
 * a failed e-mail must not break enrolment, payment or progress.
 */
import { after } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma, newId, now } from "@/lib/db";
import { noticeMail, sendEmail } from "@/server/email";

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://laambad.online").replace(/\/$/, "");
}

export type NotifyEvent = {
  userId: string;
  kind:
    | "enrolled"
    | "payment_rejected"
    | "certificate"
    | "book"
    | "reminder"
    | "discussion_reply"
    | "quiz_passed"
    | "course_approved"
    | "course_changes"
    | "live_session"
    | "bundle"
    | "assignment_submitted"
    | "assignment_graded";
  ref: string;
  title: string;
  body: string;
  link?: string; // path on the site, e.g. /learn/<slug>
  email?: {
    subject: string;
    lines: string[];
    cta?: string; // button label (goes to link)
    reminder?: boolean; // learning reminder: respects the opt-out + adds an unsubscribe link
  };
};

/** Signed link to turn reminder e-mails off without signing in. */
export function unsubscribeToken(userId: string) {
  const secret = process.env.EMAIL_CODE_SECRET || process.env.JWT_SECRET || "dev-only";
  return createHmac("sha256", secret).update(`unsubscribe:${userId}`).digest("base64url").slice(0, 32);
}
export function checkUnsubscribeToken(userId: string, token: string) {
  const want = Buffer.from(unsubscribeToken(userId));
  const got = Buffer.from(String(token));
  return want.length === got.length && timingSafeEqual(want, got);
}

async function deliver(ev: NotifyEvent) {
  const t = now();
  try {
    await prisma.notification.create({
      data: {
        id: newId(),
        userId: ev.userId,
        type: ev.kind,
        title: ev.title.slice(0, 512),
        body: ev.body,
        meta: ev.link ? { link: ev.link } : undefined,
        createdAt: t,
        updatedAt: t,
      },
    });
  } catch (e) {
    console.error("[notify] in-app failed:", (e as { code?: string })?.code ?? (e as Error)?.message);
  }
  if (!ev.email) return;
  try {
    const user = await prisma.user.findFirst({
      where: { id: ev.userId, deletedAt: null, isActive: true },
      select: { id: true, name: true, email: true, emailVerifiedAt: true, emailRemindersOffAt: true },
    });
    if (!user?.email || !user.emailVerifiedAt) return; // only to confirmed addresses (no bounces / spam traps)
    if (ev.email.reminder && user.emailRemindersOffAt) return;
    // claim first: the unique index makes a second claim fail → nothing is sent twice
    const logId = newId();
    try {
      await prisma.emailLog.create({ data: { id: logId, userId: user.id, kind: ev.kind, refKey: ev.ref.slice(0, 120), createdAt: t } });
    } catch {
      return; // already sent (or being sent) for this event
    }
    const url = ev.link ? `${siteUrl()}${ev.link}` : siteUrl();
    const sent = await sendEmail(
      noticeMail({
        to: user.email,
        name: user.name,
        subject: ev.email.subject,
        title: ev.title,
        lines: ev.email.lines,
        cta: ev.email.cta ? { label: ev.email.cta, url } : undefined,
        unsubscribeUrl: ev.email.reminder
          ? `${siteUrl()}/api/email/unsubscribe?u=${user.id}&t=${unsubscribeToken(user.id)}`
          : undefined,
      })
    );
    await prisma.emailLog.update({ where: { id: logId }, data: { ok: sent.ok } });
  } catch (e) {
    console.error("[notify] e-mail failed:", (e as { code?: string })?.code ?? (e as Error)?.message);
  }
}

/** Queue a notification after the response (or run it now outside a request, e.g. the cron job). */
export function notify(ev: NotifyEvent) {
  try {
    after(() => deliver(ev));
  } catch {
    void deliver(ev);
  }
}

/** Same, but waits (for the cron job, which must finish its work before returning). */
export async function notifyNow(ev: NotifyEvent) {
  await deliver(ev);
}

// ── ready-made events ──

export function notifyEnrolled(userId: string, courseId: string) {
  try {
    after(async () => {
      const c = await prisma.course.findFirst({ where: { id: courseId }, select: { title: true, slug: true } }).catch(() => null);
      if (!c) return;
      await deliver({
        userId,
        kind: "enrolled",
        ref: courseId,
        title: `You're enrolled: ${c.title}`,
        body: "Your course is open. Start with the first lesson whenever you are ready.",
        link: `/learn/${encodeURIComponent(c.slug)}`,
        email: {
          subject: `You're enrolled in ${c.title}`,
          lines: [`Your access to "${c.title}" is active.`, "You can start learning right away — your progress is saved automatically."],
          cta: "Start learning",
        },
      });
    });
  } catch {
    /* outside a request: skip */
  }
}

export function notifyPaymentRejected(userId: string, paymentId: string, courseTitle: string, reason?: string) {
  notify({
    userId,
    kind: "payment_rejected",
    ref: paymentId,
    title: `Payment not confirmed: ${courseTitle}`,
    body: reason ? `Reason: ${reason}` : "We could not confirm your payment. Contact us if you already paid.",
    link: "/dashboard/payments",
    email: {
      subject: `We could not confirm your payment for ${courseTitle}`,
      lines: [
        `We could not confirm your payment for "${courseTitle}".`,
        ...(reason ? [`Reason: ${reason}`] : []),
        "If you already sent the money, reply on WhatsApp with the sender number or the transaction ID and we will check again.",
      ],
      cta: "See my payments",
    },
  });
}

export function notifyCertificate(userId: string, certificateId: string, courseTitle: string) {
  notify({
    userId,
    kind: "certificate",
    ref: certificateId,
    title: `Certificate ready: ${courseTitle}`,
    body: "Congratulations on finishing the course! Your certificate is ready to view and share.",
    link: `/dashboard/certificates/${certificateId}`,
    email: {
      subject: `🎓 Your certificate for ${courseTitle} is ready`,
      lines: [`Congratulations — you completed "${courseTitle}".`, "Your certificate is ready. You can download it and share its verification link."],
      cta: "View certificate",
    },
  });
}

export function notifyBook(userId: string, orderId: string, bookTitle: string) {
  notify({
    userId,
    kind: "book",
    ref: orderId,
    title: `Your book is ready: ${bookTitle}`,
    body: "Your payment was confirmed. Open Books → My purchases to read or download it.",
    link: "/dashboard/books",
    email: {
      subject: `Your book "${bookTitle}" is ready`,
      lines: [`Your payment for "${bookTitle}" was confirmed.`, "You can read it online or download it from Books."],
      cta: "Open my books",
    },
  });
}
