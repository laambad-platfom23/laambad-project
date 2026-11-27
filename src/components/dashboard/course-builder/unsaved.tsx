"use client";

/**
 * Unsaved changes in the Course Builder. Every topic / lesson card with edits that are not saved yet
 * registers here, so the builder can show "N unsaved changes", save them all at once, save them
 * before moving to another step, and warn before the page is left. Without a provider it does nothing.
 */
import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from "react";

type Entry = { label: string; save: () => Promise<unknown> };

export type UnsavedStore = {
  set: (id: string, entry: Entry | null) => void;
  labels: () => string[];
  count: () => number;
  subscribe: (cb: () => void) => () => void;
  /** saves one by one; a failing item keeps its edits (its own error message is shown) */
  saveAll: () => Promise<{ saved: number; failed: number }>;
};

export function createUnsavedStore(): UnsavedStore {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let n = 0;
  const changed = () => {
    n = entries.size;
    listeners.forEach((l) => l());
  };
  return {
    set(id, entry) {
      if (entry) entries.set(id, entry);
      else if (!entries.delete(id)) return;
      changed();
    },
    labels: () => [...entries.values()].map((e) => e.label),
    count: () => n,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async saveAll() {
      let saved = 0;
      let failed = 0;
      for (const [, e] of [...entries]) {
        try {
          await e.save();
          saved++;
        } catch {
          failed++;
        }
      }
      return { saved, failed };
    },
  };
}

export const UnsavedContext = createContext<UnsavedStore | null>(null);

export function useUnsavedCount(store: UnsavedStore | null) {
  return useSyncExternalStore(
    (cb) => (store ? store.subscribe(cb) : () => {}),
    () => (store ? store.count() : 0),
    () => 0
  );
}

/** A card says whether it has unsaved edits and how to save them. */
export function useRegisterUnsaved(id: string, dirty: boolean, label: string, save: () => Promise<unknown>) {
  const store = useContext(UnsavedContext);
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!store) return;
    store.set(id, dirty ? { label, save: () => saveRef.current() } : null);
  }, [store, id, dirty, label]);
  useEffect(() => () => store?.set(id, null), [store, id]);
}

/** Browser warning when the tab is closed / reloaded with unsaved edits. */
export function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}
