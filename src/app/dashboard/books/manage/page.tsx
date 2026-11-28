"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, FileUp, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { booksApi, type Book } from "@/services/api/student-features";
import { uploadsApi } from "@/services/api/uploads";
import { coursesApi } from "@/services/api/courses";
import { shrinkImage } from "@/components/dashboard/asset-upload-button";
import { useAuthStore } from "@/store/auth-store";
import { isAdminUser } from "@/lib/auth-routing";
import { cn, formatDateTime, getApiErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

/** A2 admin: publish books (PDF, free or paid) and approve manual book payments. */
export default function ManageBooksPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"books" | "orders">("books");
  const [editing, setEditing] = useState<Book | "new" | null>(null);

  const books = useQuery({
    queryKey: ["books", user?.id],
    queryFn: () => booksApi.list().then((r) => r.data),
    enabled: isAdminUser(user),
  });
  const orders = useQuery({
    queryKey: ["book-orders"],
    queryFn: () => booksApi.orders().then((r) => r.data),
    enabled: isAdminUser(user) && tab === "orders",
  });

  const remove = useMutation({
    mutationFn: (id: string) => booksApi.remove(id),
    onSuccess: () => {
      toast.success("Book removed");
      qc.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not remove")),
  });
  const approve = useMutation({
    mutationFn: (id: string) => booksApi.approveOrder(id),
    onSuccess: () => {
      toast.success("Approved — the student can read the book");
      qc.invalidateQueries({ queryKey: ["book-orders"] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not approve")),
  });
  const reject = useMutation({
    mutationFn: (id: string) => booksApi.rejectOrder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["book-orders"] }),
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not reject")),
  });

  if (!isAdminUser(user)) {
    return <p className="py-16 text-center text-muted-foreground">Admins only.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/dashboard/books" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Books
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Manage books</h1>
        </div>
        {tab === "books" ? (
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> New book
          </Button>
        ) : null}
      </div>

      <div className="inline-flex rounded-lg border p-1">
        {(["books", "orders"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition",
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "books" ? "Books" : "Book orders"}
          </button>
        ))}
      </div>

      {tab === "books" ? (
        books.isLoading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : !books.data?.length ? (
          <Card className="border-dashed">
            <CardContent className="py-14 text-center text-sm text-muted-foreground">No books yet.</CardContent>
          </Card>
        ) : (
          <div className="divide-y rounded-xl border bg-card">
            {books.data.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{b.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.author ? `${b.author} · ` : ""}
                    {b.is_free ? "Free" : money(b.price, b.currency)} · {b.has_file ? `PDF ${b.file_size ? `${(b.file_size / 1048576).toFixed(1)} MB` : ""}` : "no PDF yet"}
                  </p>
                </div>
                <Badge variant={b.status === "published" ? "default" : "secondary"}>{b.status}</Badge>
                <Button size="sm" variant="outline" onClick={() => setEditing(b)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => window.confirm(`Remove "${b.title}"? Students who bought it lose access.`) && remove.mutate(b.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )
      ) : orders.isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : !orders.data?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-sm text-muted-foreground">No book orders yet.</CardContent>
        </Card>
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {orders.data.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{o.book_title}</p>
                <p className="text-xs text-muted-foreground">
                  {o.student_name} · {o.student_email} · {money(o.amount, o.currency)} · {o.provider === "wafi" ? "WaafiPay" : "Manual EVC"}
                  {o.payer_phone ? ` · from ${o.payer_phone}` : ""}
                  {o.transaction_id ? ` · Tx ${o.transaction_id}` : ""} · {formatDateTime(o.created_at)}
                </p>
                {o.note ? <p className="text-xs text-destructive">{o.note}</p> : null}
              </div>
              <Badge variant={o.status === "paid" ? "default" : o.status === "pending" ? "secondary" : "destructive"}>{o.status}</Badge>
              {o.status === "pending" ? (
                <>
                  <Button size="sm" disabled={approve.isPending} onClick={() => window.confirm("Money received? Approve this order.") && approve.mutate(o.id)}>
                    <Check className="h-4 w-4" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" disabled={reject.isPending} onClick={() => window.confirm("Reject this order?") && reject.mutate(o.id)}>
                    <X className="h-4 w-4" /> Reject
                  </Button>
                </>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {editing ? (
        <BookEditor
          book={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["books"] })}
        />
      ) : null}
    </div>
  );
}

function BookEditor({ book, onClose, onSaved }: { book: Book | null; onClose: () => void; onSaved: () => void }) {
  const [current, setCurrent] = useState<Book | null>(book);
  const [title, setTitle] = useState(book?.title ?? "");
  const [author, setAuthor] = useState(book?.author ?? "");
  const [description, setDescription] = useState(book?.description ?? "");
  const [coverUrl, setCoverUrl] = useState(book?.cover_url ?? "");
  const [isFree, setIsFree] = useState(book?.is_free ?? true);
  const [price, setPrice] = useState(book && !book.is_free ? String(book.price / 100) : "");
  const [published, setPublished] = useState(book?.status === "published");
  const [courseId, setCourseId] = useState(book?.course_id ?? "");
  const [uploading, setUploading] = useState<string | null>(null);
  // A12: "Practise what this book teaches" — any course can be linked
  const courses = useQuery({
    queryKey: ["book-related-courses"],
    queryFn: () => coursesApi.list(1, 200, false).then((r) => (r.data.data ?? []) as { id: string; title: string }[]),
    staleTime: 5 * 60_000,
  });
  const pdfRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: async () => {
      const cents = Math.round(Number(price || 0) * 100);
      const data = {
        title,
        author: author || null,
        description: description || null,
        cover_url: coverUrl || null,
        is_free: isFree,
        price: isFree ? 0 : cents,
        status: (published ? "published" : "draft") as "draft" | "published",
        course_id: courseId || null,
      };
      if (current) return (await booksApi.update(current.id, data)).data;
      // a new book starts as a draft: the PDF is uploaded after it exists
      return (await booksApi.create({ ...data, status: "draft" })).data;
    },
    onSuccess: (b) => {
      const wasNew = !current;
      setCurrent(b);
      onSaved();
      toast.success(wasNew ? "Book created — now upload the PDF" : "Book saved");
      if (!wasNew) onClose();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not save")),
  });

  const uploadPdf = async (file: File) => {
    if (!current) return;
    if (file.type && file.type !== "application/pdf") {
      toast.error("Choose a PDF file");
      return;
    }
    setUploading("Preparing…");
    try {
      const ticket = (await booksApi.uploadTicket(current.id)).data;
      if (file.size > ticket.max_bytes) throw new Error("The PDF is too large");
      let updated: Book;
      if (ticket.mode === "blob") {
        setUploading("Uploading…");
        const { put } = await import("@vercel/blob/client");
        const blob = await put(ticket.pathname, file, {
          access: "public",
          token: ticket.token,
          contentType: "application/pdf",
          multipart: file.size > 20 * 1024 * 1024,
          onUploadProgress: (p) => setUploading(`Uploading… ${Math.round(p.percentage)}%`),
        });
        updated = (await booksApi.attachBlob(current.id, blob.url, file.name, file.size)).data;
      } else {
        setUploading("Uploading…");
        updated = (await booksApi.uploadServer(current.id, file)).data;
      }
      // A12: count the pages here (pdf.js reads the local file) so the book page can show them
      try {
        setUploading("Counting pages…");
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        updated = (await booksApi.update(current.id, { page_count: doc.numPages })).data;
        void doc.destroy();
      } catch {
        /* the reader fills it in when the book is first opened */
      }
      setCurrent(updated);
      onSaved();
      toast.success(updated.page_count ? `PDF uploaded · ${updated.page_count} pages` : "PDF uploaded");
    } catch (e) {
      toast.error(getApiErrorMessage(e, e instanceof Error ? e.message : "Upload failed"));
    } finally {
      setUploading(null);
      if (pdfRef.current) pdfRef.current.value = "";
    }
  };

  const uploadCover = async (file: File) => {
    try {
      setUploading("Uploading cover…");
      const r = await uploadsApi.uploadMedia(await shrinkImage(file), "assets");
      setCoverUrl(r.url);
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not upload the cover"));
    } finally {
      setUploading(null);
      if (coverRef.current) coverRef.current.value = "";
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{current ? "Edit book" : "New book"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bk-title">Title</Label>
            <Input id="bk-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bk-author">Author</Label>
            <Input id="bk-author" value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={255} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bk-desc">Description</Label>
            <Textarea id="bk-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Cover image</Label>
            <div className="flex items-center gap-3">
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverUrl} alt="" className="h-20 w-16 rounded object-cover" />
              ) : null}
              <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])} />
              <Button type="button" variant="outline" size="sm" onClick={() => coverRef.current?.click()} disabled={!!uploading}>
                Upload cover
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bk-course">Related course (optional)</Label>
            <select
              id="bk-course"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">None</option>
              {(courses.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Shown on the book page as “Practise what this book teaches”.</p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} />
              Free book
            </label>
            {!isFree ? (
              <div className="space-y-1.5">
                <Label htmlFor="bk-price">Price (USD)</Label>
                <Input id="bk-price" type="number" min="0.5" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="w-32" />
              </div>
            ) : null}
          </div>

          {current ? (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">PDF file</p>
              <p className="text-xs text-muted-foreground">
                {current.has_file
                  ? `${current.file_name ?? "book.pdf"}${current.file_size ? ` · ${(current.file_size / 1048576).toFixed(1)} MB` : ""}${current.page_count ? ` · ${current.page_count} pages` : ""}`
                  : "No PDF uploaded yet. Students never see the file address."}
              </p>
              <input ref={pdfRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && uploadPdf(e.target.files[0])} />
              <Button type="button" variant="outline" size="sm" onClick={() => pdfRef.current?.click()} disabled={!!uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                {uploading ?? (current.has_file ? "Replace PDF" : "Upload PDF")}
              </Button>
              <label className="flex items-center gap-2 pt-1 text-sm">
                <input type="checkbox" checked={published} disabled={!current.has_file} onChange={(e) => setPublished(e.target.checked)} />
                Published (visible to students)
              </label>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Save first, then upload the PDF and publish.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => save.mutate()} disabled={!title.trim() || save.isPending || !!uploading || (!isFree && !(Number(price) > 0))}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {current ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
