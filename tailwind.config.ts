import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      /**
       * The code uses colour opacity modifiers that are not multiples of 5 (/2, /3, /8, /12, /98 …).
       * Tailwind 3 only generates modifiers from this scale, so they were silently dropped
       * (e.g. the dashboard header stayed white in dark mode). Every value used in src/ is listed here.
       */
      opacity: {
        2: "0.02", 3: "0.03", 4: "0.04", 6: "0.06", 7: "0.07", 8: "0.08", 9: "0.09",
        11: "0.11", 12: "0.12", 14: "0.14", 16: "0.16", 18: "0.18", 22: "0.22", 28: "0.28",
        38: "0.38", 68: "0.68", 78: "0.78", 88: "0.88", 92: "0.92", 98: "0.98",
      },
      colors: {
        /** Laambad brand (logo): navy + orange. Use these instead of raw hex values. */
        brand: {
          DEFAULT: "hsl(var(--brand))",
          foreground: "hsl(var(--brand-foreground))",
          hover: "hsl(var(--brand-hover))",
          soft: "hsl(var(--brand-soft))",
          navy: "#0B1F3A",
          "navy-deep": "#061528",
          "navy-ink": "#030A14",
          orange: "#E84A27",
          "orange-hover": "#D03F1F",
          "orange-bright": "#FF6B45",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          soft: "hsl(var(--success-soft))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          soft: "hsl(var(--warning-soft))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "hero-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "hero-glow": {
          "0%, 100%": { opacity: "0.7", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.04)" },
        },
        "orbit-spin": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "orbit-spin-reverse": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(-360deg)" },
        },
        "orbit-ring": {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.015)" },
        },
        "hero-bar": {
          "0%, 100%": { transform: "scaleY(0.32)", filter: "brightness(0.92)" },
          "50%": { transform: "scaleY(1)", filter: "brightness(1.15)" },
        },
        "hero-line": {
          "0%": { strokeDashoffset: "115" },
          "100%": { strokeDashoffset: "0" },
        },
        /** Live desk — softer bar pulse (feels like live tape, not a game) */
        "desk-bar": {
          "0%, 100%": { transform: "scaleY(0.82)", filter: "brightness(0.96)" },
          "50%": { transform: "scaleY(1)", filter: "brightness(1.06)" },
        },
        /** Whole live-desk chart row — barely-there vertical drift */
        "desk-strip": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-2px)" },
        },
        "hero-live": {
          "0%, 100%": { opacity: "0.88" },
          "50%": { opacity: "1" },
        },
        "hero-chip": {
          "0%, 100%": { opacity: "0.82", borderColor: "rgba(232, 93, 4, 0.28)" },
          "50%": { opacity: "1", borderColor: "rgba(232, 93, 4, 0.65)" },
        },
        "hero-trend": {
          "0%, 100%": { transform: "translateY(0) rotate(-2deg)" },
          "50%": { transform: "translateY(-1px) rotate(2deg)" },
        },
        "money-drift": {
          "0%, 100%": { transform: "translate(0, 0) rotate(0deg)", opacity: "0.18" },
          "33%": { transform: "translate(10px, -16px) rotate(6deg)", opacity: "0.42" },
          "66%": { transform: "translate(-8px, 10px) rotate(-4deg)", opacity: "0.28" },
        },
        /** Soft brand halo on active hero badge word */
        "hero-badge-glow": {
          "0%, 100%": {
            filter: "brightness(1)",
            "text-shadow": "0 0 14px rgba(232, 74, 39), 0.28)",
          },
          "50%": {
            filter: "brightness(1.06)",
            "text-shadow": "0 0 22px rgba(232, 74, 39), 0.48)",
          },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.5s ease-out",
        "slide-in-left": "slide-in-left 0.3s ease-out",
        "hero-float": "hero-float 5s ease-in-out infinite",
        "hero-glow": "hero-glow 6s ease-in-out infinite",
        "orbit-spin": "orbit-spin 48s linear infinite",
        "orbit-spin-reverse": "orbit-spin-reverse 48s linear infinite",
        "orbit-ring": "orbit-ring 7s ease-in-out infinite",
        "hero-bar": "hero-bar 1.1s ease-in-out infinite",
        "hero-line": "hero-line 1.6s ease-in-out infinite alternate",
        "desk-bar": "desk-bar 2.4s ease-in-out infinite",
        "desk-strip": "desk-strip 4s ease-in-out infinite",
        "hero-live": "hero-live 1.2s ease-in-out infinite",
        "hero-chip": "hero-chip 2.2s ease-in-out infinite",
        "hero-trend": "hero-trend 1.8s ease-in-out infinite",
        "money-drift": "money-drift 8s ease-in-out infinite",
        "hero-badge-glow": "hero-badge-glow 2.8s ease-in-out infinite",
        shimmer: "shimmer 2.8s linear infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
