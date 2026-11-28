"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BookReader } from "@/components/books/book-reader";
import { booksApi } from "@/services/api/student-features";
import { useAuthStore } from "@/store/auth-store";

function Opening() {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center gap-2 bg-background text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> Opening the book…
    </div>
  );
}

/** A12: /books/[slug]/read — the reader (signed in; the book must be free or bought). ?listen=1 opens Listen. */
function ReadInner() {
  const params = useParams();
  const slug = typeof params.slug === "string" ? decodeURIComponent(params.slug) : "";
  const search = useSearchParams();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  useEffect(() => {
    let t: string | null = null;
    try {
      t = localStorage.getItem("access_token");
    } catch {
      t = null;
    }
    setHasToken(!!t);
  }, []);
  useEffect(() => {
    if (hasToken === false) router.replace(`/login?next=${encodeURIComponent(`/books/${slug}/read`)}`);
  }, [hasToken, router, slug]);

  const { data: book, isError } = useQuery({
    queryKey: ["book", slug, user?.id ?? "guest"],
    queryFn: () => booksApi.get(slug).then((r) => r.data),
    enabled: !!slug && !!user,
    retry: false,
  });
  useEffect(() => {
    if (book && !book.owned) {
      toast.message(book.is_free ? "Sign in to read this book." : "Buy this book to read it.");
      router.replace(`/books/${encodeURIComponent(slug)}`);
    }
    if (isError) router.replace("/books");
  }, [book, isError, router, slug]);

  if (!user || !book || !book.owned) return <Opening />;
  return (
    <BookReader
      book={book}
      watermark={[user.name, user.email].filter(Boolean).join(" · ")}
      startListening={search.get("listen") === "1"}
      onClose={() => router.push(`/books/${encodeURIComponent(book.slug)}`)}
    />
  );
}

export default function ReadBookPage() {
  return (
    <Suspense fallback={<Opening />}>
      <ReadInner />
    </Suspense>
  );
}
