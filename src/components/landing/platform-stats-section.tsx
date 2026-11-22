"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Award, BookOpen, CalendarDays, GraduationCap, Users } from "lucide-react";
import apiClient from "@/services/api/client";
import { Reveal } from "@/components/ui/reveal";
import { Skeleton } from "@/components/ui/skeleton";

type PlatformStats = {
  students: number;
  courses: number;
  instructors: number;
  certificates: number;
  years: number;
  since_year: number;
};

/** Counts up once when the number scrolls into view (respects reduced motion). */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (t: number) => {
          const k = Math.min(1, (t - start) / 1200);
          setShown(Math.round(value * (1 - Math.pow(1 - k, 3))));
          if (k < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);
  return <span ref={ref}>{shown.toLocaleString()}</span>;
}

/** Real headline numbers from the database (students, courses, instructors, certificates, years). */
export function PlatformStatsSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["public-stats"],
    queryFn: () => apiClient.get<PlatformStats>("/api/public/stats").then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const items = data
    ? [
        { icon: Users, value: data.students, label: "Students" },
        { icon: BookOpen, value: data.courses, label: "Courses" },
        { icon: GraduationCap, value: data.instructors, label: "Instructors" },
        { icon: Award, value: data.certificates, label: "Certificates issued" },
        { icon: CalendarDays, value: data.years, label: "Years of experience" },
      ]
    : [];

  return (
    <section className="relative overflow-hidden border-t border-border bg-background py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Laambad in numbers</p>
          <h2 className="mt-3 text-balance text-2xl font-extrabold tracking-tight text-foreground sm:text-[2rem]">
            Empower your future with in-demand skills
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Learn anytime, anywhere with expert-led courses designed for the modern world.
            {data ? ` Teaching since ${data.since_year}.` : ""}
          </p>
        </Reveal>

        <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[132px] rounded-2xl" />)}
          {items.map(({ icon: Icon, value, label }, i) => (
            <Reveal key={label} delay={i * 70} className={i === 4 ? "col-span-2 lg:col-span-1" : undefined}>
              <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-border bg-card px-4 py-6 text-center shadow-[0_8px_28px_-20px_rgba(11,31,58,0.4)] dark:shadow-[0_8px_28px_-20px_rgba(0,0,0,0.7)]">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <p className="mt-3 text-[1.9rem] font-extrabold leading-none tracking-tight text-brand tabular-nums sm:text-[2.2rem]">
                  <CountUp value={value} />
                </p>
                <p className="mt-2 text-[12px] font-bold uppercase tracking-[0.12em] text-foreground">{label}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
