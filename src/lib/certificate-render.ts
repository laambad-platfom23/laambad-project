/**
 * Draws the Laambad certificate (Tutor template tutor_cb_25649, 1139×880) on a <canvas>, so the page,
 * the PNG download and the PDF download are the very same picture. No dependencies: the PDF is a
 * single-page US-letter landscape file that embeds the JPEG (letter 792×612pt has the same 1.294
 * aspect ratio as the 1139×880 template, so nothing is stretched or cropped).
 */
import { encodeQr } from "@/lib/qr";
import type { Certificate } from "@/types";

export const CERT_W = 1139;
export const CERT_H = 880;

export type CertificateFonts = { script: string; body: string; mono: string };

/**
 * A5 certificate builder: everything a template may change. Missing values fall back to the
 * Laambad default (the old Tutor template), so a certificate without a template looks as before.
 */
export type CertificateDesign = {
  background: string;
  ribbon: string;
  frame: string;
  accent: string; // line under the signature
  heading: string; // ribbon text
  name_color: string;
  text_color: string;
  completed_text: string;
  body_text: string;
  partner_logo_url: string; // ribbon logo
  brand_logo_url: string; // top logo
  signature_url: string;
  signer_name: string;
  signer_title: string;
  show_qr: boolean;
  show_duration: boolean;
  show_pattern: boolean;
};

export const DEFAULT_CERTIFICATE_DESIGN: CertificateDesign = {
  background: "#f7f7fb",
  ribbon: "#e9eaf7",
  frame: "#e6e6f0",
  accent: "#1e1b4b",
  heading: "VERIFIED\nCERTIFICATE",
  name_color: "#141325",
  text_color: "#555557",
  completed_text: "Has Successfully Completed",
  body_text:
    "an online non-Credit Course Authorized by Benaadir Research, Consultancy and Evaluation center, Offered through Laambad E-Learning Platform.",
  partner_logo_url: "/certificates/benaadir-logo.png",
  brand_logo_url: "/certificates/laambad-logo.png",
  signature_url: "/certificates/director-signature.png",
  signer_name: "Abdinor Abukar Ahmed",
  signer_title: "Director",
  show_qr: true,
  show_duration: true,
  show_pattern: true,
};

export function resolveDesign(d?: Partial<CertificateDesign> | null): CertificateDesign {
  const out = { ...DEFAULT_CERTIFICATE_DESIGN };
  for (const [k, v] of Object.entries(d ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

const ARIAL = "Arial, Helvetica, sans-serif";

function longDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // uploaded logos come from the CDN: ask for CORS so the canvas can still be exported
    if (/^https?:/i.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Draw an image "object-fit: contain" inside a box. */
function drawContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, w: number, h: number) {
  if (!img) return;
  const r = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * r;
  const dh = img.naturalHeight * r;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

type TextOpts = {
  font: string;
  size: number;
  color?: string;
  weight?: number | string;
  lineHeight?: number; // multiple of size
  align?: "left" | "center";
  letterSpacing?: number;
  maxLines?: number;
};

function setFont(ctx: CanvasRenderingContext2D, o: TextOpts, size = o.size) {
  ctx.font = `${o.weight ?? 400} ${size}px ${o.font}`;
  ctx.fillStyle = o.color ?? "#000";
  ctx.textBaseline = "alphabetic";
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = `${o.letterSpacing ?? 0}px`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= width || !line) line = test;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Text in a CSS-like box: line-height with half-leading, word wrap, left/center alignment. */
function textBox(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, o: TextOpts) {
  setFont(ctx, o);
  const lh = (o.lineHeight ?? 1.4) * o.size;
  let lines = text.split("\n").flatMap((p) => wrap(ctx, p, w));
  if (o.maxLines && lines.length > o.maxLines) lines = lines.slice(0, o.maxLines);
  lines.forEach((line, i) => {
    const m = ctx.measureText(line);
    const ascent = m.fontBoundingBoxAscent ?? o.size * 0.8;
    const descent = m.fontBoundingBoxDescent ?? o.size * 0.2;
    const baseline = y + i * lh + (lh - (ascent + descent)) / 2 + ascent;
    const dx = o.align === "center" ? x + (w - m.width) / 2 : x;
    ctx.fillText(line, dx, baseline);
  });
}

/** Largest font size (≤ max) at which the text fits in `maxLines` lines of width w. */
function fitSize(ctx: CanvasRenderingContext2D, text: string, w: number, o: TextOpts, min: number) {
  for (let s = o.size; s >= min; s -= 2) {
    setFont(ctx, o, s);
    if (wrap(ctx, text, w).length <= (o.maxLines ?? 1)) return s;
  }
  return min;
}

export async function renderCertificate(
  cert: Certificate,
  fonts: CertificateFonts,
  scale = 2,
  verifyUrl: string,
  designIn?: Partial<CertificateDesign> | null,
): Promise<HTMLCanvasElement> {
  const design = resolveDesign(designIn ?? cert.design);
  const families = [fonts.script, fonts.body, fonts.mono];
  await Promise.all(families.map((f) => document.fonts.load(`40px ${f}`).catch(() => undefined)));
  await document.fonts.ready;

  const [benaadir, laambad, signature] = await Promise.all([
    loadImage(design.partner_logo_url),
    loadImage(design.brand_logo_url),
    loadImage(design.signature_url),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(CERT_W * scale);
  canvas.height = Math.round(CERT_H * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.imageSmoothingQuality = "high";

  // background + subtle diagonal pattern
  ctx.fillStyle = design.background;
  ctx.fillRect(0, 0, CERT_W, CERT_H);
  ctx.save();
  if (design.show_pattern) {
  ctx.strokeStyle = "rgba(30,27,75,0.035)";
  ctx.lineWidth = 2;
  for (let d = -CERT_H; d < CERT_W; d += 22) {
    ctx.beginPath();
    ctx.moveTo(d, CERT_H);
    ctx.lineTo(d + CERT_H, 0);
    ctx.stroke();
  }
  const glow = ctx.createRadialGradient(CERT_W * 0.78, CERT_H * 0.22, 0, CERT_W * 0.78, CERT_H * 0.22, CERT_W * 0.45);
  glow.addColorStop(0, "rgba(99,102,241,0.06)");
  glow.addColorStop(1, "rgba(99,102,241,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CERT_W, CERT_H);
  }
  ctx.restore();

  // inner frame
  ctx.strokeStyle = design.frame;
  ctx.lineWidth = 1;
  ctx.strokeRect(20.5, 20.5, CERT_W - 41, CERT_H - 41);

  // left ribbon
  ctx.fillStyle = design.ribbon;
  ctx.beginPath();
  ctx.moveTo(70, 0);
  ctx.lineTo(306, 0);
  ctx.lineTo(306, 423);
  ctx.lineTo(188, 470);
  ctx.lineTo(70, 423);
  ctx.closePath();
  ctx.fill();

  textBox(ctx, design.heading.replace(/\\n/g, "\n"), 124, 119, 133, { font: ARIAL, size: 18, color: "#6e7587", align: "center", letterSpacing: 0.5 });
  drawContain(ctx, benaadir, 65, 216, 243, 253);
  textBox(ctx, cert.verification_id, 88, 498, 240, { font: fonts.mono, size: 16, color: "#000", letterSpacing: 0.3 });
  drawContain(ctx, laambad, 363, 28, 300, 108);

  // QR (quiet zone 2 modules, white background)
  if (design.show_qr) {
  const qr = encodeQr(verifyUrl);
  const n = qr.length + 4;
  const cell = 72 / n;
  ctx.fillStyle = "#fff";
  ctx.fillRect(1028, 38, 72, 72);
  ctx.fillStyle = "#000";
  qr.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) ctx.fillRect(1028 + (x + 2) * cell, 38 + (y + 2) * cell, cell + 0.02, cell + 0.02);
    }),
  );
  }

  const name = cert.student_name || cert.user?.name || "";
  const course = cert.course_title || cert.course?.title || "";
  const nameOpts: TextOpts = { font: fonts.script, size: 50, color: design.name_color, maxLines: 1 };
  textBox(ctx, name, 343, 217, 757, { ...nameOpts, size: fitSize(ctx, name, 757, nameOpts, 30) });
  textBox(ctx, design.completed_text, 350, 327, 521, { font: ARIAL, size: 16, letterSpacing: 1 });
  const courseOpts: TextOpts = { font: fonts.script, size: 36, color: design.name_color, maxLines: 2 };
  textBox(ctx, course, 350, 370, 706, { ...courseOpts, size: fitSize(ctx, course, 706, courseOpts, 24) });
  textBox(
    ctx,
    design.body_text,
    356,
    479,
    475,
    { font: fonts.body, size: 18, color: design.text_color, lineHeight: 1.5, maxLines: 6 },
  );

  textBox(ctx, "Course completed on", 386, 723, 206, { font: ARIAL, size: 18, color: "#312627" });
  textBox(ctx, longDate(cert.completed_at || cert.issued_at), 593, 724, 260, { font: ARIAL, size: 18, weight: 600 });
  if (cert.duration && design.show_duration) {
    textBox(ctx, "Course Duration", 386, 757, 174, { font: ARIAL, size: 18, color: "#312627" });
    textBox(ctx, cert.duration, 540, 758, 280, { font: ARIAL, size: 18, weight: 500 });
  }

  drawContain(ctx, signature, 838, 636, 234, 133);
  textBox(ctx, design.signer_name, 790, 724, 317, { font: ARIAL, size: 18, color: "#312627", align: "center", maxLines: 1 });
  textBox(ctx, design.signer_title, 820, 761, 257, { font: ARIAL, size: 13, color: "#312627", align: "center", maxLines: 1 });
  ctx.fillStyle = design.accent;
  ctx.beginPath();
  ctx.roundRect?.(837, 808, 244, 4, 2);
  if (!ctx.roundRect) ctx.rect(837, 808, 244, 4);
  ctx.fill();

  return canvas;
}

// ---- PDF (one page, US letter landscape, embedded JPEG)
function pdfFromJpeg(jpeg: Uint8Array, imgW: number, imgH: number): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const add = (p: Uint8Array | string) => {
    const b = typeof p === "string" ? enc.encode(p) : p;
    parts.push(b);
    length += b.length;
  };
  const obj = (n: number, body: string) => {
    offsets[n] = length;
    add(`${n} 0 obj\n${body}\nendobj\n`);
  };
  const W = 792;
  const H = 612;
  add("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  add(jpeg);
  add("\nendstream\nendobj\n");
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = length;
  let table = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) table += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  add(table);
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("render failed"))), type, quality));
}

export async function certificatePdf(canvas: HTMLCanvasElement): Promise<Blob> {
  const jpeg = new Uint8Array(await (await canvasBlob(canvas, "image/jpeg", 0.95)).arrayBuffer());
  return pdfFromJpeg(jpeg, canvas.width, canvas.height);
}

export function certificatePng(canvas: HTMLCanvasElement): Promise<Blob> {
  return canvasBlob(canvas, "image/png");
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function certificateFileName(cert: Certificate, ext: "pdf" | "png") {
  const slug = (cert.course?.slug || cert.course_title || "course")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `Laambad-Certificate-${slug}-${cert.verification_id}.${ext}`;
}
