"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** 6-digit one-time code field (works with SMS/e-mail autofill: autocomplete="one-time-code"). */
export function CodeInput({
  value,
  onChange,
  disabled,
  id = "code",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  id?: string;
  autoFocus?: boolean;
}) {
  return (
    <Input
      id={id}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={6}
      placeholder="••••••"
      autoFocus={autoFocus}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      aria-label="6-digit code"
      className={cn(
        "h-14 rounded-xl text-center font-mono text-2xl font-bold tracking-[0.5em] placeholder:tracking-[0.5em]",
        "focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:ring-offset-0"
      )}
    />
  );
}
