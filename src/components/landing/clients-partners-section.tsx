"use client";

import Image from "next/image";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";
import { resolvePartners, type PartnerLogo } from "@/lib/sodemy-team";
import { useSiteSettings } from "@/hooks/use-site-settings";
import type { SiteSettingsMap } from "@/services/api/site-settings";

function partnerImageSrc(partner: PartnerLogo, settings?: SiteSettingsMap): string {
  return settings?.[partner.imageKey]?.trim() || "";
}

function PartnerMark({
  partner,
  settings,
}: {
  partner: PartnerLogo;
  settings?: SiteSettingsMap;
}) {
  const src = partnerImageSrc(partner, settings);

  return (
    <div
      className={cn(
        "group flex h-16 min-w-[148px] shrink-0 items-center justify-center rounded-xl border px-6 sm:h-[4.5rem] sm:min-w-[168px]",
        "border-[#0B1F3A]/15 bg-white/90 shadow-sm backdrop-blur-sm",
        "transition duration-300 hover:-translate-y-0.5 hover:border-[#0B1F3A]/40 hover:shadow-md",
        "dark:border-white/15 dark:bg-[#061528]/70 dark:hover:border-white/40",
      )}
      title={partner.name}
    >
      {src ? (
        <div className="relative h-10 w-28 sm:h-11 sm:w-32">
          <Image
            src={src}
            alt={partner.name}
            fill
            className="object-contain"
            sizes="128px"
            unoptimized={src.startsWith("http")}
          />
        </div>
      ) : (
        <span className="text-sm font-bold tracking-[0.04em] text-[#0B1F3A]/55 transition group-hover:text-[#0B1F3A] dark:text-white/50 dark:group-hover:text-white sm:text-base">
          {partner.mark}
        </span>
      )}
    </div>
  );
}

export function ClientsPartnersSection({ className }: { className?: string }) {
  const { data: settings } = useSiteSettings();
  const partners = resolvePartners(settings);
  const loop = [...partners, ...partners];

  return (
    <section
      id="partners"
      className={cn(
        "relative scroll-mt-20 overflow-hidden border-t py-14 sm:py-16",
        "border-[#0B1F3A]/12 bg-white",
        "dark:border-white/10 dark:bg-[#030A14]",
        className,
      )}
    >
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mx-auto mb-8 max-w-2xl text-center sm:mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0B1F3A] dark:text-white/80">
            Clients &amp; partners
          </p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#0B1F3A] dark:text-white sm:text-3xl">
            Organizations we work with
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[#0A1830]/90 dark:text-white/85">
            Companies and institutions that share our mission of quality education and opportunity for young people.
          </p>
        </Reveal>
      </div>

      <Reveal variant="fade" className="relative">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-white/90 dark:bg-[#030A14]/90 sm:w-16"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-white/90 dark:bg-[#030A14]/90 sm:w-16"
          aria-hidden
        />

        <div className="sodemy-partners-marquee overflow-hidden py-2">
          <div className="sodemy-partners-track flex w-max gap-4 px-4 sm:gap-5">
            {loop.map((partner, i) => (
              <PartnerMark
                key={`${partner.id}-${i}`}
                partner={partner}
                settings={settings}
              />
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
