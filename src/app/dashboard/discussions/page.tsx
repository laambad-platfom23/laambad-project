"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MessagesSquare, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { discussionsApi } from "@/services/api/student-features";
import { timeAgo } from "@/lib/utils";

/** A2: the class rooms (one per course) the user belongs to. */
export default function DiscussionsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["discussion-rooms"],
    queryFn: () => discussionsApi.rooms().then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <MessagesSquare className="h-7 w-7 text-primary" />
          Group discussion
        </h1>
        <p className="mt-1 text-muted-foreground">
          Every course has its own class. Ask questions, share notes and help each other.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : !data?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center">
            <Users className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 font-semibold">No classes yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Enroll in a course to join its class discussion.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {data.map((r) => (
            <Link
              key={r.course_id}
              href={`/dashboard/discussions/${encodeURIComponent(r.course_slug)}`}
              className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-muted/50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <MessagesSquare className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.course_title}</p>
                <p className="text-xs text-muted-foreground">
                  {r.message_count} {r.message_count === 1 ? "message" : "messages"}
                  {r.last_message_at ? ` · last ${timeAgo(r.last_message_at)}` : ""}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
