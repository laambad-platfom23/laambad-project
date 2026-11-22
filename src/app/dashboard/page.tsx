"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import { isStaffUser } from "@/lib/auth-routing";
import { dashboardApi } from "@/services/api/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, BookOpen, FlaskConical, ClipboardList, TrendingUp, Activity, Loader2 } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function formatMomPct(pct: number | undefined): string {
  if (pct === undefined || Number.isNaN(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/** One brand style for KPI icons: navy tiles, orange for the headline metric. */
const statStyles = [
  "bg-brand-soft text-brand",
  "bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-white",
  "bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-white",
  "bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-white",
];

export default function DashboardPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const staff = !!(user && isStaffUser(user));

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard-institute-stats", user?.id],
    queryFn: async () => {
      const res = await dashboardApi.instituteStats();
      return res.data;
    },
    enabled: staff,
  });

  useEffect(() => {
    if (user && !isStaffUser(user)) {
      router.replace("/dashboard/my-learning");
    }
  }, [user, router]);

  const stats = useMemo(() => {
    if (!data) return [];
    return [
      {
        title: "Learners",
        value: formatCount(data.counts.learners),
        change: formatMomPct(data.learners_mom_pct),
        icon: Users,
        color: statStyles[0],
      },
      {
        title: "Programmes",
        value: formatCount(data.counts.programmes),
        change: "—",
        icon: BookOpen,
        color: statStyles[1],
      },
      {
        title: "Research papers",
        value: formatCount(data.counts.research_papers),
        change: "—",
        icon: FlaskConical,
        color: statStyles[2],
      },
      {
        title: "Case & finance tasks",
        value: formatCount(data.counts.assignment_tasks),
        change: "—",
        icon: ClipboardList,
        color: statStyles[3],
      },
    ];
  }, [data]);

  const enrollmentChart = useMemo(
    () =>
      (data?.enrollment_trend ?? []).map((row) => ({
        month: row.month,
        enrollments: row.count,
      })),
    [data]
  );

  const activityChart = useMemo(() => data?.weekly_activity ?? [], [data]);

  if (!user) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!isStaffUser(user)) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Opening your learning space…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0B1F3A] dark:text-white">
          Dashboard
        </h1>
        <p className="mt-1 text-muted-foreground">Your learning and platform activity at a glance.</p>
      </div>

      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load institute statistics."}
        </p>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading &&
          [0, 1, 2, 3].map((i) => (
            <Card key={i} className="border-[#0B1F3A]/10 shadow-sm dark:border-white/20">
              <CardContent className="p-6">
                <div className="h-20 animate-pulse rounded-lg bg-muted" />
              </CardContent>
            </Card>
          ))}
        {!isLoading &&
          stats.map((stat) => (
            <Card
              key={stat.title}
              className="shadow-sm transition-shadow hover:border-brand/30 hover:shadow-md"
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className="text-2xl font-bold mt-1">{stat.value}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <TrendingUp className="h-3 w-3 text-success" />
                      <span className="text-xs font-medium text-muted-foreground">{stat.change}</span>
                    </div>
                  </div>
                  <div className={`p-3 rounded-xl ${stat.color}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Enrollment Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {isLoading ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={enrollmentChart}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "0.75rem",
                        color: "hsl(var(--foreground))",
                      }}
                    />
                    <Area type="monotone" dataKey="enrollments" stroke="hsl(var(--brand))" strokeWidth={2} fill="hsl(var(--brand))" fillOpacity={0.18} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Weekly Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {isLoading ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityChart}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "0.75rem",
                        color: "hsl(var(--foreground))",
                      }}
                    />
                    <Bar dataKey="submissions" fill="hsl(var(--brand))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="reviews" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            A live activity feed is not wired yet; KPIs and charts above reflect your database.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
