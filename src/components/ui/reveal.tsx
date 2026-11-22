"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Delay in ms before entrance starts once visible */
  delay?: number;
  /** `up` | `fade` | `scale` */
  variant?: "up" | "fade" | "scale";
  /** Once visible, stay revealed (default true) */
  once?: boolean;
};

/**
 * Lightweight scroll entrance — CSS transitions + IntersectionObserver.
 * Respects prefers-reduced-motion.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  variant = "up",
  once = true,
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          if (once) io.disconnect();
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, reduceMotion]);

  const style: CSSProperties | undefined =
    !reduceMotion && delay > 0 ? { transitionDelay: `${delay}ms` } : undefined;

  return (
    <div
      ref={ref}
      style={style}
      className={cn(
        "motion-safe:transition-[opacity,transform] motion-safe:duration-700 motion-safe:ease-out",
        variant === "up" && (visible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"),
        variant === "fade" && (visible ? "opacity-100" : "opacity-0"),
        variant === "scale" &&
          (visible ? "scale-100 opacity-100" : "scale-[0.97] opacity-0"),
        reduceMotion && "translate-y-0 scale-100 opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
}
