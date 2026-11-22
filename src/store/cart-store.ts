import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartLine = {
  courseId: string;
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
  removeItem: (courseId: string) => void;
  clear: () => void;
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (line) => {
        if (get().items.some((i) => i.courseId === line.courseId)) {
          return false;
        }
        set({ items: [...get().items, line] });
        return true;
      },
      removeItem: (courseId) => set({ items: get().items.filter((i) => i.courseId !== courseId) }),
      clear: () => set({ items: [] }),
    }),
    { name: "sodemy-cart" }
  )
);
