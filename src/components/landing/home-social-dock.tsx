"use client";

import { Facebook, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SODEMY_SOCIAL_LINKS } from "@/lib/sodemy-contact";

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.16 15.3a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.75a8.19 8.19 0 0 0 4.76 1.52V6.84a4.84 4.84 0 0 1-1.01-.15Z" />
    </svg>
  );
}

const iconFor = {
  whatsapp: MessageCircle,
  facebook: Facebook,
  tiktok: TikTokIcon,
} as const;

const accentFor = {
  whatsapp: "bg-[#25D366] text-white hover:bg-[#1ebe57] shadow-[#25D366]/35",
  facebook: "bg-[#1877F2] text-white hover:bg-[#166fe5] shadow-[#1877F2]/35",
  tiktok: "bg-[#111111] text-white hover:bg-black shadow-black/30 dark:bg-white dark:text-[#111] dark:hover:bg-white/90",
} as const;

/**
 * Fixed social dock — WhatsApp, Facebook, TikTok — visible on the home page.
 */
export function HomeSocialDock({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "pointer-events-none fixed bottom-5 right-4 z-40 flex flex-col gap-2.5 sm:bottom-7 sm:right-6",
        className,
      )}
      aria-label="Social media"
    >
      {SODEMY_SOCIAL_LINKS.map((link) => {
        const Icon = iconFor[link.id];
        return (
          <a
            key={link.id}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            title={link.label}
            className={cn(
              "pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition duration-300",
              "hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1F3A] focus-visible:ring-offset-2",
              "motion-safe:animate-fade-in-up",
              accentFor[link.id],
            )}
          >
            <Icon className="h-5 w-5" />
          </a>
        );
      })}
    </aside>
  );
}
