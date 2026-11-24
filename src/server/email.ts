/**
 * Transactional e-mail through the Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email).
 * No SDK: one fetch call. Sender domain laambad.online is verified in Resend.
 *
 * Env (server only, from .env / process env — never sent to the browser):
 *   RESEND_API_KEY   required to send
 *   EMAIL_FROM       optional, default "Laambad <no-reply@laambad.online>"
 *   EMAIL_REPLY_TO   optional
 *
 * Without RESEND_API_KEY in development the message is printed to the server terminal instead,
 * so the flows can be tested locally. In production nothing is printed.
 */
const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Laambad <no-reply@laambad.online>";

export type Mail = { to: string; subject: string; html: string; text: string };

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim();
}

export async function sendEmail(mail: Mail): Promise<{ ok: boolean }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`\n[email:dev] RESEND_API_KEY not set — message NOT sent.\n  to: ${mail.to}\n  subject: ${mail.subject}\n${mail.text}\n`);
      return { ok: true };
    }
    console.error("[email] RESEND_API_KEY not set; cannot send");
    return { ok: false };
  }
  const body: Record<string, unknown> = {
    from: process.env.EMAIL_FROM?.trim() || DEFAULT_FROM,
    to: [mail.to],
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  };
  const replyTo = process.env.EMAIL_REPLY_TO?.trim();
  if (replyTo) body.reply_to = replyTo;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      // Resend's error body never contains the key; keep it short and do not log the recipient
      const msg = (await res.text().catch(() => "")).slice(0, 200);
      console.error(`[email] resend http ${res.status}: ${msg}`);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.error(`[email] resend request failed: ${(e as { name?: string })?.name ?? "error"}`);
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

// ── templates ──
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const CODE_FOOTER = "If you did not request this, you can ignore this e-mail. Nobody at Laambad will ever ask you for this code.";

function layout(title: string, inner: string, footerHtml: string = esc(CODE_FOOTER)) {
  return `<!doctype html><html><body style="margin:0;background:#EEF1F5;font-family:Arial,Helvetica,sans-serif;color:#0B1F3A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0B1F3A;padding:20px 28px;color:#ffffff;font-size:20px;font-weight:bold">Laambad<span style="color:#E84A27">.</span>
<div style="font-size:12px;font-weight:normal;color:#cbd5e1;margin-top:2px">E-learning platform</div></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font-size:20px">${esc(title)}</h1>
${inner}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">
${footerHtml}</td></tr>
</table></td></tr></table></body></html>`;
}

function codeBlock(code: string) {
  return `<div style="margin:20px 0;text-align:center"><span style="display:inline-block;letter-spacing:8px;font-size:32px;font-weight:bold;background:#f1f5f9;border-radius:12px;padding:14px 22px;font-family:'Courier New',monospace">${esc(code)}</span></div>`;
}

export function resetPasswordMail(input: { to: string; name: string; code: string; link: string; minutes: number }): Mail {
  const hi = input.name ? `Hi ${esc(input.name)},` : "Hi,";
  return {
    to: input.to,
    subject: `${input.code} is your Laambad password reset code`,
    html: layout(
      "Reset your password",
      `<p style="margin:0 0 8px;line-height:1.5">${hi}</p>
<p style="margin:0;line-height:1.5">Use this code to set a new password for your Laambad account:</p>
${codeBlock(input.code)}
<p style="text-align:center;margin:0 0 20px"><a href="${esc(input.link)}" style="display:inline-block;background:#E84A27;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:999px">Reset password</a></p>
<p style="margin:0;font-size:13px;color:#64748b;line-height:1.5">The code and the button work once and expire in ${input.minutes} minutes.</p>`
    ),
    text: `${input.name ? `Hi ${input.name},` : "Hi,"}\n\nYour Laambad password reset code: ${input.code}\nOr open: ${input.link}\n\nIt works once and expires in ${input.minutes} minutes. If you did not request this, ignore this e-mail.`,
  };
}

export function verifyEmailMail(input: { to: string; name: string; code: string; minutes: number }): Mail {
  const hi = input.name ? `Hi ${esc(input.name)},` : "Hi,";
  return {
    to: input.to,
    subject: `${input.code} is your Laambad verification code`,
    html: layout(
      "Verify your e-mail",
      `<p style="margin:0 0 8px;line-height:1.5">${hi}</p>
<p style="margin:0;line-height:1.5">Enter this code on Laambad to confirm your e-mail address:</p>
${codeBlock(input.code)}
<p style="margin:0;font-size:13px;color:#64748b;line-height:1.5">The code expires in ${input.minutes} minutes.</p>`
    ),
    text: `${input.name ? `Hi ${input.name},` : "Hi,"}\n\nYour Laambad verification code: ${input.code}\n\nIt expires in ${input.minutes} minutes. If you did not request this, ignore this e-mail.`,
  };
}

/**
 * A4: a general notice (enrolment, payment, certificate, book, reminder) with one button.
 * Every value is escaped; links are built by the server.
 */
export function noticeMail(input: {
  to: string;
  name: string;
  subject: string;
  title: string;
  lines: string[];
  cta?: { label: string; url: string };
  unsubscribeUrl?: string;
}): Mail {
  const hi = input.name ? `Hi ${esc(input.name)},` : "Hi,";
  const body = input.lines.map((l) => `<p style="margin:0 0 10px;line-height:1.55">${esc(l)}</p>`).join("\n");
  const button = input.cta
    ? `<p style="text-align:center;margin:20px 0 4px"><a href="${esc(input.cta.url)}" style="display:inline-block;background:#E84A27;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:999px">${esc(input.cta.label)}</a></p>`
    : "";
  const footer = input.unsubscribeUrl
    ? `You receive learning reminders from Laambad. <a href="${esc(input.unsubscribeUrl)}" style="color:#64748b">Stop these reminders</a>.`
    : "This is an automatic message about your Laambad account.";
  return {
    to: input.to,
    subject: input.subject,
    html: layout(input.title, `<p style="margin:0 0 10px;line-height:1.5">${hi}</p>
${body}
${button}`, footer),
    text: [
      input.name ? `Hi ${input.name},` : "Hi,",
      "",
      ...input.lines,
      ...(input.cta ? ["", `${input.cta.label}: ${input.cta.url}`] : []),
      ...(input.unsubscribeUrl ? ["", `Stop these reminders: ${input.unsubscribeUrl}`] : []),
    ].join("\n"),
  };
}
