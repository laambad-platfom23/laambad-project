"use client";

import Image from "next/image";
import { Linkedin, Mail } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";
import { resolveTeamMembers, type TeamMember } from "@/lib/sodemy-team";
import { useSiteSettings } from "@/hooks/use-site-settings";
import type { SiteSettingsMap } from "@/services/api/site-settings";

function memberImageSrc(member: TeamMember, settings?: SiteSettingsMap): string {
  if (member.imageKey) {
    const fromSettings = settings?.[member.imageKey]?.trim();
    if (fromSettings) return fromSettings;
  }
  return member.imageFallback?.trim() || "";
}

function TeamAvatar({
  member,
  settings,
}: {
  member: TeamMember;
  settings?: SiteSettingsMap;
}) {
  const src = memberImageSrc(member, settings);
  if (src) {
    return (
      <div className="relative mx-auto aspect-[4/5] w-full overflow-hidden rounded-2xl bg-[#EEF2F9] dark:bg-[#061528]">
        <Image
          src={src}
          alt={member.name}
          fill
          sizes="(max-width: 640px) 80vw, (max-width: 1024px) 40vw, 22vw"
          className="object-cover object-top transition duration-500 group-hover:scale-[1.04]"
          unoptimized={src.startsWith("http")}
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[#0B1F3A]/40 opacity-80"
          aria-hidden
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative mx-auto flex aspect-[4/5] w-full items-end overflow-hidden rounded-2xl p-6",
        member.accent,
      )}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10 hidden"
        aria-hidden
      />
      <span className="relative text-5xl font-extrabold tracking-tight text-white/95 sm:text-6xl">
        {member.initials}
      </span>
    </div>
  );
}

export function OurTeamSection({ className }: { className?: string }) {
  const { data: settings } = useSiteSettings();
  const team = resolveTeamMembers(settings);

  return (
    <section
      id="team"
      className={cn(
        "relative scroll-mt-20 overflow-hidden border-t py-16 sm:py-20",
        "border-[#0B1F3A]/12 bg-white dark:border-white/10 dark:bg-[#02060E]",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[3px] w-28 -translate-x-1/2 bg-[#E84A27] dark:bg-[#FF6B45] sm:w-36"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-24 top-24 h-64 w-64 rounded-full bg-[#0B1F3A]/8 hidden dark:bg-[#E84A27]/10"
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0B1F3A] dark:text-white/80">
            Our team
          </p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#0B1F3A] dark:text-white sm:text-3xl">
            Instructors &amp; leaders
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[#0A1830]/90 dark:text-white/85">
            A skilled team dedicated to helping Laambad students grow in digital careers.
          </p>
        </Reveal>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-7">
          {team.map((member, i) => (
            <Reveal key={member.id} delay={i * 80}>
              <article
                className={cn(
                  "group relative flex h-full flex-col rounded-2xl border p-3 pb-5 transition duration-300",
                  "border-[#0B1F3A]/15 bg-[#F5F8FD]/60 shadow-sm",
                  "hover:-translate-y-1.5 hover:border-[#E84A27]/40 hover:shadow-lg hover:shadow-[#E84A27]/10",
                  "dark:border-white/15 dark:bg-[#030A14]/80 dark:hover:border-[#E84A27]/50",
                )}
              >
                <div className="relative">
                  <TeamAvatar member={member} settings={settings} />
                  <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex h-9 w-9 items-center justify-center rounded-full border-2 transition",
                        "border-[#E84A27]/50 bg-[#E84A27] text-white shadow-sm",
                        "hover:border-[#D03F1F] hover:bg-[#D03F1F]",
                        "dark:border-[#FF6B45] dark:bg-[#E84A27] dark:hover:bg-[#FF6B45]",
                      )}
                      aria-hidden
                    >
                      <Linkedin className="h-4 w-4" />
                    </span>
                    <span
                      className={cn(
                        "inline-flex h-9 w-9 items-center justify-center rounded-full border-2 transition",
                        "border-[#E84A27]/55 bg-white text-[#E84A27] shadow-sm",
                        "hover:bg-[#E84A27] hover:text-white",
                        "dark:border-[#FF6B45] dark:bg-[#030A14]/80 dark:text-[#FF6B45] dark:hover:bg-[#E84A27] dark:hover:text-white",
                      )}
                      aria-hidden
                    >
                      <Mail className="h-4 w-4" />
                    </span>
                  </div>
                </div>
                <div className="mt-4 px-1.5">
                  <h3 className="text-lg font-bold tracking-tight text-[#0B1F3A] dark:text-white">
                    {member.name}
                  </h3>
                  <p className="mt-0.5 text-sm font-semibold text-[#E84A27] dark:text-[#FF6B45]">
                    {member.title}
                  </p>
                  <p className="mt-2.5 text-sm leading-relaxed text-[#0A1830]/85 dark:text-white/75">
                    {member.bio}
                  </p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
