/**
 * A2 — Books (PDF): free or paid. Admins publish them; students read / download them.
 *
 * Security:
 *  - the stored file location (books.file_url) is NEVER sent to the browser; the PDF is streamed
 *    through GET /api/v1/books/:id/file after an access check;
 *  - on Vercel the PDF goes to Blob under books-private/<book id>/<256-bit random>.pdf (unguessable);
 *    locally it is written to .private-uploads/ (outside public/);
 *  - paid access only after an APPROVED WaafiPay answer or an admin approval of a manual EVC request.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma, newId, now } from "@/lib/db";
import { ApiError, Err } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/request";
import { fromMinor, toMinor } from "@/server/money";
import { isWaafiPayConfigured, normalizeSomaliMobile, waafiPurchase } from "@/server/waafipay";
import { slugify } from "./learning-paths";
import { assertUuid, isUuid } from "@/lib/uuid";

const MAX_PDF_BYTES = 200 * 1024 * 1024;
const MAX_SERVER_UPLOAD = 4 * 1024 * 1024; // Vercel functions accept ~4.5 MB request bodies
const LOCAL_DIR = path.join(process.cwd(), ".private-uploads", "books");
const BLOB_PREFIX = "books-private";

type BookRow = NonNullable<Awaited<ReturnType<typeof prisma.book.findFirst>>>;

async function uniqueBookSlug(base: string, exceptId?: string) {
  let slug = slugify(base);
  for (let i = 2; i < 50; i++) {
    const taken = await prisma.book.findFirst({ where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) } });
    if (!taken) return slug;
    slug = `${slugify(base)}-${i}`;
  }
  return `${slugify(base)}-${newId().slice(0, 6)}`;
}

function priceMinor(b: Pick<BookRow, "isFree" | "price">) {
  return b.isFree ? 0 : toMinor(b.price);
}

/** Has this user paid for / may read this book? */
async function hasAccess(user: AuthUser, b: BookRow) {
  if (user.role === "admin") return true;
  if (b.status !== "published" || b.deletedAt) return false;
  if (priceMinor(b) === 0) return true;
  const paid = await prisma.bookOrder.findFirst({
    where: { bookId: b.id, userId: user.user_id, status: "paid" },
    select: { id: true },
  });
  return !!paid;
}

function view(b: BookRow, extra?: { owned?: boolean; pending?: boolean; admin?: boolean }) {
  return {
    id: b.id,
    title: b.title,
    slug: b.slug,
    author: b.author,
    description: b.description,
    cover_url: b.coverUrl,
    is_free: priceMinor(b) === 0,
    price: priceMinor(b), // cents
    currency: b.currency,
    status: b.status,
    has_file: !!b.fileUrl,
    file_size: b.fileSize != null ? Number(b.fileSize) : null,
    created_at: b.createdAt.toISOString(),
    ...(extra?.owned !== undefined ? { owned: extra.owned } : {}),
    ...(extra?.pending !== undefined ? { payment_pending: extra.pending } : {}),
    ...(extra?.admin ? { file_name: b.fileName } : {}),
  };
}

async function ownership(userId: string, bookIds: string[]) {
  if (!bookIds.length) return { paid: new Set<string>(), pending: new Set<string>() };
  const rows = await prisma.bookOrder.findMany({
    where: { userId, bookId: { in: bookIds }, status: { in: ["paid", "pending"] } },
    select: { bookId: true, status: true },
  });
  return {
    paid: new Set(rows.filter((r) => r.status === "paid").map((r) => r.bookId)),
    pending: new Set(rows.filter((r) => r.status === "pending").map((r) => r.bookId)),
  };
}

/** Public list (published) — with owned flags when signed in; admins see every book. */
export async function listBooks(user: AuthUser | null) {
  const admin = user?.role === "admin";
  const rows = await prisma.book.findMany({
    where: { deletedAt: null, ...(admin ? {} : { status: "published" }) },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  if (!user) return rows.map((b) => view(b));
  const own = await ownership(user.user_id, rows.map((r) => r.id));
  return rows.map((b) =>
    view(b, {
      owned: admin || priceMinor(b) === 0 || own.paid.has(b.id),
      pending: own.pending.has(b.id),
      admin,
    })
  );
}

export async function getBook(user: AuthUser | null, slugOrId: string) {
  const b = await prisma.book.findFirst({ where: { deletedAt: null, ...(isUuid(slugOrId) ? { id: slugOrId } : { slug: slugOrId }) } });
  const admin = user?.role === "admin";
  if (!b || (!admin && b.status !== "published")) throw Err.notFound("book not found");
  if (!user) return view(b);
  const own = await ownership(user.user_id, [b.id]);
  return view(b, { owned: admin || priceMinor(b) === 0 || own.paid.has(b.id), pending: own.pending.has(b.id), admin });
}

/** Books the user can read (free ones they opened are not tracked: this lists purchases). */
export async function myBooks(user: AuthUser) {
  const orders = await prisma.bookOrder.findMany({
    where: { userId: user.user_id, status: { in: ["paid", "pending"] } },
    orderBy: { createdAt: "desc" },
    include: { book: true },
  });
  const seen = new Set<string>();
  const out = [];
  for (const o of orders) {
    if (!o.book || o.book.deletedAt || seen.has(o.bookId)) continue;
    seen.add(o.bookId);
    out.push(view(o.book, { owned: o.status === "paid", pending: o.status === "pending" }));
  }
  return out;
}

// ── Admin ──

type BookInput = {
  title?: string;
  slug?: string;
  author?: string | null;
  description?: string | null;
  cover_url?: string | null;
  is_free?: boolean;
  price?: number; // cents
  status?: string;
};

function cleanBook(input: BookInput) {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const t = String(input.title).trim();
    if (!t) throw Err.invalidInput("title is required");
    data.title = t.slice(0, 255);
  }
  if (input.author !== undefined) data.author = input.author ? String(input.author).trim().slice(0, 255) : null;
  if (input.description !== undefined) data.description = input.description ? String(input.description).slice(0, 20_000) : null;
  if (input.cover_url !== undefined) {
    const c = String(input.cover_url ?? "").trim();
    if (c && !/^https?:\/\//i.test(c) && !c.startsWith("/")) throw Err.invalidInput("cover must be a URL");
    data.coverUrl = c ? c.slice(0, 1024) : null;
  }
  if (input.price !== undefined) {
    const cents = Math.round(Number(input.price));
    if (!Number.isFinite(cents) || cents < 0 || cents > 100_000_00) throw Err.invalidInput("invalid price");
    data.price = fromMinor(cents);
  }
  if (input.is_free !== undefined) data.isFree = !!input.is_free;
  if (input.status !== undefined) {
    if (!["draft", "published"].includes(String(input.status))) throw Err.invalidInput("invalid status");
    data.status = String(input.status);
  }
  return data;
}

export async function createBook(user: AuthUser, input: BookInput) {
  const data = cleanBook(input);
  if (!data.title) throw Err.invalidInput("title is required");
  if (data.isFree === false && !(data.price && toMinor(data.price as never) > 0)) {
    throw Err.invalidInput("a paid book needs a price");
  }
  const t = now();
  const row = await prisma.book.create({
    data: {
      id: newId(),
      slug: await uniqueBookSlug(input.slug?.trim() || String(data.title)),
      createdBy: user.user_id,
      createdAt: t,
      updatedAt: t,
      ...(data as { title: string }),
    },
  });
  return view(row, { admin: true });
}

export async function updateBook(id: string, input: BookInput) {
  assertUuid(id, "book not found");
  const b = await prisma.book.findFirst({ where: { id, deletedAt: null } });
  if (!b) throw Err.notFound("book not found");
  const data = cleanBook(input);
  if (input.slug !== undefined && input.slug.trim() && slugify(input.slug) !== b.slug) {
    data.slug = await uniqueBookSlug(input.slug, id);
  }
  const isFree = (data.isFree as boolean | undefined) ?? b.isFree;
  const price = data.price !== undefined ? toMinor(data.price as never) : toMinor(b.price);
  if (!isFree && price <= 0) throw Err.invalidInput("a paid book needs a price");
  const status = (data.status as string | undefined) ?? b.status;
  if (status === "published" && !b.fileUrl) throw Err.invalidInput("upload the PDF before publishing");
  const row = await prisma.book.update({ where: { id }, data: { ...data, updatedAt: now() } });
  return view(row, { admin: true });
}

export async function deleteBook(id: string) {
  assertUuid(id, "book not found");
  const b = await prisma.book.findFirst({ where: { id, deletedAt: null } });
  if (!b) throw Err.notFound("book not found");
  await prisma.book.update({ where: { id }, data: { deletedAt: now(), status: "draft", updatedAt: now() } });
  return { ok: true };
}

function isPdf(buf: Uint8Array) {
  return buf.length > 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46; // %PDF
}
function safeFileName(name: string) {
  return (name || "book.pdf").replace(/[^\w.\- ]+/g, "_").slice(0, 200) || "book.pdf";
}

/**
 * Step 1 of an upload. On Vercel (Blob configured) returns a short-lived client token that only
 * allows one PDF at one random path; the browser uploads straight to Blob (no 4.5 MB limit).
 * Without Blob (local dev) the browser posts the file to the server instead.
 */
export async function uploadTicket(bookId: string) {
  assertUuid(bookId, "book not found");
  const b = await prisma.book.findFirst({ where: { id: bookId, deletedAt: null }, select: { id: true } });
  if (!b) throw Err.notFound("book not found");
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { mode: "server" as const, max_bytes: MAX_PDF_BYTES };
  const { generateClientTokenFromReadWriteToken } = await import("@vercel/blob/client");
  const pathname = `${BLOB_PREFIX}/${b.id}/${randomBytes(32).toString("hex")}.pdf`;
  const token = await generateClientTokenFromReadWriteToken({
    token: process.env.BLOB_READ_WRITE_TOKEN,
    pathname,
    allowedContentTypes: ["application/pdf"],
    maximumSizeInBytes: MAX_PDF_BYTES,
    validUntil: Date.now() + 15 * 60_000,
    addRandomSuffix: false,
  });
  return { mode: "blob" as const, pathname, token, max_bytes: MAX_PDF_BYTES };
}

/** Step 2 (Blob mode): attach the uploaded blob to the book after checking where it lives. */
export async function attachBlobFile(bookId: string, input: { url?: string; file_name?: string; size?: number }) {
  assertUuid(bookId, "book not found");
  const b = await prisma.book.findFirst({ where: { id: bookId, deletedAt: null } });
  if (!b) throw Err.notFound("book not found");
  let u: URL;
  try {
    u = new URL(String(input.url ?? ""));
  } catch {
    throw Err.invalidInput("invalid file url");
  }
  const okHost = u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com");
  const okPath = new RegExp(`^/${BLOB_PREFIX}/${b.id}/[0-9a-f]{64}\\.pdf$`).test(u.pathname);
  if (!okHost || !okPath) throw Err.invalidInput("file must be uploaded through the book upload");
  // confirm it really is a PDF
  const head = await fetch(u.toString(), { headers: { Range: "bytes=0-7" } }).catch(() => null);
  if (!head || !head.ok) throw Err.invalidInput("uploaded file not found");
  const first = new Uint8Array(await head.arrayBuffer());
  if (!isPdf(first)) throw Err.invalidInput("the file is not a PDF");
  const size = Math.max(0, Math.floor(Number(input.size) || 0));
  const row = await prisma.book.update({
    where: { id: b.id },
    data: { fileUrl: `${u.origin}${u.pathname}`, fileName: safeFileName(String(input.file_name ?? "")), fileSize: size ? BigInt(size) : null, updatedAt: now() },
  });
  return view(row, { admin: true });
}

/** Server-side upload (local dev, or small files when Blob is configured). */
export async function uploadServerFile(bookId: string, file: File) {
  assertUuid(bookId, "book not found");
  const b = await prisma.book.findFirst({ where: { id: bookId, deletedAt: null } });
  if (!b) throw Err.notFound("book not found");
  if (file.size > (process.env.BLOB_READ_WRITE_TOKEN ? MAX_SERVER_UPLOAD : MAX_PDF_BYTES)) {
    throw Err.invalidInput("file too large for this upload");
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  if (!isPdf(buf)) throw Err.invalidInput("the file is not a PDF");
  const name = `${randomBytes(32).toString("hex")}.pdf`;
  let fileUrl: string;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`${BLOB_PREFIX}/${b.id}/${name}`, Buffer.from(buf), {
      access: "public",
      contentType: "application/pdf",
      addRandomSuffix: false,
    });
    fileUrl = blob.url;
  } else {
    await mkdir(LOCAL_DIR, { recursive: true });
    await writeFile(path.join(LOCAL_DIR, name), buf);
    fileUrl = `local:${name}`;
  }
  const row = await prisma.book.update({
    where: { id: b.id },
    data: { fileUrl, fileName: safeFileName(file.name), fileSize: BigInt(file.size), updatedAt: now() },
  });
  return view(row, { admin: true });
}

/** Stream the PDF to a user who may read it. The storage URL never leaves the server. */
export async function streamFile(user: AuthUser, bookId: string, download: boolean): Promise<Response> {
  assertUuid(bookId, "book not found");
  const b = await prisma.book.findFirst({ where: { id: bookId, deletedAt: null } });
  if (!b || !b.fileUrl) throw Err.notFound("book not found");
  if (!(await hasAccess(user, b))) {
    throw new ApiError(402, "payment_required", "buy this book to read it");
  }
  const fileName = (b.fileName || `${b.slug}.pdf`).replace(/"/g, "");
  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (b.fileUrl.startsWith("local:")) {
    const name = b.fileUrl.slice("local:".length);
    if (!/^[0-9a-f]{64}\.pdf$/.test(name)) throw Err.notFound("book not found");
    const data = await readFile(path.join(LOCAL_DIR, name)).catch(() => null);
    if (!data) throw Err.notFound("book file missing");
    headers.set("Content-Length", String(data.length));
    return new Response(new Uint8Array(data), { status: 200, headers });
  }
  const upstream = await fetch(b.fileUrl).catch(() => null);
  if (!upstream || !upstream.ok || !upstream.body) throw new ApiError(502, "file_unavailable", "could not load the book, try again");
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  return new Response(upstream.body, { status: 200, headers });
}

// ── Buying ──

function orderView(o: { id: string; bookId: string; amount: Parameters<typeof toMinor>[0]; currency: string; status: string; provider: string }) {
  return { id: o.id, book_id: o.bookId, amount: toMinor(o.amount), currency: o.currency, status: o.status, provider: o.provider };
}

async function buyable(user: AuthUser, bookId: string) {
  assertUuid(bookId, "book not found");
  const b = await prisma.book.findFirst({ where: { id: bookId, deletedAt: null, status: "published" } });
  if (!b) throw Err.notFound("book not found");
  const paid = await prisma.bookOrder.findFirst({ where: { bookId, userId: user.user_id, status: "paid" } });
  if (paid) throw Err.conflict("already_owned", "you already have this book");
  return b;
}

/** WaafiPay (EVC Plus / Zaad / Sahal / eDahab) — same guards as the course checkout. */
export async function payWithWaafi(user: AuthUser, bookId: string, input: { phone?: string }) {
  const b = await buyable(user, bookId);
  const amount = priceMinor(b);
  if (amount === 0) throw Err.conflict("free_book", "this book is free");
  if (!isWaafiPayConfigured()) {
    throw new ApiError(503, "waafipay_not_configured", "WaafiPay is not available right now. Please use manual payment.");
  }
  if (b.currency.toUpperCase() !== "USD") throw Err.invalidInput("WaafiPay accepts USD only");
  const msisdn = normalizeSomaliMobile(input.phone);
  if (!msisdn) throw Err.invalidInput("enter a valid Somali mobile number (e.g. 61 234 5678)");

  const t = now();
  const recent = await prisma.bookOrder.findMany({
    where: { userId: user.user_id, provider: "wafi", createdAt: { gte: new Date(t.getTime() - 10 * 60_000) } },
    select: { bookId: true, status: true, createdAt: true },
  });
  if (recent.length >= 5) throw new ApiError(429, "too_many_attempts", "Too many payment attempts. Please wait a few minutes.");
  if (recent.some((r) => r.bookId === bookId && r.status === "pending" && r.createdAt >= new Date(t.getTime() - 3 * 60_000))) {
    throw Err.conflict("payment_in_progress", "A payment for this book is already waiting for your PIN.");
  }

  const row = await prisma.bookOrder.create({
    data: {
      id: newId(),
      bookId,
      userId: user.user_id,
      amount: fromMinor(amount),
      currency: b.currency,
      status: "pending",
      provider: "wafi",
      providerRefId: msisdn,
      createdAt: t,
      updatedAt: t,
    },
  });
  const outcome = await waafiPurchase({
    msisdn,
    amountMinor: amount,
    currency: b.currency,
    referenceId: row.id,
    invoiceId: row.id.replace(/-/g, "").slice(0, 20),
    description: `Laambad book: ${b.title}`.slice(0, 100),
  });
  const t2 = now();
  if (outcome.kind === "approved") {
    await prisma.bookOrder.updateMany({
      where: { id: row.id, status: "pending" },
      data: { status: "paid", paidAt: t2, transactionId: outcome.transactionId || null, updatedAt: t2 },
    });
    return { ...orderView({ ...row, status: "paid" }), outcome: "approved" as const, message: "Payment received. Your book is ready." };
  }
  if (outcome.kind === "declined") {
    await prisma.bookOrder.updateMany({
      where: { id: row.id, status: "pending" },
      data: { status: "failed", note: `waafipay ${outcome.code}: ${outcome.message}`.slice(0, 500), updatedAt: t2 },
    });
    return { ...orderView({ ...row, status: "failed" }), outcome: "declined" as const, message: outcome.message };
  }
  return {
    ...orderView(row),
    outcome: "unknown" as const,
    message: "We could not confirm the payment yet. If money was taken, the book will open after we verify it.",
  };
}

/** Manual EVC request: the student sends money and tells us the sender number; an admin approves. */
export async function requestManual(user: AuthUser, bookId: string, input: { sender_phone?: string; reference?: string }) {
  const b = await buyable(user, bookId);
  const amount = priceMinor(b);
  if (amount === 0) throw Err.conflict("free_book", "this book is free");
  const sender = normalizeSomaliMobile(input.sender_phone);
  if (!sender) throw Err.invalidInput("enter a valid Somali mobile number for the sender");
  const reference = (input.reference ?? "").replace(/[^\w\-./ #]/g, "").trim().slice(0, 64) || null;
  const t = now();
  const open = await prisma.bookOrder.findFirst({
    where: { bookId, userId: user.user_id, provider: "offline", status: "pending" },
  });
  const row = open
    ? await prisma.bookOrder.update({
        where: { id: open.id },
        data: { amount: fromMinor(amount), providerRefId: sender, transactionId: reference ?? open.transactionId, updatedAt: t },
      })
    : await prisma.bookOrder.create({
        data: {
          id: newId(),
          bookId,
          userId: user.user_id,
          amount: fromMinor(amount),
          currency: b.currency,
          status: "pending",
          provider: "offline",
          providerRefId: sender,
          transactionId: reference,
          createdAt: t,
          updatedAt: t,
        },
      });
  return orderView(row);
}

export async function adminOrders(status?: string | null) {
  const rows = await prisma.bookOrder.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      book: { select: { id: true, title: true, slug: true } },
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  });
  return rows.map((o) => ({
    ...orderView(o),
    book_title: o.book?.title,
    book_slug: o.book?.slug,
    student_name: o.user?.name,
    student_email: o.user?.email,
    student_phone: o.user?.phone ?? undefined,
    payer_phone: o.providerRefId && /^252\d{9}$/.test(o.providerRefId) ? `+${o.providerRefId}` : undefined,
    transaction_id: o.transactionId ?? undefined,
    note: o.note ?? undefined,
    paid_at: o.paidAt?.toISOString() ?? null,
    created_at: o.createdAt.toISOString(),
  }));
}

export async function adminApproveOrder(id: string, reference?: string) {
  assertUuid(id, "order not found");
  const o = await prisma.bookOrder.findFirst({ where: { id } });
  if (!o) throw Err.notFound("order not found");
  if (o.status === "paid") return { ok: true, already: true };
  const ref = (reference ?? "").replace(/[^\w\-./ #]/g, "").trim().slice(0, 64);
  const t = now();
  await prisma.bookOrder.update({
    where: { id },
    data: { status: "paid", paidAt: t, updatedAt: t, ...(ref ? { transactionId: ref } : {}) },
  });
  return { ok: true };
}

export async function adminRejectOrder(id: string, reason?: string) {
  assertUuid(id, "order not found");
  const o = await prisma.bookOrder.findFirst({ where: { id } });
  if (!o) throw Err.notFound("order not found");
  if (o.status !== "pending") throw Err.conflict("not_pending", "only pending orders can be rejected");
  await prisma.bookOrder.update({
    where: { id },
    data: { status: "failed", note: (reason || "rejected by admin").slice(0, 500), updatedAt: now() },
  });
  return { ok: true };
}

