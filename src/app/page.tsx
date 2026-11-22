"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Users, BookOpen, Play, Award } from "lucide-react";
import { FeaturedCoursesSection } from "@/components/landing/featured-courses";
import { MarketingSiteHeader } from "@/components/landing/marketing-site-header";
import { HeroEconomicBackdrop } from "@/components/landing/hero-economic-backdrop";
import { HeroCeoShowcase } from "@/components/landing/hero-ceo-showcase";
import { HeroRotatingBadge } from "@/components/landing/hero-rotating-badge";
import { HeroRotatingTitle } from "@/components/landing/hero-rotating-title";
import { CategoryPillarsSection } from "@/components/landing/category-pillars-section";
import { OurTeamSection } from "@/components/landing/our-team-section";
import { PlatformStatsSection } from "@/components/landing/platform-stats-section";
import { InstructorsSection } from "@/components/landing/instructors-section";
import { ClientsPartnersSection } from "@/components/landing/clients-partners-section";
import { AboutTeaserSection } from "@/components/landing/about-teaser-section";
import { HomeSocialDock } from "@/components/landing/home-social-dock";
import { SiteFooter } from "@/components/landing/site-footer";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";
import { SODEMY_HERO_DESCRIPTION } from "@/lib/sodemy-categories";
import { usePublicCategories } from "@/hooks/use-public-categories";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/services/api/client";
import { subjectCategories } from "@/lib/category-display";

export default function LandingPage() {
  const { data: heroCategories } = usePublicCategories();
  const categoryCount = subjectCategories(heroCategories).length;
  // same query/key as the stats section → one request
  const { data: stats } = useQuery({
    queryKey: ["public-stats"],
    queryFn: () => apiClient.get<{ students: number }>("/api/public/stats").then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
  return (
    <div className="min-h-screen bg-white dark:bg-background">
      <MarketingSiteHeader />
      <HomeSocialDock />

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden border-b border-[#0B1F3A]/[0.08] bg-[#F5F8FC] dark:border-transparent dark:bg-[#030A14]">
        <HeroEconomicBackdrop />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8 lg:py-10">
          <div className="grid items-center gap-8 sm:gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] lg:items-stretch lg:gap-8 xl:gap-10">
            <div className="hero-stagger flex max-w-xl flex-col justify-center self-stretch lg:max-w-none">
              <HeroRotatingBadge />
              <h1 className="font-bold leading-[1.08] tracking-[-0.02em] text-[clamp(1.35rem,0.55rem+3.5vw,3.05rem)] sm:leading-[1.06] lg:leading-[1.05]">
                <HeroRotatingTitle />
              </h1>
              <p className="mt-4 max-w-xl border-l-[3px] border-[#E84A27]/70 pl-4 text-base font-medium leading-relaxed tracking-wide text-[#334155] dark:border-white dark:text-white sm:mt-5 sm:pl-5 sm:text-lg">
                {SODEMY_HERO_DESCRIPTION}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  size="lg"
                  className="btn-sheen h-11 rounded-full border-2 border-[#E84A27] bg-[#E84A27] px-7 text-sm font-semibold text-white shadow-md shadow-[#E84A27]/30 transition duration-300 hover:-translate-y-0.5 hover:bg-[#D03F1F] hover:border-[#D03F1F] hover:shadow-lg dark:border-[#FF6B45] dark:bg-[#E84A27] dark:hover:bg-[#FF6B45] sm:text-base"
                  asChild
                >
                  <Link href="/register">Start Learning Free</Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-11 rounded-full border-2 border-[#0B1F3A]/80 bg-white/90 px-7 text-sm font-semibold text-[#0B1F3A] shadow-sm shadow-[#0B1F3A]/10 backdrop-blur-sm transition duration-300 hover:-translate-y-0.5 hover:border-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-white dark:border-white dark:bg-transparent dark:text-white dark:shadow-none dark:hover:bg-white dark:hover:text-[#0B1F3A] sm:text-base"
                  asChild
                >
                  <Link href="#courses" className="inline-flex items-center gap-2 text-inherit">
                    <Play className="h-4 w-4 shrink-0 text-inherit transition-transform duration-300 group-hover:scale-110" aria-hidden />
                    Browse Courses
                  </Link>
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2.5 text-xs sm:mt-5 sm:gap-3 sm:text-sm">
                {[
                  { icon: Users, label: stats ? `${stats.students.toLocaleString()} arday` : "Arday badan" },
                  { icon: BookOpen, label: categoryCount ? `${categoryCount} categories` : "Online courses" },
                  { icon: Award, label: "Certificates" },
                ].map(({ icon: Icon, label }, i) => (
                  <span
                    key={label}
                    style={{ animationDelay: `${0.4 + i * 0.08}s` }}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-4 py-2 font-semibold",
                      "border-[#0B1F3A]/12 bg-white/85 text-[#0B1F3A] shadow-[0_8px_24px_-12px_rgba(11,31,58,0.28)] backdrop-blur-sm",
                      "transition duration-300 hover:-translate-y-0.5 hover:border-[#E84A27]/35 hover:shadow-md",
                      "dark:border-white/40 dark:bg-white/15 dark:text-white dark:shadow-none dark:backdrop-blur-sm dark:hover:border-white/60",
                      "motion-safe:animate-fade-in",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-[#E84A27] dark:text-white" aria-hidden />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <HeroCeoShowcase />
          </div>
        </div>
      </section>

      <PlatformStatsSection />

      <CategoryPillarsSection />

      <FeaturedCoursesSection />

      <InstructorsSection />

      <OurTeamSection />

      {/* ─── Become an Instructor ─── */}
      <section className="py-16 bg-gray-50 dark:bg-[#02060E]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-2xl bg-[#0B1F3A] p-8 sm:p-12 dark:bg-[#061528]">
              <div
                className="absolute right-0 top-0 h-80 w-80 translate-x-20 -translate-y-20 rounded-full bg-white/10 hidden motion-safe:animate-hero-glow"
                aria-hidden
              />
              <div className="relative max-w-lg">
                <h2 className="text-2xl font-bold text-white sm:text-3xl">Teach with Laambad</h2>
                <p className="mt-3 text-white/90">
                  Ma tahay macallin xirfadle ah? Ka mid noqo macallimiinta Laambad oo la wadaag aqoontaada arday badan.
                </p>
                <Link href="/register">
                  <Button
                    size="lg"
                    className="btn-sheen mt-6 rounded-full border-2 border-[#E84A27] bg-[#E84A27] font-semibold text-white shadow-md shadow-[#E84A27]/35 transition duration-300 hover:-translate-y-0.5 hover:border-[#D03F1F] hover:bg-[#D03F1F] hover:shadow-lg dark:border-[#FF6B45] dark:bg-[#E84A27] dark:hover:bg-[#FF6B45]"
                  >
                    Start Teaching Today
                  </Button>
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <ClientsPartnersSection />

      <AboutTeaserSection />

      {/* ─── CTA ─── */}
      <section className="relative overflow-hidden border-t border-white/15 bg-[#0B1F3A] py-16 sm:py-20">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 hidden motion-safe:animate-hero-glow"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-white/5 hidden motion-safe:animate-hero-glow"
          aria-hidden
          style={{ animationDelay: "1.5s" }}
        />
        <Reveal className="relative mx-auto max-w-7xl px-4 text-center sm:px-6" variant="scale">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">Laambad</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Bilow tababar tayo leh maanta
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-white/90">
            Ku soo biir Laambad — madal waxbarasho oo online ah oo bixisa koorsooyin tayo leh.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/register">
              <Button
                size="lg"
                className="btn-sheen h-12 rounded-full border-2 border-[#E84A27] bg-[#E84A27] px-8 text-base font-semibold text-white shadow-lg shadow-[#E84A27]/35 transition duration-300 hover:-translate-y-0.5 hover:bg-[#D03F1F] hover:border-[#D03F1F]"
              >
                Sign Up for Free
              </Button>
            </Link>
            <Link href="/login">
              <Button
                size="lg"
                variant="outline"
                className="h-12 rounded-full border-2 border-white bg-transparent px-8 text-base font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-white hover:text-[#0B1F3A]"
              >
                Log In
              </Button>
            </Link>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  );
}
