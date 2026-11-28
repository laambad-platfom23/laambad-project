import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartKind = "course" | "book";

export type CartLine = {
  kind: CartKind;
  /** the course id or the book id */
  id: string;
  slug: string;
  title: string;
  /** Minor units (e.g. cents); 0 for free */
  priceMinor: number;
  currency: string;
  isFree: boolean;
};

type CartState = {
  items: CartLine[];
  addItem: (line: CartLine) => boolean;
  removeItem: (kind: CartKind, id: string) => void;
  clear: () => void;
};

const same = (a: Pick<CartLine, "kind" | "id">, kind: CartKind, id: string) => a.kind === kind && a.id === id;

/** Where "Buy now" goes for a line (the same checkout page for courses and books). */
export function cartCheckoutHref(line: Pick<CartLine, "kind" | "slug">) {
  return line.kind === "book" ? `/checkout?book=${encodeURIComponent(line.slug)}` : `/checkout?slug=${encodeURIComponent(line.slug)}`;
}

/** The page of the item itself. */
export function cartItemHref(line: Pick<CartLine, "kind" | "slug">) {
  return line.kind === "book" ? `/books/${encodeURIComponent(line.slug)}` : `/courses/${encodeURIComponent(line.slug)}`;
}

/** Carts saved before books could be added hold course lines only: { courseId, slug, title, … }. */
function upgradeLines(raw: unknown): CartLine[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: CartLine[] = [];
  for (const r of list as Record<string, unknown>[]) {
    if (!r || typeof r !== "object") continue;
    const kind: CartKind = r.kind === "book" ? "book" : "course";
    const id = typeof r.id === "string" ? r.id : typeof r.courseId === "string" ? r.courseId : "";
    if (!id || typeof r.slug !== "string" || !r.slug) continue;
    if (out.some((l) => same(l, kind, id))) continue;
    out.push({
      kind,
      id,
      slug: r.slug,
      title: typeof r.title === "string" ? r.title : r.slug,
      priceMinor: Number.isFinite(Number(r.priceMinor)) ? Number(r.priceMinor) : 0,
      currency: typeof r.currency === "string" && r.currency ? r.currency : "USD",
      isFree: !!r.isFree,
    });
  }
  return out;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (line) => {
        if (get().items.some((i) => same(i, line.kind, line.id))) {
          return false;
        }
        set({ items: [...get().items, line] });
        return true;
      },
      removeItem: (kind, id) => set({ items: get().items.filter((i) => !same(i, kind, id)) }),
      clear: () => set({ items: [] }),
    }),
    {
      name: "sodemy-cart",
      version: 1,
      partialize: (s) => ({ items: s.items }),
      migrate: (persisted) => ({ items: upgradeLines((persisted as { items?: unknown } | null)?.items) }),
    }
  )
);
