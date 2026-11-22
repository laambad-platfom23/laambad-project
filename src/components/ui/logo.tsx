"use client";

import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { resolveSiteImage, useSiteSettings } from "@/hooks/use-site-settings";

interface LogoProps {
  size?: "xs" | "sm" | "md" | "lg";
  /** Extra text beside the logo mark (usually unused — logo already includes tagline). */
  showText?: boolean;
  className?: string;
  href?: string;
  /**
   * dark = always use dark-surface logo (sidebar / footer / navy panels).
   * light = always use navy+pink logo (white cards even in dark theme).
   * auto = follow theme: dark asset under `.dark`.
   */
  variant?: "auto" | "dark" | "light";
  /** Centre the logo artwork inside its box (default: left, for headers/sidebars). */
  align?: "left" | "center";
}

const sizes = {
  xs: { h: 28, w: 48, title: "text-xs", sub: "text-[7px]" },
  sm: { h: 36, w: 148, title: "text-sm", sub: "text-[8.5px]" },
  md: { h: 44, w: 180, title: "text-lg", sub: "text-[10px]" },
  lg: { h: 56, w: 236, title: "text-2xl", sub: "text-xs" },
};

const LOGO_FALLBACK = "/images/laambad-logo.png";
/** White wordmark + preserved coral/pink accents for navy / dark surfaces */
const LOGO_DARK_FALLBACK = "/images/laambad-logo-dark.png";

function useCmsLogoSrc(override?: string): string {
  const { data: settings } = useSiteSettings();
  if (override?.trim()) return override.trim();
  return resolveSiteImage(settings, "logo_image") || LOGO_FALLBACK;
}

function isDefaultBrandLogo(src: string): boolean {
  return (
    !src ||
    src === LOGO_FALLBACK ||
    src.endsWith("/laambad-logo.png") ||
    src.includes("laambad-logo.png")
  );
}

/** Transparent Laambad wordmark — no background box. */
function LogoIcon({
  size = "md",
  src,
  className,
  onDark = false,
  forceLight = false,
  center = false,
}: {
  size?: "xs" | "sm" | "md" | "lg";
  src?: string;
  center?: boolean;
  className?: string;
  /** Always use dark-surface logo (sidebar / footer / navy panels) */
  onDark?: boolean;
  /** Keep navy+pink mark even in dark theme (white cards) */
  forceLight?: boolean;
}) {
  const s = sizes[size];
  const imageSrc = useCmsLogoSrc(src);
  const brandDefault = isDefaultBrandLogo(imageSrc);
  const useDarkAsset = brandDefault && !forceLight && onDark;
  const useDarkAssetAuto = brandDefault && !forceLight && !onDark;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-visible bg-transparent",
        className,
      )}
      style={{ width: s.w, height: s.h }}
    >
      {/* Light / white surfaces: navy wordmark + pink accents */}
      <Image
        src={imageSrc}
        alt="Laambad — E-learning platform"
        fill
        className={cn(
          "object-contain",
          center ? "object-center" : "object-left",
          useDarkAsset && "hidden",
          useDarkAssetAuto && "dark:hidden",
          !brandDefault && onDark && "brightness-0 invert",
          !brandDefault && !onDark && !forceLight && "dark:brightness-0 dark:invert",
        )}
        priority
        sizes={`${s.w}px`}
        unoptimized={imageSrc.startsWith("http")}
      />
      {/* Dark surfaces: white wordmark, pink tagline + play marks stay visible */}
      {brandDefault && !forceLight ? (
        <Image
          src={LOGO_DARK_FALLBACK}
          alt="Laambad — E-learning platform"
          fill
          className={cn(
            "object-contain",
          center ? "object-center" : "object-left",
            onDark ? "block" : "hidden dark:block",
          )}
          priority
          sizes={`${s.w}px`}
        />
      ) : null}
    </span>
  );
}

export function Logo({
  size = "md",
  showText = false,
  className,
  href = "/",
  variant = "auto",
  align = "left",
}: LogoProps) {
  const s = sizes[size];
  const dark = variant === "dark";
  const light = variant === "light";
  const logoSrc = useCmsLogoSrc();

  const content = (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoIcon size={size} src={logoSrc} onDark={dark} forceLight={light} center={align === "center"} />
      {showText && (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              "font-extrabold tracking-tight text-[#0B1F3A]",
              s.title,
              dark && "text-white",
              !dark && !light && "dark:text-white",
            )}
          >
            Laambad
          </span>
          <span
            className={cn(
              "mt-1 font-semibold uppercase tracking-[0.12em] text-[#E84A27]",
              s.sub,
              dark && "text-[#FF6B45]",
              !dark && !light && "dark:text-[#FF6B45]",
            )}
          >
            E-learning platform
          </span>
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="flex shrink-0 items-center">
        {content}
      </Link>
    );
  }

  return content;
}

export { LogoIcon };
