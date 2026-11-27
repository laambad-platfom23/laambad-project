"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnnouncementCard, AnnouncementForm } from "@/components/learning/announcements-panel";
import { announcementsApi } from "@/services/api/course-extras";
import { coursesApi } from "@/services/api/courses";
import { useAuthStore } from "@/store/auth-store";
import { isAdminUser, isStaffUser } from "@/lib/auth-routing";
import { decodeHtmlEntities } from "@/lib/html-entities";

/** Staff: post and manage course announcements. Students: the announcements of their courses. */
export default function AnnouncementsPage() {
  const user = useAuthStore((s) => s.user);
  const staff = !!user && isStaffUser(user);
  const admin = !!user && isAdminUser(user);
  const [courseId, setCourseId] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["announcements", "dashboard"],
    queryFn: () => announcementsApi.dashboard().then((r) => r.data),
    enabled: !!user,
  });
  const { data: courses } = useQuery({
    queryKey: ["announcement-courses", admin],
    queryFn: () => coursesApi.list(1, 100, !admin).then((r) => r.data.data),
    enabled: staff,
  });
  const list = data?.data ?? [];

  if (!user) return <Skeleton className="h-64 rounded-xl" />;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Megaphone className="h-7 w-7 text-primary" /> Announcements
        </h1>
        <p className="mt-1 text-muted-foreground">
          {staff
            ? "Send news to the students of a course. They see it on the course's Announcements tab and get a notification."
            : "News from the instructors of your courses."}
        </p>
      </div>

      {staff ? (
        <div className="space-y-2">
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger className="max-w-xl">
              <SelectValue placeholder="Choose the course to post to" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {(courses ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {decodeHtmlEntities(c.title)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {courseId ? <AnnouncementForm courseId={courseId} /> : null}
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : !list.length ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            <Megaphone className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            {staff ? "No announcements yet. Choose a course above to post the first one." : "No announcements in your courses yet."}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {list.map((a) => (
            <AnnouncementCard key={a.id} a={a} canEdit={!!data?.staff} showCourse />
          ))}
        </ul>
      )}
    </div>
  );
}
