"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  ArrowDown,
  ArrowLeft,
  ChevronDown,
  Copy,
  ImagePlus,
  Loader2,
  Pin,
  PinOff,
  Reply,
  Search,
  SendHorizontal,
  Trash2,
  X,
  Ban,
  ImageIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { discussionsApi, type DiscussionMessage, type DiscussionRoom } from "@/services/api/student-features";
import { cn, getApiErrorMessage, getInitials } from "@/lib/utils";
import { toast } from "sonner";

const MAX = 2000;
const POLL_MS = 8000;

/** Stable colour per author (names in group chats). */
const NAME_COLORS = [
  "text-[#E84A27]",
  "text-[#1F8A70]",
  "text-[#6D4AFF]",
  "text-[#C2410C]",
  "text-[#0E7490]",
  "text-[#B91C7C]",
  "text-[#4D7C0F]",
  "text-[#9333EA]",
];
function nameColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length];
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

/** Photos are shrunk in the browser (max 1600 px, JPEG) so they upload fast and stay under 4 MB. */
async function shrinkImage(file: File): Promise<{ blob: Blob; name: string }> {
  if (file.type === "image/gif") return { blob: file, name: file.name };
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 900_000) return { blob: file, name: file.name };
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return blob ? { blob, name: "photo.jpg" } : { blob: file, name: file.name };
  } catch {
    return { blob: file, name: file.name };
  }
}

function mergeById(...lists: DiscussionMessage[][]) {
  const map = new Map<string, DiscussionMessage>();
  for (const list of lists) for (const m of list) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Class room of one course, laid out like a phone group chat. Messages are shown as plain text. */
export default function DiscussionRoomPage() {
  const params = useParams();
  const slug = typeof params.slug === "string" ? decodeURIComponent(params.slug) : "";
  const qc = useQueryClient();

  const [messages, setMessages] = useState<DiscussionMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  /** true while looking at an older window (jump / search): new messages are not appended until "back to latest" */
  const [detached, setDetached] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  const [highlight, setHighlight] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<DiscussionMessage | null>(null);
  const [image, setImage] = useState<{ blob: Blob; name: string; preview: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  const scroller = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const keepOffset = useRef<number | null>(null);
  const scrollToEnd = useRef(true);
  const atBottomRef = useRef(true);
  /** an image finished loading: stay at the bottom if the reader was there */
  const onMediaLoad = () => {
    const el = scroller.current;
    if (el && atBottomRef.current && !detached) el.scrollTop = el.scrollHeight;
  };

  const latest = useQuery({
    queryKey: ["discussion", slug],
    queryFn: () => discussionsApi.list(slug).then((r) => r.data),
    enabled: !!slug,
    refetchInterval: POLL_MS,
    retry: false,
  });
  const room: DiscussionRoom | undefined = latest.data;

  // merge the newest page into what is on screen
  useEffect(() => {
    if (!room || detached) return;
    setMessages((cur) => {
      const before = new Set(cur.map((m) => m.id));
      const merged = mergeById(cur, room.data);
      const fresh = merged.filter((m) => !before.has(m.id) && !m.mine).length;
      if (cur.length === 0) setHasMore(room.has_more_before);
      else if (fresh && !atBottom) setUnseen((n) => n + fresh);
      if (atBottom || cur.length === 0) scrollToEnd.current = true;
      return merged;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, detached]);

  // keep the view where it should be after the list changed
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (keepOffset.current !== null) {
      el.scrollTop = el.scrollHeight - keepOffset.current;
      keepOffset.current = null;
    } else if (scrollToEnd.current) {
      el.scrollTop = el.scrollHeight;
      scrollToEnd.current = false;
    }
  }, [messages]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAtBottom(bottom);
    atBottomRef.current = bottom;
    if (bottom && !detached) setUnseen(0);
    if (el.scrollTop < 60 && hasMore && !loadingOlder) void loadOlder();
  };

  const loadOlder = async () => {
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const { data } = await discussionsApi.list(slug, { before: oldest.created_at });
      keepOffset.current = (scroller.current?.scrollHeight ?? 0) - (scroller.current?.scrollTop ?? 0);
      setMessages((cur) => mergeById(data.data, cur));
      setHasMore(data.has_more_before);
    } catch {
      /* try again on the next scroll */
    } finally {
      setLoadingOlder(false);
    }
  };

  const flash = (id: string) => {
    setHighlight(id);
    requestAnimationFrame(() =>
      document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    );
    setTimeout(() => setHighlight((h) => (h === id ? null : h)), 2200);
  };

  /** Jump to a message (quote, pinned bar, search result); loads its surroundings when not on screen. */
  const jumpTo = async (id: string) => {
    setSearchOpen(false);
    if (messages.some((m) => m.id === id)) return flash(id);
    try {
      const { data } = await discussionsApi.list(slug, { around: id });
      setDetached(true);
      setMessages(data.data);
      setHasMore(data.has_more_before);
      setTimeout(() => flash(id), 50);
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Message not found"));
    }
  };

  const backToLatest = () => {
    setUnseen(0);
    if (detached) {
      setDetached(false);
      setMessages(room?.data ?? []);
      setHasMore(room?.has_more_before ?? false);
    }
    scrollToEnd.current = true;
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const search = useQuery({
    queryKey: ["discussion-search", slug, debouncedQ],
    queryFn: () => discussionsApi.search(slug, debouncedQ).then((r) => r.data.data),
    enabled: searchOpen && debouncedQ.length >= 2,
  });

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ["discussion", slug] }), [qc, slug]);

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Choose an image (JPG, PNG, WebP or GIF)");
    const shrunk = await shrinkImage(file);
    if (shrunk.blob.size > 4 * 1024 * 1024) return toast.error("This image is too large (max 4 MB)");
    if (image) URL.revokeObjectURL(image.preview);
    setImage({ ...shrunk, preview: URL.createObjectURL(shrunk.blob) });
    textRef.current?.focus();
  };

  const send = async () => {
    const body = text.trim();
    if ((!body && !image) || sending) return;
    setSending(true);
    try {
      let imageUrl: string | null = null;
      if (image) imageUrl = (await discussionsApi.uploadImage(slug, image.blob, image.name)).data.url;
      const { data } = await discussionsApi.post(slug, body, replyTo?.id ?? null, imageUrl);
      setText("");
      setReplyTo(null);
      if (image) URL.revokeObjectURL(image.preview);
      setImage(null);
      if (detached) backToLatest();
      scrollToEnd.current = true;
      setMessages((cur) => mergeById(cur, [data]));
      refresh();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not send the message"));
    } finally {
      setSending(false);
      textRef.current?.focus();
    }
  };

  const remove = async (m: DiscussionMessage) => {
    if (!window.confirm("Delete this message for everyone?")) return;
    try {
      await discussionsApi.remove(m.id);
      setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, deleted: true, body: "", image_url: null, can_delete: false } : x)));
      refresh();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not delete"));
    }
  };
  const togglePin = async (m: DiscussionMessage) => {
    try {
      await discussionsApi.pin(m.id, !m.is_pinned);
      setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, is_pinned: !m.is_pinned } : x)));
      refresh();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not pin"));
    }
  };

  // auto-grow the composer
  useEffect(() => {
    const t = textRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 140)}px`;
  }, [text]);

  const rows = useMemo(() => {
    const out: ({ kind: "day"; key: string; label: string } | { kind: "msg"; key: string; m: DiscussionMessage; first: boolean })[] = [];
    let lastDay = "";
    let prev: DiscussionMessage | null = null;
    for (const m of messages) {
      const day = new Date(m.created_at).toDateString();
      if (day !== lastDay) {
        out.push({ kind: "day", key: `d-${day}`, label: dayLabel(m.created_at) });
        lastDay = day;
        prev = null;
      }
      const first =
        !prev ||
        prev.author.id !== m.author.id ||
        new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60_000;
      out.push({ kind: "msg", key: m.id, m, first });
      prev = m;
    }
    return out;
  }, [messages]);

  if (latest.isError) {
    const status = axios.isAxiosError(latest.error) ? latest.error.response?.status : undefined;
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-xl font-semibold">{status === 403 ? "Class not available" : "Could not open the class"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {status === 403
            ? "Only students enrolled in this course (and its instructor) can join its discussion."
            : "Please try again in a moment."}
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/dashboard/discussions">Back to classes</Link>
        </Button>
      </div>
    );
  }

  const pinned = room?.pinned?.[0];

  return (
    <div className="-m-4 flex h-[calc(100dvh-4rem)] flex-col overflow-hidden sm:-m-6 lg:-m-8">
      {/* header */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b bg-card px-3 sm:px-4">
        <Link href="/dashboard/discussions" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted" aria-label="Back to classes">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {searchOpen ? (
          <div className="flex flex-1 items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search messages or names…"
              className="h-10 flex-1 bg-transparent text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false);
                setQ("");
              }}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
              aria-label="Close search"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
              {getInitials(room?.course.title ?? "…")}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold leading-tight">{room?.course.title ?? "Class discussion"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {room ? `${room.member_count} students` : "Loading…"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="rounded-full p-2 text-muted-foreground hover:bg-muted"
              aria-label="Search in this class"
            >
              <Search className="h-5 w-5" />
            </button>
            {room ? (
              <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                <Link href={`/learn/${encodeURIComponent(room.course.slug)}`}>Open course</Link>
              </Button>
            ) : null}
          </>
        )}
      </div>

      {/* pinned bar */}
      {pinned && !searchOpen ? (
        <button
          type="button"
          onClick={() => jumpTo(pinned.id)}
          className="flex shrink-0 items-center gap-3 border-b bg-card/95 px-4 py-2 text-left hover:bg-muted/60"
        >
          <Pin className="h-4 w-4 shrink-0 text-brand" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-brand">Pinned message{(room?.pinned.length ?? 0) > 1 ? `s (${room?.pinned.length})` : ""}</p>
            <p className="truncate text-sm text-muted-foreground">
              {pinned.author.name}: {pinned.body || (pinned.image_url ? "📷 Photo" : "")}
            </p>
          </div>
        </button>
      ) : null}

      <div className="relative min-h-0 flex-1">
        {/* search results */}
        {searchOpen ? (
          <div className="absolute inset-0 z-10 overflow-y-auto bg-background">
            {debouncedQ.length < 2 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Type at least 2 letters to search this class.</p>
            ) : search.isLoading ? (
              <div className="flex justify-center p-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !search.data?.length ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No messages found for “{debouncedQ}”.</p>
            ) : (
              <ul className="divide-y">
                <li className="px-4 py-2 text-xs text-muted-foreground">{search.data.length} results</li>
                {search.data.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => jumpTo(m.id)} className="w-full px-4 py-3 text-left hover:bg-muted/60">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("text-sm font-semibold", nameColor(m.author.id))}>{m.author.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {dayLabel(m.created_at)} · {timeOf(m.created_at)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                        {m.image_url ? "📷 " : ""}
                        <Highlighted text={m.body || (m.image_url ? "Photo" : "")} q={debouncedQ} />
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {/* messages */}
        <div
          ref={scroller}
          onScroll={onScroll}
          className={cn(
            "h-full overflow-y-auto px-3 py-4 sm:px-[6%]",
            "bg-[#efeae2] dark:bg-[#0b141a]",
            "[background-image:radial-gradient(rgba(11,31,58,0.06)_1px,transparent_1px)] [background-size:18px_18px]",
            "dark:[background-image:radial-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)]"
          )}
        >
          {latest.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {loadingOlder ? (
                <div className="flex justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : null}
              {!messages.length ? (
                <div className="mx-auto mt-10 max-w-xs rounded-xl bg-[#fff8c5] px-4 py-3 text-center text-sm text-[#54656f] shadow-sm dark:bg-[#182229] dark:text-[#8696a0]">
                  No messages yet. Say hello to your class 👋
                </div>
              ) : null}
              <div className="space-y-0.5">
                {rows.map((r) =>
                  r.kind === "day" ? (
                    <div key={r.key} className="flex justify-center py-3">
                      <span className="rounded-lg bg-white/90 px-3 py-1 text-xs font-medium text-[#54656f] shadow-sm dark:bg-[#182229] dark:text-[#8696a0]">
                        {r.label}
                      </span>
                    </div>
                  ) : (
                    <Bubble
                      key={r.key}
                      m={r.m}
                      first={r.first}
                      highlighted={highlight === r.m.id}
                      moderator={!!room?.is_moderator}
                      onReply={() => {
                        setReplyTo(r.m);
                        textRef.current?.focus();
                      }}
                      onDelete={() => remove(r.m)}
                      onPin={() => togglePin(r.m)}
                      onQuote={(id) => jumpTo(id)}
                      onImage={(url) => setLightbox(url)}
                      onMediaLoad={onMediaLoad}
                    />
                  )
                )}
              </div>
            </>
          )}
        </div>

        {/* back to latest */}
        {!atBottom || detached ? (
          <button
            type="button"
            onClick={backToLatest}
            className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-card text-muted-foreground shadow-lg ring-1 ring-black/5 hover:text-foreground"
            aria-label="Go to the latest message"
          >
            <ArrowDown className="h-5 w-5" />
            {unseen > 0 ? (
              <span className="absolute -top-1.5 -right-1 min-w-5 rounded-full bg-[#25D366] px-1.5 text-[11px] font-bold leading-5 text-white">
                {unseen}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>

      {/* composer */}
      <div className="shrink-0 border-t bg-[#f0f2f5] px-2 py-2 dark:bg-[#1f2c34] sm:px-4">
        {replyTo || image ? (
          <div className="mb-2 space-y-2">
            {replyTo ? (
              <div className="flex items-stretch gap-2 rounded-lg bg-white p-2 dark:bg-[#111b21]">
                <div className="w-1 shrink-0 rounded-full bg-brand" />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-xs font-semibold", nameColor(replyTo.author.id))}>
                    {replyTo.mine ? "You" : replyTo.author.name}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {replyTo.body || (replyTo.image_url ? "📷 Photo" : "")}
                  </p>
                </div>
                <button type="button" onClick={() => setReplyTo(null)} className="self-start rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Cancel reply">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}
            {image ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.preview} alt="" className="h-24 rounded-lg object-cover shadow" />
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(image.preview);
                    setImage(null);
                  }}
                  className="absolute -right-2 -top-2 rounded-full bg-black/70 p-1 text-white"
                  aria-label="Remove image"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              void pickImage(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#54656f] hover:bg-black/5 dark:text-[#8696a0] dark:hover:bg-white/5"
            aria-label="Attach an image"
            disabled={sending}
          >
            <ImagePlus className="h-6 w-6" />
          </button>
          <textarea
            ref={textRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
                e.preventDefault();
                void send();
              }
            }}
            onPaste={(e) => {
              const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
              if (f) {
                e.preventDefault();
                void pickImage(f);
              }
            }}
            placeholder={image ? "Add a caption…" : "Type a message"}
            className="max-h-[140px] min-h-[44px] flex-1 resize-none rounded-3xl bg-white px-4 py-2.5 text-[15px] leading-6 outline-none dark:bg-[#2a3942] dark:text-[#e9edef]"
          />
          <button
            type="submit"
            disabled={sending || (!text.trim() && !image)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow transition hover:bg-brand-hover disabled:opacity-50"
            aria-label="Send"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
          </button>
        </form>
        {text.length > MAX - 200 ? (
          <p className="mt-1 text-right text-[11px] text-muted-foreground">
            {text.length}/{MAX}
          </p>
        ) : null}
      </div>

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-4xl border-0 bg-black p-2">
          <DialogTitle className="sr-only">Image</DialogTitle>
          {lightbox ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lightbox} alt="" className="max-h-[85dvh] w-full rounded object-contain" />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Highlighted({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-[#25D366]/30 px-0.5 text-foreground">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function Bubble({
  m,
  first,
  highlighted,
  moderator,
  onReply,
  onDelete,
  onPin,
  onQuote,
  onImage,
  onMediaLoad,
}: {
  m: DiscussionMessage;
  first: boolean;
  highlighted: boolean;
  moderator: boolean;
  onReply: () => void;
  onDelete: () => void;
  onPin: () => void;
  onQuote: (id: string) => void;
  onImage: (url: string) => void;
  onMediaLoad: () => void;
}) {
  const mine = m.mine;
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div id={`msg-${m.id}`} className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start", first && "pt-2")}>
      {!mine ? (
        <div className="w-8 shrink-0">
          {first ? (
            <Avatar className="h-8 w-8">
              {m.author.avatar_url ? <AvatarImage src={m.author.avatar_url} alt="" className="object-cover" /> : null}
              <AvatarFallback className="text-[11px]">{getInitials(m.author.name || "?")}</AvatarFallback>
            </Avatar>
          ) : null}
        </div>
      ) : null}
      <div
        onClick={(e) => {
          // phones have no hover: tapping the bubble opens its menu (buttons inside keep their own action)
          if (m.deleted || (e.target as HTMLElement).closest("button,a")) return;
          if (window.matchMedia("(hover: none)").matches) setMenuOpen(true);
        }}
        className={cn(
          "group relative min-w-[5.5rem] max-w-[82%] rounded-lg px-2 pb-1.5 pt-1 text-[14.5px] shadow-sm sm:max-w-[65%]",
          mine ? "bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]" : "bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]",
          first && (mine ? "rounded-tr-none" : "rounded-tl-none"),
          highlighted && "ring-2 ring-brand ring-offset-2 ring-offset-[#efeae2] dark:ring-offset-[#0b141a]"
        )}
      >
        {/* tail */}
        {first ? (
          <span
            aria-hidden
            className={cn(
              "absolute top-0 h-3 w-3",
              mine
                ? "-right-2 bg-[#d9fdd3] [clip-path:polygon(0_0,100%_0,0_100%)] dark:bg-[#005c4b]"
                : "-left-2 bg-white [clip-path:polygon(0_0,100%_0,100%_100%)] dark:bg-[#202c33]"
            )}
          />
        ) : null}

        {/* menu */}
        {!m.deleted ? (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "pointer-events-none absolute right-1 top-1 z-[1] rounded-full p-0.5 text-[#54656f] opacity-0 transition [@media(hover:hover)]:pointer-events-auto [@media(hover:hover)]:group-hover:opacity-100 dark:text-[#aebac1]",
                  mine ? "bg-[#d9fdd3] dark:bg-[#005c4b]" : "bg-white dark:bg-[#202c33]"
                )}
                aria-label="Message options"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={mine ? "end" : "start"}>
              <DropdownMenuItem onClick={onReply}>
                <Reply className="mr-2 h-4 w-4" /> Reply
              </DropdownMenuItem>
              {m.body ? (
                <DropdownMenuItem
                  onClick={() => {
                    void navigator.clipboard?.writeText(m.body);
                    toast.success("Copied");
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" /> Copy
                </DropdownMenuItem>
              ) : null}
              {moderator ? (
                <DropdownMenuItem onClick={onPin}>
                  {m.is_pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
                  {m.is_pinned ? "Unpin" : "Pin"}
                </DropdownMenuItem>
              ) : null}
              {m.can_delete ? (
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {!mine && first ? (
          <p className="flex items-center gap-1.5 pr-6 text-[13px] font-semibold leading-5">
            <span className={nameColor(m.author.id)}>{m.author.name}</span>
            {m.author.badge ? (
              <span className="rounded bg-brand/10 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
                {m.author.badge}
              </span>
            ) : null}
          </p>
        ) : null}

        {m.deleted ? (
          <p className="italic text-[#667781] dark:text-[#8696a0]">
            <Ban className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
            This message was deleted
            <span aria-hidden className="inline-block w-[4.25rem]" />
          </p>
        ) : (
          <>
            {m.reply_to ? (
              <button
                type="button"
                onClick={() => onQuote(m.reply_to!.id)}
                className={cn(
                  "mb-1 mt-0.5 flex w-full items-stretch gap-2 overflow-hidden rounded-md text-left",
                  mine ? "bg-[#c7f0c0] dark:bg-[#025144]" : "bg-[#f5f6f6] dark:bg-[#1a2328]"
                )}
              >
                <span className="w-1 shrink-0 bg-brand" />
                <span className="min-w-0 py-1 pr-2">
                  <span className="block text-xs font-semibold text-brand">{m.reply_to.mine ? "You" : m.reply_to.author_name}</span>
                  <span className="block truncate text-[13px] text-[#54656f] dark:text-[#aebac1]">
                    {m.reply_to.deleted ? (
                      "This message was deleted"
                    ) : (
                      <>
                        {m.reply_to.has_image ? (
                          <ImageIcon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                        ) : null}
                        {m.reply_to.body || (m.reply_to.has_image ? "Photo" : "")}
                      </>
                    )}
                  </span>
                </span>
              </button>
            ) : null}
            {m.image_url ? (
              <button type="button" onClick={() => onImage(m.image_url!)} className="mb-1 mt-0.5 block overflow-hidden rounded-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.image_url} alt="" onLoad={onMediaLoad} className="max-h-80 w-full min-w-[180px] object-cover" />
              </button>
            ) : null}
            {m.body ? (
              <p className="whitespace-pre-wrap break-words leading-[1.35]">
                {m.body}
                <span aria-hidden className="inline-block w-[4.25rem]" />
              </p>
            ) : (
              <div className="h-3" />
            )}
          </>
        )}

        <span className="absolute bottom-1 right-2 flex items-center gap-1 text-[11px] leading-none text-[#667781] dark:text-[#8696a0]">
          {m.is_pinned ? <Pin className="h-3 w-3" /> : null}
          {timeOf(m.created_at)}
        </span>
      </div>
    </div>
  );
}
