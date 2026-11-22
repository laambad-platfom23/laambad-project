"use client";

import Link from "next/link";
import { Mail, Phone, MapPin, Globe, Facebook, MessageCircle, Clock } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import { SODEMY_HERO_DESCRIPTION } from "@/lib/sodemy-categories";
import { usePublicCategories } from "@/hooks/use-public-categories";
import { subjectCategories } from "@/lib/category-display";
import { SODEMY_CONTACT } from "@/lib/sodemy-contact";

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.16 15.3a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.75a8.19 8.19 0 0 0 4.76 1.52V6.84a4.84 4.84 0 0 1-1.01-.15Z" />
    </svg>
  );
}

const socialLinks = [
  { label: "WhatsApp", href: SODEMY_CONTACT.whatsappUrl, icon: MessageCircle },
  { label: "Facebook", href: SODEMY_CONTACT.facebookUrl, icon: Facebook },
  { label: "TikTok", href: SODEMY_CONTACT.tiktokUrl, icon: TikTokIcon },
] as const;

export function SiteFooter() {
  const { data: footerCategories } = usePublicCategories();
  return (
    <footer className="border-t border-white/10 bg-[#0B1F3A] pt-14 pb-10 text-slate-300 dark:bg-[#061528]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <div className="sm:col-span-2 lg:col-span-1">
            <Logo size="sm" href="/" variant="dark" className="mb-4" />
            <p className="max-w-sm text-sm leading-relaxed text-slate-300">{SODEMY_HERO_DESCRIPTION}</p>
            <div className="mt-6 space-y-3 text-sm">
              <a
                href={`tel:${SODEMY_CONTACT.phonePrimaryTel}`}
                className="flex items-center gap-3 text-slate-200 transition-colors hover:text-[#FF8A66]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E84A27]/25 bg-white/10 text-[#FF6B45]">
                  <Phone className="h-4 w-4" aria-hidden />
                </span>
                <span className="font-medium tabular-nums">{SODEMY_CONTACT.phonesDisplay}</span>
              </a>
              <a
                href={`mailto:${SODEMY_CONTACT.email}`}
                className="flex items-center gap-3 text-slate-200 transition-colors hover:text-[#FF8A66]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E84A27]/25 bg-white/10 text-[#FF6B45]">
                  <Mail className="h-4 w-4" aria-hidden />
                </span>
                <span className="break-all font-medium">{SODEMY_CONTACT.email}</span>
              </a>
              <a
                href={SODEMY_CONTACT.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-slate-200 transition-colors hover:text-[#FF8A66]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E84A27]/25 bg-white/10 text-[#FF6B45]">
                  <Globe className="h-4 w-4" aria-hidden />
                </span>
                <span className="font-medium">{SODEMY_CONTACT.website}</span>
              </a>
              <div className="flex items-center gap-3 text-slate-200">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E84A27]/25 bg-white/10 text-[#FF6B45]">
                  <MapPin className="h-4 w-4" aria-hidden />
                </span>
                <span className="font-medium">{SODEMY_CONTACT.address}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-200">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E84A27]/25 bg-white/10 text-[#FF6B45]">
                  <Clock className="h-4 w-4" aria-hidden />
                </span>
                <span className="font-medium">{SODEMY_CONTACT.hours}</span>
              </div>
            </div>
          </div>
          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-white">Courses</h4>
            <ul className="space-y-2.5 text-sm">
              {subjectCategories(footerCategories, 6).map((cat) => (
                <li key={cat.slug}>
                  <Link
                    href={`/courses?category=${cat.slug}`}
                    className="transition-colors hover:text-[#FF8A66]"
                  >
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-white">Platform</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/courses" className="transition-colors hover:text-[#FF8A66]">
                  Browse Courses
                </Link>
              </li>
              <li>
                <Link href="/about" className="transition-colors hover:text-[#FF8A66]">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/register" className="transition-colors hover:text-[#FF8A66]">
                  Become a Teacher
                </Link>
              </li>
              <li>
                <a href={`mailto:${SODEMY_CONTACT.email}`} className="transition-colors hover:text-[#FF8A66]">
                  Contact
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-white">Support</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="#" className="transition-colors hover:text-[#FF8A66]">
                  Help Center
                </Link>
              </li>
              <li>
                <Link href="#" className="transition-colors hover:text-[#FF8A66]">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="#" className="transition-colors hover:text-[#FF8A66]">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="#" className="transition-colors hover:text-[#FF8A66]">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-6 border-t border-white/10 pt-8 sm:flex-row">
          <p className="text-center text-sm text-slate-400 sm:text-left">
            &copy; {new Date().getFullYear()} Laambad — E-learning platform. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
            {socialLinks.map(({ label, href, icon: Icon }) => (
              <a
                key={`bar-${label}`}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition-colors",
                  "hover:border-[#E84A27]/50 hover:bg-[#123252]/15 hover:text-[#FF8A66]",
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
