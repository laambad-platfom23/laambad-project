/**
 * A4 — daily learning reminders (Vercel Cron → GET /api/cron/reminders, Authorization: Bearer CRON_SECRET).
 *
 * Who gets one: active students with a confirmed e-mail who did not turn reminders off, have an
 * unfinished course they can access, and last learned between 7 and 60 days ago (long-dormant
 * accounts are not mailed). At most one reminder per student per ISO week (email_log), and at most
 * REMINDER_DAILY_MAX (default 40) per run so the e-mail quota is never exceeded.
 */
import { prisma } from "@/lib/db";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { notifyNow } from "@/server/notify";

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7);
  return `${y}-W${String(week).padStart(2, "0")}`;
}

type Candidate = { user_id: string; course_id: string; course_title: string; course_slug: string; last_active: Date };

export async function runReminders(opts: { dryRun?: boolean } = {}) {
  const max = Math.max(0, Math.min(500, Number(process.env.REMINDER_DAILY_MAX || 40)));
  const week = isoWeek(new Date());
  // last activity = newest of: learning day, lesson progress, enrolment date
  const rows = await prisma.$queryRaw<Candidate[]>`
    WITH last AS (
      SELECT e.user_id, e.course_id, c.title AS course_title, c.slug AS course_slug, e.enrolled_at,
             GREATEST(
               e.enrolled_at,
               COALESCE((SELECT max(ld.day)::timestamptz FROM learning_days ld WHERE ld.user_id = e.user_id), e.enrolled_at),
               COALESCE((SELECT max(lp.updated_at) FROM lesson_progresses lp WHERE lp.user_id = e.user_id), e.enrolled_at)
             ) AS last_active
        FROM enrollments e
        JOIN courses c ON c.id = e.course_id AND c.deleted_at IS NULL AND c.status = 'published'
        JOIN users u ON u.id = e.user_id
        JOIN roles r ON r.id = u.role_id AND r.slug = 'user'
       WHERE e.deleted_at IS NULL
         AND e.completed_at IS NULL
         AND lower(e.status) IN ('active','completed')
         AND lower(e.payment_status) IN ('paid','not_required','free')
         AND u.deleted_at IS NULL AND u.is_active
         AND u.email_verified_at IS NOT NULL
         AND u.email_reminders_off_at IS NULL
    ),
    pick AS (
      SELECT DISTINCT ON (user_id) user_id, course_id, course_title, course_slug, last_active
        FROM last
       ORDER BY user_id, enrolled_at DESC
    )
    SELECT p.* FROM pick p
     WHERE p.last_active < now() - interval '7 days'
       AND p.last_active > now() - interval '60 days'
       AND NOT EXISTS (SELECT 1 FROM email_log l WHERE l.user_id = p.user_id AND l.kind = 'reminder' AND l.ref_key = ${week})
     ORDER BY p.last_active DESC
     LIMIT ${max}`;

  if (opts.dryRun) return { week, candidates: rows.length, sent: 0 };
  let sent = 0;
  for (const r of rows) {
    const title = decodeHtmlEntities(r.course_title);
    await notifyNow({
      userId: r.user_id,
      kind: "reminder",
      ref: week,
      title: `Keep going with ${title}`,
      body: "You have not studied for a while. A few minutes today keeps your streak and your progress going.",
      link: `/learn/${encodeURIComponent(r.course_slug)}`,
      email: {
        subject: `Continue "${title}" on Laambad`,
        lines: [
          `We miss you! You have not opened "${title}" for a while.`,
          "Watch one lesson today — even 10 minutes keeps you moving towards your certificate.",
        ],
        cta: "Continue learning",
        reminder: true,
      },
    });
    sent++;
  }
  return { week, candidates: rows.length, sent };
}
