"use client";

import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "@/services/api/notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCheck, Circle } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import type { Notification } from "@/types";

export default function NotificationsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationsApi.list().then((r) => r.data),
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("All notifications marked as read");
    },
  });

  const markOneMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const notifications: Notification[] = Array.isArray(data) ? data : (data?.data || []);
  const unreadCount = notifications.filter((n) => !n.read_at && !n.read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up!"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending}
          >
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-20">
          <Bell className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">No notifications</p>
          <p className="text-sm text-muted-foreground mt-1">
            You&apos;ll be notified when something happens.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification: Notification) => {
            // the API sends read_at; a link (site path only) opens the page the notification is about
            const isRead = !!notification.read_at || !!notification.read;
            const link = notification.meta?.link;
            const href = link && link.startsWith("/") && !link.startsWith("//") ? link : null;
            return (
            <Card
              key={notification.id}
              className={`transition-all ${!isRead ? "border-secondary/50 bg-secondary/5" : ""}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    {isRead ? (
                      <Circle className="h-2 w-2 text-muted-foreground/30" />
                    ) : (
                      <Circle className="h-2 w-2 fill-secondary text-secondary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {href ? (
                      <Link
                        href={href}
                        onClick={() => !isRead && markOneMutation.mutate(notification.id)}
                        className="text-sm font-medium hover:underline"
                      >
                        {notification.title}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium">{notification.title}</p>
                    )}
                    <p className="text-sm text-muted-foreground mt-0.5">{notification.body}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatDate(notification.created_at)}
                    </p>
                  </div>
                  {!isRead && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => markOneMutation.mutate(notification.id)}
                    >
                      Mark read
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
