"use client";

/**
 * A12 (Phase 2 test): the in-app book reader — read only, never downloaded.
 *
 * pdf.js (legacy build, for older Android phones) draws each page on a <canvas>; the PDF is fetched in
 * parts (HTTP Range) with the sign-in token, only for the pages being read. Every page carries a faint
 * watermark with the reader's name. There is no download / print / right-click; text is not selectable.
 * Toolbar (like the reference): back · title + % read · search · bookmark · contents · text size · Listen
 * (the device voice reads the page aloud, then goes on to the next page). Progress and bookmarks are
 * saved per reader.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Headphones,
  List,
  Loader2,
  Lock,
  Minus,
  Pause,
  Play,
  Plus,
  Search,
  Square,
  Type,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { booksApi } from "@/services/api/student-features";
import { cn } from "@/lib/utils";

type ReaderBook = { id: string; title: string; slug: string; page_count?: number | null };
type Panel = null | "contents" | "bookmarks" | "search" | "size" | "listen";
type OutlineRow = { title: string; page: number; depth: number };

const ZOOMS = [0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];
const GAP = 16;

let pdfjsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
      return m;
    });
  }
  return pdfjsPromise;
}

/** "Name · e-mail" repeated faintly across the page (screenshots carry it too). */
function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, text: string) {
  if (!text) return;
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = "#0B1F3A";
  const size = Math.max(14, Math.round(w / 34));
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 7);
  const stepX = ctx.measureText(text).width + size * 4;
  const stepY = size * 7;
  for (let y = -h; y < h; y += stepY) {
    for (let x = -w - ((y / stepY) % 2 ? stepX / 2 : 0); x < w; x += stepX) ctx.fillText(text, x, y);
  }
  ctx.restore();
}

/** Page text for search and for reading aloud. */
async function pageText(pdf: PDFDocumentProxy, n: number, cache: Map<number, string>) {
  const hit = cache.get(n);
  if (hit !== undefined) return hit;
  const page = await pdf.getPage(n);
  const content = await page.getTextContent();
  let out = "";
  for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
    if (typeof item.str !== "string") continue;
    out += item.str + (item.hasEOL ? "\n" : " ");
  }
  const text = out.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  cache.set(n, text);
  return text;
}

/** Speech engines cut long texts: read a page in sentence-sized pieces. */
function chunks(text: string) {
  const parts = text.replace(/\n+/g, " ").match(/[^.!?؟]+[.!?؟]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + p).length > 220 && cur) {
      out.push(cur.trim());
      cur = "";
    }
    cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

export function BookReader({
  book,
  watermark,
  onClose,
  startListening,
}: {
  book: ReaderBook;
  /** e.g. "Amina Ali · amina@example.com" */
  watermark: string;
  onClose: () => void;
  /** opened with "Listen": show the listen controls first */
  startListening?: boolean;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const canvases = useRef(new Map<number, HTMLCanvasElement>());
  const tasks = useRef(new Map<number, RenderTask>());
  const drawn = useRef(new Map<number, number>()); // page → zoom it was drawn at
  const texts = useRef(new Map<number, string>());
  const [numPages, setNumPages] = useState(0);
  const [ratio, setRatio] = useState(1.414); // page height / width (from page 1)
  const [width, setWidth] = useState(800); // fit-to-screen page width (css px)
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<{ code: number; message: string } | null>(null);
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [panel, setPanel] = useState<Panel>(startListening ? "listen" : null);
  const [outline, setOutline] = useState<OutlineRow[] | null>(null);
  const [visible, setVisible] = useState<Set<number>>(new Set([1, 2]));
  const saved = useRef({ page: 0, at: 0 });
  const pendingJump = useRef<number | null>(null);
  const live = useRef({ page: 1, numPages: 0 });
  live.current = { page, numPages };

  const pageW = Math.round(width * zoom);
  const pageH = Math.round(pageW * ratio);
  const slot = pageH + GAP;

  // ── open the PDF (fresh token first: the progress call refreshes an expired one) ──
  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    (async () => {
      let start = 1;
      try {
        const p = (await booksApi.progress(book.id)).data;
        start = p.last_page || 1;
        setBookmarks(p.bookmarks ?? []);
      } catch (e) {
        const status = (e as { response?: { status?: number } })?.response?.status ?? 0;
        if (status === 402 || status === 403) {
          if (!cancelled) setError({ code: 402, message: "Buy this book to read it." });
          return;
        }
      }
      try {
        const pdfjs = await loadPdfjs();
        const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
        doc = await pdfjs.getDocument({
          url: booksApi.fileUrl(book.id),
          httpHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
          withCredentials: false,
          disableAutoFetch: true,
          disableStream: true,
          rangeChunkSize: 256 * 1024,
        }).promise;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        pdfRef.current = doc;
        const first = await doc.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        setRatio(vp.height / vp.width);
        setNumPages(doc.numPages);
        if (!book.page_count || book.page_count !== doc.numPages) {
          booksApi.saveProgress(book.id, { page_count: doc.numPages }).catch(() => undefined);
        }
        doc
          .getOutline()
          .then(async (items) => {
            const rows: OutlineRow[] = [];
            const walk = async (list: typeof items, depth: number) => {
              for (const it of list ?? []) {
                let pageNo = 0;
                try {
                  const dest = typeof it.dest === "string" ? await doc!.getDestination(it.dest) : it.dest;
                  const ref = Array.isArray(dest) ? dest[0] : null;
                  if (ref && typeof ref === "object") pageNo = (await doc!.getPageIndex(ref as never)) + 1;
                  else if (typeof ref === "number") pageNo = ref + 1;
                } catch {
                  pageNo = 0;
                }
                if (pageNo > 0) rows.push({ title: it.title, page: pageNo, depth });
                if (it.items?.length && depth < 3) await walk(it.items, depth + 1);
              }
            };
            await walk(items, 0);
            if (!cancelled) setOutline(rows);
          })
          .catch(() => setOutline([]));
        if (start > 1 && start <= doc.numPages) {
          pendingJump.current = start;
          toast.message(`Continuing from page ${start}`);
        }
      } catch (e) {
        if (cancelled) return;
        const msg = String((e as Error)?.message ?? "");
        setError({ code: /402|payment/i.test(msg) ? 402 : 500, message: /402|payment/i.test(msg) ? "Buy this book to read it." : "Could not open the book. Check your connection and try again." });
      }
    })();
    return () => {
      cancelled = true;
      tasks.current.forEach((t) => t.cancel());
      if (doc) void doc.destroy();
      pdfRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // ── fit the page to the screen ──
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const fit = () => setWidth(Math.max(260, Math.min(900, el.clientWidth - 24)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── which pages are on (or near) the screen; the current page ──
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el || !numPages) return;
    const top = el.scrollTop;
    const current = Math.min(numPages, Math.max(1, Math.floor((top + el.clientHeight / 3) / slot) + 1));
    setPage(current);
    const from = Math.max(1, Math.floor(top / slot) + 1 - 1);
    const to = Math.min(numPages, Math.ceil((top + el.clientHeight) / slot) + 1);
    setVisible((prev) => {
      const next = new Set<number>();
      for (let i = from; i <= to; i++) next.add(i);
      if (next.size === prev.size && [...next].every((x) => prev.has(x))) return prev;
      return next;
    });
  }, [numPages, slot]);
  useEffect(() => {
    onScroll();
  }, [onScroll, zoom, width]);

  const jumpTo = useCallback(
    (n: number, smooth = true) => {
      const el = scroller.current;
      if (!el) return;
      el.scrollTo({ top: (n - 1) * slot, behavior: smooth ? "smooth" : "auto" });
    },
    [slot]
  );

  // the saved page once the book is open; the same page stays in view when the size changes
  const lastSlot = useRef(0);
  useEffect(() => {
    if (!numPages) return;
    const el = scroller.current;
    if (!el) return;
    if (pendingJump.current) {
      const n = pendingJump.current;
      pendingJump.current = null;
      requestAnimationFrame(() => el.scrollTo({ top: (n - 1) * slot }));
    } else if (lastSlot.current && lastSlot.current !== slot) {
      const n = live.current.page;
      requestAnimationFrame(() => el.scrollTo({ top: (n - 1) * slot }));
    }
    lastSlot.current = slot;
  }, [numPages, slot]);

  // ── draw the visible pages (again when the size changes); free the far ones ──
  useEffect(() => {
    const pdf = pdfRef.current;
    if (!pdf || !numPages) return;
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    for (const n of visible) {
      const canvas = canvases.current.get(n);
      if (!canvas || drawn.current.get(n) === pageW) continue;
      tasks.current.get(n)?.cancel();
      drawn.current.set(n, pageW);
      void (async () => {
        try {
          const p = await pdf.getPage(n);
          const base = p.getViewport({ scale: 1 });
          const vp = p.getViewport({ scale: (pageW / base.width) * dpr });
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          canvas.style.height = `${Math.round(pageW * (base.height / base.width))}px`;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          const task = p.render({ canvasContext: ctx, viewport: vp });
          tasks.current.set(n, task);
          await task.promise;
          drawWatermark(ctx, canvas.width, canvas.height, watermark);
        } catch (e) {
          if ((e as Error)?.name !== "RenderingCancelledException") drawn.current.delete(n);
        }
      })();
    }
    // forget pages far from the screen so a long book does not fill the phone's memory
    for (const [n, canvas] of canvases.current) {
      if (Math.abs(n - page) > 6 && drawn.current.has(n)) {
        tasks.current.get(n)?.cancel();
        drawn.current.delete(n);
        canvas.width = 1;
        canvas.height = 1;
      }
    }
  }, [visible, pageW, numPages, watermark, page]);

  // ── save where the reader is ──
  const save = useCallback(
    (data: { last_page?: number; bookmarks?: number[] }) => booksApi.saveProgress(book.id, { ...data, page_count: numPages || undefined }).catch(() => undefined),
    [book.id, numPages]
  );
  useEffect(() => {
    if (!numPages) return;
    const t = setTimeout(() => {
      if (saved.current.page !== page) {
        saved.current = { page, at: Date.now() };
        void save({ last_page: page });
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [page, numPages, save]);
  // leaving (tab closed, app hidden, back): save the page once, even if the 2.5 s wait did not end
  useEffect(() => {
    const flush = () => {
      const { page: pg, numPages: total } = live.current;
      if (!total || saved.current.page === pg) return;
      const token = localStorage.getItem("access_token");
      void fetch(booksApi.fileUrl(book.id).replace(/\/file$/, "/progress"), {
        method: "PUT",
        keepalive: true,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ last_page: pg, page_count: total }),
      }).catch(() => undefined);
      saved.current.page = pg;
    };
    const hidden = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hidden);
      flush();
    };
  }, [book.id]);

  // ── read only: no save / print / right-click ──
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === "s" || k === "p")) {
        e.preventDefault();
        toast.message("Books are read here — saving and printing are turned off.");
      }
      if (e.key === "Escape" && panel) setPanel(null);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [panel]);

  const marked = bookmarks.includes(page);
  const toggleMark = () => {
    const next = marked ? bookmarks.filter((x) => x !== page) : [...bookmarks, page].sort((a, b) => a - b);
    setBookmarks(next);
    void save({ bookmarks: next });
    toast.success(marked ? `Bookmark removed (page ${page})` : `Page ${page} bookmarked`);
  };

  const percent = numPages ? Math.round((page / numPages) * 100) : 0;

  if (error) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <Lock className="h-9 w-9 text-muted-foreground" />
        <p className="font-semibold">{error.message}</p>
        <div className="flex gap-2">
          {error.code === 402 ? (
            <Button asChild>
              <a href={`/checkout?book=${encodeURIComponent(book.slug)}`}>Buy the book</a>
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="book-reader fixed inset-0 z-[60] flex flex-col bg-[#f3f4f6] dark:bg-[#0b1220]" onContextMenu={(e) => e.preventDefault()}>
      <style>{`@media print { .book-reader { display: none !important; } }`}</style>
      {/* toolbar */}
      <div className="flex items-center gap-1 border-b bg-background px-2 py-2 shadow-sm sm:gap-2 sm:px-4">
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold sm:text-base">{book.title}</p>
          <p className="text-xs text-muted-foreground">{numPages ? `${percent}% · page ${page} of ${numPages}` : "Opening…"}</p>
        </div>
        <ToolButton label="Search" active={panel === "search"} onClick={() => setPanel(panel === "search" ? null : "search")}>
          <Search className="h-5 w-5" />
        </ToolButton>
        <ToolButton label={marked ? "Remove bookmark" : "Bookmark this page"} active={marked} onClick={toggleMark} disabled={!numPages}>
          {marked ? <BookmarkCheck className="h-5 w-5 text-brand" /> : <Bookmark className="h-5 w-5" />}
        </ToolButton>
        <ToolButton label="Contents and bookmarks" active={panel === "contents" || panel === "bookmarks"} onClick={() => setPanel(panel === "contents" ? null : "contents")}>
          <List className="h-5 w-5" />
        </ToolButton>
        <ToolButton label="Text size" active={panel === "size"} onClick={() => setPanel(panel === "size" ? null : "size")}>
          <Type className="h-5 w-5" />
        </ToolButton>
        <Button
          variant="outline"
          className={cn("ml-1 h-10 gap-1.5 rounded-full px-3 sm:px-4", panel === "listen" && "border-brand text-brand")}
          onClick={() => setPanel(panel === "listen" ? null : "listen")}
        >
          <Headphones className="h-4 w-4" /> <span className="hidden sm:inline">Listen</span>
        </Button>
      </div>
      <div className="h-1 bg-muted">
        <div className="h-full bg-brand transition-all" style={{ width: `${percent}%` }} />
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* pages */}
        <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 select-none overflow-auto py-3" style={{ WebkitUserSelect: "none" }}>
          {!numPages ? (
            <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Opening the book…
            </div>
          ) : (
            <div className="mx-auto flex flex-col items-center" style={{ width: Math.max(pageW, 1), gap: GAP }}>
              {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
                <div key={n} className="relative bg-white shadow-md" style={{ width: pageW, height: pageH }} data-page={n}>
                  {/* under the canvas: shows until the page is drawn (a drawn page is opaque) */}
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Page {n}</span>
                  {visible.has(n) || Math.abs(n - page) <= 6 ? (
                    <canvas
                      ref={(el) => {
                        if (el) canvases.current.set(n, el);
                        else canvases.current.delete(n);
                      }}
                      className="relative block w-full"
                      draggable={false}
                    />
                  ) : null}
                  {bookmarks.includes(n) ? <BookmarkCheck className="absolute right-2 top-0 h-6 w-6 fill-brand text-brand" aria-label="Bookmarked" /> : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* side panel */}
        {panel && panel !== "listen" ? (
          <div className="absolute inset-x-0 bottom-0 top-0 z-10 flex flex-col border-l bg-background shadow-xl sm:inset-x-auto sm:right-0 sm:w-[360px]">
            {panel === "size" ? (
              <SizePanel zoom={zoom} setZoom={setZoom} onClose={() => setPanel(null)} />
            ) : panel === "search" ? (
              <SearchPanel pdf={pdfRef.current} numPages={numPages} texts={texts.current} onJump={(n) => { jumpTo(n); }} onClose={() => setPanel(null)} />
            ) : (
              <ContentsPanel
                tab={panel === "bookmarks" ? "bookmarks" : "contents"}
                setTab={(t) => setPanel(t)}
                outline={outline}
                bookmarks={bookmarks}
                numPages={numPages}
                onJump={(n) => {
                  jumpTo(n);
                  if (window.innerWidth < 640) setPanel(null);
                }}
                onRemove={(n) => {
                  const next = bookmarks.filter((x) => x !== n);
                  setBookmarks(next);
                  void save({ bookmarks: next });
                }}
                onClose={() => setPanel(null)}
              />
            )}
          </div>
        ) : null}
      </div>

      {panel === "listen" ? (
        <ListenBar
          pdf={pdfRef.current}
          page={page}
          numPages={numPages}
          texts={texts.current}
          onPage={(n) => jumpTo(n)}
          onClose={() => setPanel(null)}
        />
      ) : null}
    </div>
  );
}

function ToolButton({ label, active, onClick, disabled, children }: { label: string; active?: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Button size="icon" variant="ghost" className={cn("h-10 w-10", active && "bg-muted")} aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}

function PanelHead({ title, onClose, children }: { title: string; onClose: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b px-4 py-3">
      <p className="flex-1 font-semibold">{title}</p>
      {children}
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose} aria-label="Close">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SizePanel({ zoom, setZoom, onClose }: { zoom: number; setZoom: (z: number) => void; onClose: () => void }) {
  const i = ZOOMS.indexOf(zoom);
  return (
    <>
      <PanelHead title="Text size" onClose={onClose} />
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" size="icon" onClick={() => setZoom(ZOOMS[Math.max(0, i - 1)])} disabled={i <= 0} aria-label="Smaller">
            <Minus className="h-4 w-4" />
          </Button>
          <p className="text-2xl font-bold tabular-nums">{Math.round(zoom * 100)}%</p>
          <Button variant="outline" size="icon" onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, i + 1)])} disabled={i >= ZOOMS.length - 1} aria-label="Larger">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="ghost" className="w-full" onClick={() => setZoom(1)} disabled={zoom === 1}>
          Fit to screen
        </Button>
      </div>
    </>
  );
}

function ContentsPanel({
  tab,
  setTab,
  outline,
  bookmarks,
  numPages,
  onJump,
  onRemove,
  onClose,
}: {
  tab: "contents" | "bookmarks";
  setTab: (t: "contents" | "bookmarks") => void;
  outline: OutlineRow[] | null;
  bookmarks: number[];
  numPages: number;
  onJump: (n: number) => void;
  onRemove: (n: number) => void;
  onClose: () => void;
}) {
  const [go, setGo] = useState("");
  return (
    <>
      <PanelHead title={tab === "contents" ? "Contents" : "Bookmarks"} onClose={onClose} />
      <div className="flex gap-1 border-b p-2">
        {(["contents", "bookmarks"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn("flex-1 rounded-md px-3 py-1.5 text-sm font-medium", tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
          >
            {t === "contents" ? "Contents" : `Bookmarks (${bookmarks.length})`}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2 border-b p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Math.round(Number(go));
          if (n >= 1 && n <= numPages) onJump(n);
        }}
      >
        <Input value={go} onChange={(e) => setGo(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder={`Go to page (1–${numPages || "…"})`} className="h-9" />
        <Button type="submit" variant="secondary" className="h-9">
          Go
        </Button>
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === "contents" ? (
          outline === null ? (
            <p className="p-3 text-sm text-muted-foreground">Loading…</p>
          ) : !outline.length ? (
            <p className="p-3 text-sm text-muted-foreground">This book has no table of contents. Use “Go to page”, search or bookmarks.</p>
          ) : (
            outline.map((o, i) => (
              <button
                key={`${o.page}-${i}`}
                type="button"
                onClick={() => onJump(o.page)}
                className="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                style={{ paddingLeft: 8 + o.depth * 14 }}
              >
                <span className={cn("min-w-0 flex-1", o.depth === 0 && "font-medium")}>{o.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{o.page}</span>
              </button>
            ))
          )
        ) : !bookmarks.length ? (
          <p className="p-3 text-sm text-muted-foreground">No bookmarks yet. Tap the bookmark at the top to keep a page.</p>
        ) : (
          bookmarks.map((n) => (
            <div key={n} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted">
              <button type="button" className="flex flex-1 items-center gap-2 py-1 text-left text-sm" onClick={() => onJump(n)}>
                <BookmarkCheck className="h-4 w-4 text-brand" /> Page {n}
              </button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onRemove(n)} aria-label={`Remove the bookmark on page ${n}`}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function SearchPanel({
  pdf,
  numPages,
  texts,
  onJump,
  onClose,
}: {
  pdf: PDFDocumentProxy | null;
  numPages: number;
  texts: Map<number, string>;
  onJump: (n: number) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<{ at: number } | null>(null);
  const [hits, setHits] = useState<{ page: number; before: string; match: string; after: string }[] | null>(null);
  const run = useRef(0);

  const search = async (term: string) => {
    const want = term.trim().toLowerCase();
    if (!pdf || want.length < 2) return;
    const me = ++run.current;
    const found: { page: number; before: string; match: string; after: string }[] = [];
    setHits([]);
    for (let n = 1; n <= numPages; n++) {
      if (run.current !== me) return;
      if (n % 5 === 1) setBusy({ at: n });
      const text = await pageText(pdf, n, texts).catch(() => "");
      const low = text.toLowerCase();
      let from = 0;
      let i: number;
      let perPage = 0;
      while ((i = low.indexOf(want, from)) >= 0 && perPage < 3) {
        found.push({ page: n, before: text.slice(Math.max(0, i - 40), i), match: text.slice(i, i + want.length), after: text.slice(i + want.length, i + want.length + 60) });
        from = i + want.length;
        perPage++;
      }
      if (found.length >= 200) break;
      if (n % 10 === 0) setHits([...found]);
    }
    if (run.current === me) {
      setHits(found);
      setBusy(null);
    }
  };
  useEffect(() => () => void (run.current += 1), []);

  return (
    <>
      <PanelHead title="Search in the book" onClose={onClose} />
      <form
        className="flex gap-2 border-b p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void search(q);
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Word or phrase…" className="h-9" autoFocus />
        <Button type="submit" className="h-9" disabled={q.trim().length < 2 || !pdf}>
          <Search className="h-4 w-4" />
        </Button>
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {busy ? (
          <p className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching page {busy.at} of {numPages}…
          </p>
        ) : null}
        {hits === null ? (
          <p className="p-3 text-sm text-muted-foreground">Type at least 2 letters and press search.</p>
        ) : !hits.length && !busy ? (
          <p className="p-3 text-sm text-muted-foreground">Not found in this book.</p>
        ) : (
          hits.map((h, i) => (
            <button key={i} type="button" onClick={() => onJump(h.page)} className="block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted">
              <span className="mb-0.5 block text-xs font-semibold text-muted-foreground">Page {h.page}</span>
              <span className="text-foreground/80">
                …{h.before}
                <mark className="rounded bg-amber-200 px-0.5 text-foreground dark:bg-amber-500/40">{h.match}</mark>
                {h.after}…
              </span>
            </button>
          ))
        )}
      </div>
    </>
  );
}

/** Listen: the device's voice reads the current page, then the next ones. */
function ListenBar({
  pdf,
  page,
  numPages,
  texts,
  onPage,
  onClose,
}: {
  pdf: PDFDocumentProxy | null;
  page: number;
  numPages: number;
  texts: Map<number, string>;
  onPage: (n: number) => void;
  onClose: () => void;
}) {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voice, setVoice] = useState<string>(() => {
    try {
      return localStorage.getItem("laambad-tts-voice") ?? "";
    } catch {
      return "";
    }
  });
  const [rate, setRate] = useState(1);
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const [reading, setReading] = useState(0);
  const stop = useRef(false);
  const pageRef = useRef(page);
  pageRef.current = page;

  useEffect(() => {
    if (!supported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", load);
      stop.current = true;
      window.speechSynthesis.cancel();
    };
  }, [supported]);

  const sortedVoices = useMemo(
    () => [...voices].sort((a, b) => (a.lang.startsWith("so") ? -1 : 0) - (b.lang.startsWith("so") ? -1 : 0) || a.lang.localeCompare(b.lang)),
    [voices]
  );

  const speakPage = async (n: number) => {
    if (!pdf || stop.current) return;
    setReading(n);
    if (n !== pageRef.current) onPage(n);
    const text = await pageText(pdf, n, texts).catch(() => "");
    const parts = chunks(text);
    for (const part of parts) {
      if (stop.current) return;
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(part);
        const v = voices.find((x) => x.voiceURI === voice);
        if (v) {
          u.voice = v;
          u.lang = v.lang;
        }
        u.rate = rate;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
      });
    }
    if (!stop.current && n < numPages) await speakPage(n + 1);
    else if (!stop.current) setState("idle");
  };

  const play = () => {
    if (!supported) return;
    if (state === "paused") {
      window.speechSynthesis.resume();
      setState("playing");
      return;
    }
    stop.current = false;
    window.speechSynthesis.cancel();
    setState("playing");
    void speakPage(pageRef.current);
  };
  const pause = () => {
    window.speechSynthesis.pause();
    setState("paused");
  };
  const halt = () => {
    stop.current = true;
    window.speechSynthesis.cancel();
    setState("idle");
  };

  return (
    <div className="border-t bg-background px-3 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] sm:px-5">
      {!supported ? (
        <div className="flex items-center gap-3">
          <p className="flex-1 text-sm text-muted-foreground">This browser cannot read aloud. Try Chrome or the phone&apos;s main browser.</p>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {state === "playing" ? (
            <Button className="h-11 w-11 rounded-full" size="icon" onClick={pause} aria-label="Pause">
              <Pause className="h-5 w-5" />
            </Button>
          ) : (
            <Button className="h-11 rounded-full px-5" onClick={play} disabled={!pdf}>
              <Play className="h-5 w-5" /> {state === "paused" ? "Resume" : `Listen from page ${page}`}
            </Button>
          )}
          <Button variant="outline" size="icon" className="h-11 w-11 rounded-full" onClick={halt} disabled={state === "idle"} aria-label="Stop">
            <Square className="h-4 w-4" />
          </Button>
          <p className="min-w-[110px] text-sm text-muted-foreground">{state === "idle" ? "The device voice reads the page aloud." : `Reading page ${reading}…`}</p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="h-9 rounded-md border bg-background px-2 text-sm"
              aria-label="Speed"
              disabled={state === "playing"}
            >
              {[0.75, 1, 1.25, 1.5].map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>
            <select
              value={voice}
              onChange={(e) => {
                setVoice(e.target.value);
                try {
                  localStorage.setItem("laambad-tts-voice", e.target.value);
                } catch {
                  /* private mode */
                }
              }}
              className="h-9 max-w-[200px] rounded-md border bg-background px-2 text-sm"
              aria-label="Voice"
              disabled={state === "playing"}
            >
              <option value="">Device voice</option>
              {sortedVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
            <Button variant="ghost" size="icon" onClick={() => (halt(), onClose())} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
