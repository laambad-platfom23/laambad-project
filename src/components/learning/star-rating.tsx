"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Read-only stars; fractions are drawn (4.5 → four and a half stars). */
export function Stars({ value, size = 16, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${value} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star className="absolute inset-0 text-amber-500/35" style={{ width: size, height: size }} strokeWidth={1.8} />
            {fill > 0 ? (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className="fill-amber-500 text-amber-500" style={{ width: size, height: size }} strokeWidth={1.8} />
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

/** Pick 1–5 stars (keyboard: arrow keys move, the buttons are focusable). */
export function StarInput({ value, onChange, size = 28, disabled }: { value: number; onChange: (v: number) => void; size?: number; disabled?: boolean }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  const LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-0.5" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${i} ${i === 1 ? "star" : "stars"}`}
            disabled={disabled}
            onMouseEnter={() => setHover(i)}
            onClick={() => onChange(i)}
            className="rounded transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 disabled:pointer-events-none"
          >
            <Star
              className={cn(i <= shown ? "fill-amber-500 text-amber-500" : "text-muted-foreground/40")}
              style={{ width: size, height: size }}
              strokeWidth={1.6}
            />
          </button>
        ))}
      </span>
      {shown ? <span className="text-sm font-medium text-muted-foreground">{LABELS[shown]}</span> : null}
    </span>
  );
}
