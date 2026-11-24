"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import { dashboardApi } from "@/services/api/dashboard";
import { certificatesApi } from "@/services/api/certificates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EnrolledCourseCard } from "@/components/dashboard/enrolled-course-card";
import { StreakCard } from "@/components/dashboard/streak-card";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  Award,
  CheckCircle2,
  Clock,
  GraduationCap,
  Trophy,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import type { DashboardOverview, Certificate } from "@/types";

export default function MyLearningPage() {
  const userId = useAuthStore((s) => s.user?.id ?? "");
  const { data: overview, isLoading } = useQuery<DashboardOverview>({
    queryKey: ["dashboard-overview", userId],
    queryFn: async () => {
      const res = await dashboardApi.overview();
      return res.data;
    },
    enabled: !!userId,
  });

  const { data: certificates } = useQuery<Certificate[]>({
    queryKey: ["my-certificates"],
    queryFn: async () => {
      const res = await certificatesApi.list();
      return res.data.data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const stats = [
    {
      label: "Total Enrolled",
      value: overview?.total_enrolled ?? 0,
      icon: BookOpen,
      color: "bg-brand-soft text-brand",
    },
    {
      label: "Active Courses",
      value: overview?.active_courses ?? 0,
      icon: Clock,
      color: "bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-white",
    },
    {
      label: "Completed",
      value: overview?.completed_courses ?? 0,
      icon: CheckCircle2,
      color: "bg-success-soft text-success",
    },
    {
      label: "Certificates",
      value: overview?.total_certificates ?? 0,
      icon: Award,
      color: "bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-white",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <GraduationCap className="h-7 w-7 text-primary" />
          My Learning
        </h1>
        <p className="text-muted-foreground mt-1">
          Track your progress, courses, and achievements.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card
            key={s.label}
            className="hover:shadow-lg transition-all duration-200 border-none shadow-sm"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">
                    {s.label}
                  </p>
                  <p className="text-3xl font-bold mt-1">{s.value}</p>
                </div>
                <div className={`p-3 rounded-2xl ${s.color}`}>
                  <s.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* A2: daily learning streak */}
      <StreakCard />

      {/* Enrolled Courses */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            My Courses
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!overview?.courses?.length ? (
            <div className="text-center py-16">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <h3 className="mt-4 text-lg font-semibold">No courses yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Enroll in a course to start learning!
              </p>
              <Link href="/courses">
                <Button className="mt-4" size="sm">
                  Browse catalog
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {overview.courses.map((course) => (
                <EnrolledCourseCard key={course.course_id} course={course} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Certificates */}
      {certificates && certificates.length > 0 && (
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                My Certificates
              </CardTitle>
              <Link href="/dashboard/certificates">
                <Button variant="ghost" size="sm">
                  View All <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {certificates.slice(0, 3).map((cert) => (
                <div
                  key={cert.id}
                  className="p-4 rounded-xl border bg-amber-50 dark:bg-amber-950/25"
                >
                  <div className="flex items-center gap-3">
                    <Award className="h-8 w-8 text-amber-500" />
                    <div className="min-w-0">
                      <p className="font-semibold truncate text-sm">
                        {cert.course?.title ?? "Course"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Issued{" "}
                        {new Date(cert.issued_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2 font-mono">
                    ID: {cert.verification_id}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
