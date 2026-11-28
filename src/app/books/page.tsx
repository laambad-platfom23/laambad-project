"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Search, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { BookCover, RatingLine, formatBookPrice } from "@/components/books/book-parts";
import { booksApi } from "@/services/api/student-features";
import { useAuthStore } from "@/store/auth-store";

const PAGE = 12;

/** A12 (Phase 2 test): the public book shelf — like the course catalog; a book opens its page. */
export default function BooksCatalogPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useQuery({
    queryKey: ["book-catalog", user?.id ?? "guest"],
    queryFn: () => booksApi.list().then((r) => r.data),
  });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter(
      (b) => b.status === "published" && (!term || b.title.toLowerCase().includes(term) || (b.author ?? "").toLowerCase().includes(term))
    );
  }, [data, q]);
  const shown = list.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand">eBooks</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0B1F3A] dark:text-white sm:text-4xl">Books</h1>
      <p className="mt-2 flex max-w-2xl items-start gap-2 text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
        Read and listen on the site and in the app. Books are not downloaded.
      </p>
      <div className="relative mt-6 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search a title or an author…"
          className="h-11 rounded-xl pl-9"
        />
      </div>

      {isLoading ? (
        <div className="mt-8 grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
          ))}
        </div>
      ) : !list.length ? (
        <p className="mt-10 rounded-2xl border border-dashed p-10 text-center text-muted-foreground">{q ? "No book matches your search." : "No books yet."}</p>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
            {shown.map((b) => (
              <Link key={b.id} href={`/books/${encodeURIComponent(b.slug)}`} className="group block">
                <div className="relative overflow-hidden rounded-2xl border bg-card shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md">
                  <BookCover url={b.cover_url} className="aspect-[3/4] w-full" />
                  <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2.5 py-0.5 text-xs font-bold text-[#0B1F3A] shadow-sm">
                    {b.owned && !b.is_free ? "Yours" : formatBookPrice(b)}
                  </span>
                  {b.progress && b.progress.percent > 0 ? (
                    <span className="absolute inset-x-0 bottom-0 h-1.5 bg-black/20">
                      <span className="block h-full bg-brand" style={{ width: `${b.progress.percent}%` }} />
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 line-clamp-2 font-semibold leading-snug group-hover:text-brand">{b.title}</p>
                {b.author ? <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{b.author}</p> : null}
                <RatingLine rating={b.rating} size={13} className="mt-1 text-xs" />
              </Link>
            ))}
          </div>
          <PaginationBar className="mt-10" page={page} pageSize={PAGE} total={list.length} onPage={setPage} noun="books" />
        </>
      )}
    </div>
  );
}
