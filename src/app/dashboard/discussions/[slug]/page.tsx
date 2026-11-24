"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ArrowLeft, Loader2, MessagesSquare, Pin, PinOff, Reply, Send, Trash2, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { discussionsApi, type DiscussionMessage } from "@/services/api/student-features";
import { cn, getApiErrorMessage, getInitials, timeAgo } from "@/lib/utils";
import { toast } from "sonner";

const MAX = 2000;

/** A2: the class room of one course. Messages are shown as plain text. Refreshes every 20 s. */
export default function DiscussionRoomPage() {
  const params = useParams();
  const slug = typeof params.slug === "string" ? decodeURIComponent(params.slug) : "";
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<DiscussionMessage | null>(null);

  const key = ["discussion", slug];
  const { data, isLoading, isError, error } = useQuery({
    queryKey: key,
    queryFn: () => discussionsApi.list(slug).then((r) => r.data),
    enabled: !!slug,
    refetchInterval: 20_000,
    retry: false,
  });

  const post = useMutation({
    mutationFn: () => discussionsApi.post(slug, body.trim(), replyTo?.id ?? null),
    onSuccess: () => {
      setBody("");
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not send the message")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => discussionsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not delete")),
  });
  const pin = useMutation({
    mutationFn: (m: DiscussionMessage) => discussionsApi.pin(m.id, !m.is_pinned),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not pin")),
  });

  if (isError) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
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

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || post.isPending) return;
    post.mutate();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/dashboard/discussions" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Classes
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
            <MessagesSquare className="h-6 w-6 shrink-0 text-primary" />
            <span className="truncate">{data?.course.title ?? "Class discussion"}</span>
          </h1>
          {data ? (
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-4 w-4" /> {data.member_count} students in this class
            </p>
          ) : null}
        </div>
        {data ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/learn/${encodeURIComponent(data.course.slug)}`}>Open course</Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={send} className="space-y-2">
            {replyTo ? (
              <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-1.5 text-xs">
                <span className="truncate">
                  Replying to <strong>{replyTo.author.name}</strong>
                </span>
                <button type="button" className="font-medium text-brand" onClick={() => setReplyTo(null)}>
                  Cancel
                </button>
              </div>
            ) : null}
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, MAX))}
              placeholder="Write a question or a note for your class…"
              rows={3}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(e);
              }}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {body.length}/{MAX} · Be respectful. Do not share passwords or payment details.
              </span>
              <Button type="submit" size="sm" disabled={!body.trim() || post.isPending}>
                {post.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : !data?.data.length ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Start the conversation!</p>
      ) : (
        <div className="space-y-3">
          {data.data.map((m) => (
            <Card key={m.id} className={cn(m.is_pinned && "border-brand/40")}>
              <CardContent className="space-y-3 p-4">
                <MessageRow
                  m={m}
                  moderator={data.is_moderator}
                  onReply={() => setReplyTo(m)}
                  onDelete={() => window.confirm("Delete this message?") && remove.mutate(m.id)}
                  onPin={() => pin.mutate(m)}
                />
                {m.replies.length ? (
                  <div className="ml-6 space-y-3 border-l pl-4">
                    {m.replies.map((r) => (
                      <MessageRow
                        key={r.id}
                        m={r}
                        moderator={false}
                        onDelete={() => window.confirm("Delete this reply?") && remove.mutate(r.id)}
                      />
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageRow({
  m,
  moderator,
  onReply,
  onDelete,
  onPin,
}: {
  m: DiscussionMessage;
  moderator: boolean;
  onReply?: () => void;
  onDelete?: () => void;
  onPin?: () => void;
}) {
  return (
    <div className="flex gap-3">
      <Avatar className="h-9 w-9 shrink-0">
        {m.author.avatar_url ? <AvatarImage src={m.author.avatar_url} alt="" className="object-cover" /> : null}
        <AvatarFallback className="text-xs">{getInitials(m.author.name || "?")}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold">{m.author.name}</span>
          {m.author.is_staff ? <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">Instructor</Badge> : null}
          {m.is_pinned ? (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-brand">
              <Pin className="h-3 w-3" /> Pinned
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {timeAgo(m.created_at)}
          </span>
        </div>
        {m.deleted ? (
          <p className="mt-1 text-sm italic text-muted-foreground">This message was deleted.</p>
        ) : (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</p>
        )}
        {!m.deleted ? (
          <div className="mt-1.5 flex gap-3 text-xs">
            {onReply ? (
              <button type="button" onClick={onReply} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                <Reply className="h-3.5 w-3.5" /> Reply
              </button>
            ) : null}
            {moderator && onPin ? (
              <button type="button" onClick={onPin} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                {m.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                {m.is_pinned ? "Unpin" : "Pin"}
              </button>
            ) : null}
            {m.can_delete && onDelete ? (
              <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
