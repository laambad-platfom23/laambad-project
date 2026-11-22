/** Human labels for payment methods and statuses (app values + migrated WooCommerce values). */

export function paymentMethodLabel(raw: string | null | undefined): string {
  const r = (raw || "").toLowerCase().trim();
  switch (r) {
    case "":
    case "—":
      return "—";
    case "offline":
    case "cheque":
      return "Manual (EVC / transfer)";
    case "bacs":
      return "Bank transfer";
    case "wafi":
    case "wc-waafipay":
    case "waafipay":
      return "Waafi Pay";
    case "stripe":
      return "Card";
    case "free":
      return "Free / coupon";
    case "waiver":
      return "Admin waiver (free)";
    case "unknown":
      return "Unknown (migrated)";
    default:
      return raw ?? "—";
  }
}

/** Enrollment status for display: "On_hold" → "On hold", both cancel spellings → "Cancelled". */
export function enrollmentStatusLabel(raw: string | null | undefined): string {
  const r = (raw || "").toLowerCase().trim();
  if (!r) return "—";
  if (r === "canceled" || r === "cancelled") return "Cancelled";
  const words = r.replace(/[_-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Badge colour classes for an enrollment status (brand-consistent, light + dark). */
export function enrollmentStatusClass(raw: string | null | undefined): string {
  const r = (raw || "").toLowerCase();
  if (r === "active") return "bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-white";
  if (r === "completed") return "bg-success-soft text-success";
  if (r === "pending" || r === "on_hold") return "bg-warning-soft text-warning";
  if (r === "canceled" || r === "cancelled") return "bg-destructive/10 text-destructive";
  return "bg-muted text-muted-foreground";
}
