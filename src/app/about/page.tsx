"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  HeartHandshake,
  Target,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingSiteHeader } from "@/components/landing/marketing-site-header";
import { OurTeamSection } from "@/components/landing/our-team-section";
import { ClientsPartnersSection } from "@/components/landing/clients-partners-section";
import { SiteFooter } from "@/components/landing/site-footer";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";
import { usePublicCategories } from "@/hooks/use-public-categories";
import { subjectCategories } from "@/lib/category-display";
import { SODEMY_ABOUT_BLURB } from "@/lib/sodemy-team";
import { resolveSiteImage, useSiteSettings } from "@/hooks/use-site-settings";

const values = [
  {
    icon: Target,
    title: "Real skills",
    text: "Job-focused curriculum — projects, tools, and portfolios students can be proud of.",
  },
  {
    icon: Users,
    title: "Expert instructors",
    text: "Instructors with hands-on, real-world experience in the subjects they teach.",
  },
  {
    icon: Award,
    title: "Recognized certificates",
    text: "Complete training with a certificate — ready for employment or freelancing.",
  },
  {
    icon: HeartHandshake,
    title: "A supportive community",
    text: "A Mogadishu campus that connects, supports, and opens market opportunities for students.",
  },
];

export default function AboutPage() {
  const { data: aboutCategories } = usePublicCategories();
  const { data: settings } = useSiteSettings();
  const leadershipSrc = resolveSiteImage(settings, "about_leadership_image");

  return (
    <div className="min-h-screen bg-white dark:bg-background">
      <MarketingSiteHeader showPromo={false} />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[#0B1F3A]/10 dark:border-transparent">
        <div className="absolute inset-0 bg-[#0B1F3A]" />
        <div
          className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-white/10 hidden motion-safe:animate-hero-glow"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-[#E84A27]/20 hidden motion-safe:animate-hero-glow"
          aria-hidden
          style={{ animationDelay: "1.2s" }}
        />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
          <Reveal className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/75">
              About us
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl lg:leading-[1.1]">
              Laambad —{" "}
              <span className="text-[#C4D4F4]">E-learning platform</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/90 sm:text-lg">
              {SODEMY_ABOUT_BLURB}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                size="lg"
                className="btn-sheen h-12 rounded-full bg-white px-7 text-base font-semibold text-[#0B1F3A] shadow-lg transition duration-300 hover:-translate-y-0.5 hover:bg-white/90"
                asChild
              >
                <Link href="/courses">Browse Courses</Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 rounded-full border-2 border-white bg-transparent px-7 text-base font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-white hover:text-[#0B1F3A]"
                asChild
              >
                <Link href="/register">Start Learning</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Story */}
      <section className="relative overflow-hidden py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-14">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0B1F3A] dark:text-white/80">
              Our story
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#0B1F3A] dark:text-white sm:text-3xl">
              We built Laambad so young people can gain skills &amp; opportunity
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#0A1830]/90 dark:text-white/85">
              In a digital world, skills open doors. Laambad brings together experienced instructors and ambitious students in practical, high-quality online courses.
            </p>
            <p className="mt-3 text-base leading-relaxed text-[#0A1830]/85 dark:text-white/75">
              Our goal is to develop professionals who can get hired, freelance, or build a business — with a strong portfolio and real confidence.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                "Offline classrooms",
                "Project-based learning",
                "Industry tools",
                "Career-ready skills",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2.5 text-sm font-semibold text-[#0B1F3A] dark:text-white"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0B1F3A] text-white dark:bg-white dark:text-[#0B1F3A]">
                    <BookOpen className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={100} variant="scale">
            <div className="relative">
              <div
                className="pointer-events-none absolute -inset-3 rounded-[2rem] bg-[#0B1F3A]/15 hidden dark:bg-[#E84A27]/20"
                aria-hidden
              />
              <div className="relative overflow-hidden rounded-[1.75rem] border border-[#0B1F3A]/20 shadow-xl dark:border-white/20">
                <div className="relative aspect-[4/3]">
                  <Image
                    src={leadershipSrc}
                    alt="Laambad leadership"
                    fill
                    sizes="(max-width: 1024px) 100vw, 46vw"
                    className="object-cover object-top"
                    priority
                    unoptimized={leadershipSrc.startsWith("http")}
                  />
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-[#030A14]/85 px-6 pb-6 pt-16">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF6B45]">
                    Leadership
                  </p>
                  <p className="mt-1 text-lg font-bold text-white">
                    Guided by a clear education vision
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Values */}
      <section className="border-y border-[#0B1F3A]/12 bg-[#F5F8FD] py-16 dark:border-white/10 dark:bg-[#061528] sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0B1F3A] dark:text-white/80">
              What we stand for
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#0B1F3A] dark:text-white sm:text-3xl">
              Our values
            </h2>
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v, i) => (
              <Reveal key={v.title} delay={i * 70}>
                <div
                  className={cn(
                    "h-full rounded-2xl border p-6 transition duration-300",
                    "border-[#0B1F3A]/15 bg-white shadow-sm",
                    "hover:-translate-y-1 hover:border-[#0B1F3A]/35 hover:shadow-lg",
                    "dark:border-white/15 dark:bg-[#0B1F3A]/70 dark:hover:border-white/40",
                  )}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0B1F3A] text-white shadow-sm dark:bg-white dark:text-[#0B1F3A]">
                    <v.icon className="h-6 w-6" strokeWidth={2.25} aria-hidden />
                  </div>
                  <h3 className="mt-4 text-base font-bold text-[#0B1F3A] dark:text-white">
                    {v.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#0A1830]/85 dark:text-white/75">
                    {v.text}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Tracks strip */}
      <section className="py-14 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="mb-8 text-center">
            <h2 className="text-2xl font-extrabold tracking-tight text-[#0B1F3A] dark:text-white sm:text-3xl">
              Course categories
            </h2>
            <p className="mt-2 text-[#0A1830]/90 dark:text-white/80">
              Choose your path — start high-quality training today.
            </p>
          </Reveal>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {subjectCategories(aboutCategories).map((cat, i) => (
              <Reveal key={cat.slug} delay={i * 50}>
                <Link
                  href={`/courses?category=${cat.slug}`}
                  className={cn(
                    "inline-flex rounded-full border px-4 py-2 text-sm font-semibold transition duration-300",
                    "border-[#0B1F3A]/25 bg-[#F5F8FD] text-[#0B1F3A]",
                    "hover:-translate-y-0.5 hover:border-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-white",
                    "dark:border-white/25 dark:bg-white/10 dark:text-white dark:hover:bg-white dark:hover:text-[#0B1F3A]",
                  )}
                >
                  {cat.name}
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <OurTeamSection />
      <ClientsPartnersSection />

      {/* CTA */}
      <section className="relative overflow-hidden border-t border-white/15 bg-[#0B1F3A] py-16 sm:py-20">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 hidden"
          aria-hidden
        />
        <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6" variant="scale">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready to get started?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-white/90">
            Join Laambad — start training, build your portfolio, and open new opportunities.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button
              size="lg"
              className="btn-sheen h-12 rounded-full bg-white px-8 text-base font-semibold text-[#0B1F3A] shadow-lg transition duration-300 hover:-translate-y-0.5 hover:bg-white/90"
              asChild
            >
              <Link href="/register" className="inline-flex items-center gap-2">
                Sign Up for Free
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 rounded-full border-2 border-white bg-transparent px-8 text-base font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-white hover:text-[#0B1F3A]"
              asChild
            >
              <Link href="/courses">View Courses</Link>
            </Button>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  );
}
