"use client";

import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { learningApi } from "@/services/api/student-features";
import { cn } from "@/lib/utils";

/** A2: daily learning streak (any saved lesson progress counts as a learning day). */
export function StreakCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-streak"],
    queryFn: () => learningApi.streak().then((r) => r.data),
    staleTime: 60_000,
  });

  if (isLoading) return <Skeleton className="h-36 rounded-xl" />;
  if (!data) return null;

  const current = data.current_streak;
  const message = data.active_today
    ? "You learned today — keep it going tomorrow!"
    : current > 0
      ? "Watch a lesson today to keep your streak alive."
      : "Watch a lesson today to start a streak.";

  return (
    <Card className="border-none shadow-sm">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl",
              current > 0 ? "bg-brand-soft text-brand" : "bg-muted text-muted-foreground"
            )}
          >
            <Flame className="h-7 w-7" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Learning streak</p>
            <p className="text-3xl font-bold">
              {current} <span className="text-base font-semibold text-muted-foreground">{current === 1 ? "day" : "days"}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Best: {data.longest_streak} · {message}
            </p>
          </div>
        </div>
        <div className="sm:ml-auto">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Last 4 weeks</p>
          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
            {data.last_28_days.map((d) => (
              <span
                key={d.day}
                title={`${d.day}${d.active ? " — learned" : ""}`}
                className={cn(
                  "h-3.5 w-3.5 rounded-[4px]",
                  d.active ? "bg-brand" : "bg-muted",
                  d.day === data.today && "ring-2 ring-brand/40 ring-offset-1 ring-offset-background"
                )}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
