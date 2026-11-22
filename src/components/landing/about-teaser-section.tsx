"use client";

import { usePublicCategories } from "@/hooks/use-public-categories";
import { subjectCategories } from "@/lib/category-display";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, MapPin, School } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";
import { SODEMY_ABOUT_BLURB } from "@/lib/sodemy-team";
import { resolveSiteImage, useSiteSettings } from "@/hooks/use-site-settings";
import { resolveSiteVideoEmbed } from "@/lib/site-video";

export function AboutTeaserSection({ className }: { className?: string }) {
  const { data: teaserCategories } = usePublicCategories();
  const categoryCount = subjectCategories(teaserCategories).length;
  const { data: settings } = useSiteSettings();
  const aboutSrc = resolveSiteImage(settings, "about_image");
  const video = resolveSiteVideoEmbed(settings?.about_video);

  return (
    <section
      id="about"
      className={cn(
        "relative scroll-mt-20 overflow-hidden border-t py-16 sm:py-20",
        "border-[#0B1F3A]/12 bg-white dark:border-white/10 dark:bg-background",
        className,
      )}
    >
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <Reveal>
            <div className="relative overflow-hidden rounded-[1.75rem] border border-[#0B1F3A]/15 bg-white p-2 shadow-sm dark:border-white/15 dark:bg-[#061528]">
              <div className="relative aspect-[16/10] overflow-hidden rounded-[1.35rem] bg-[#02060E] sm:aspect-[16/11]">
                {video ? (
                  <iframe
                    title="Laambad — About"
                    src={video.embedSrc}
                    className="absolute inset-0 h-full w-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                ) : (
                  <>
                    <Image
                      src={aboutSrc}
                      alt="Laambad E-learning platform — learning tracks and tools"
                      fill
                      sizes="(max-width: 1024px) 100vw, 48vw"
                      className="object-cover object-center"
                      unoptimized={aboutSrc.startsWith("http")}
                    />
                    <div
                      className="pointer-events-none absolute inset-0 bg-[#0B1F3A]/25"
                      aria-hidden
                    />
                  </>
                )}
              </div>
              {!video && (
                <div className="absolute bottom-5 left-5 right-5 flex flex-wrap gap-2 sm:bottom-6 sm:left-6 sm:right-auto">
                  {[
                    { icon: MapPin, label: "Taleh Hodon, Mogadishu" },
                    { icon: BookOpen, label: categoryCount ? `${categoryCount} categories` : "Online courses" },
                    { icon: School, label: "E-learning" },
                  ].map(({ icon: Icon, label }) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-[#030A14]/75 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-[#FF6B45]" aria-hidden />
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Reveal>

          <Reveal delay={120}>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0B1F3A] dark:text-white/80">
              About Laambad
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#0B1F3A] dark:text-white sm:text-3xl lg:text-[2.1rem] lg:leading-tight">
              Digital skills training for the future
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#0A1830]/90 dark:text-white/85 sm:text-[1.05rem]">
              {SODEMY_ABOUT_BLURB}
            </p>
            <p className="mt-3 text-base leading-relaxed text-[#0A1830]/80 dark:text-white/75">
              Students learn from experienced instructors, follow a quality curriculum, and earn a recognized certificate — ready for freelancing or professional work.
            </p>
            <div className="mt-8">
              <Button
                size="lg"
                className="btn-sheen h-12 rounded-full border-2 border-[#E84A27] bg-[#E84A27] px-8 text-base font-semibold text-white shadow-md shadow-[#E84A27]/30 transition duration-300 hover:-translate-y-0.5 hover:bg-[#D03F1F] hover:border-[#D03F1F] hover:shadow-lg dark:border-[#FF6B45] dark:bg-[#E84A27] dark:text-white dark:hover:bg-[#FF6B45]"
                asChild
              >
                <Link href="/about" className="inline-flex items-center gap-2">
                  About Us
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
