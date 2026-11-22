"use client";

import Link from "next/link";
import { ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/store/cart-store";

function formatMinor(n: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
    minimumFractionDigits: 2,
  }).format(n / 100);
}

type CartPanelBodyProps = {
  variant?: "page" | "drawer";
  /** Close parent sheet when navigating */
  onNavigate?: () => void;
};

export function CartPanelBody({ variant = "page", onNavigate }: CartPanelBodyProps) {
  const items = useCartStore((s) => s.items);
  const removeItem = useCartStore((s) => s.removeItem);
  const navClick = variant === "drawer" ? onNavigate : undefined;

  if (items.length === 0) {
    if (variant === "drawer") {
      return (
        <div className="flex flex-col items-center py-8 text-center">
          <ShoppingBag className="h-10 w-10 text-muted-foreground/70" aria-hidden />
          <p className="mt-3 text-sm text-muted-foreground">Your cart is empty</p>
          <Button asChild className="mt-5" size="sm">
            <Link href="/courses" onClick={navClick}>
              Browse courses
            </Link>
          </Button>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">Your cart is empty</h1>
        <p className="mt-2 text-sm text-muted-foreground">Add courses from the catalog or a course page.</p>
        <Button asChild className="mt-6">
          <Link href="/courses">Browse courses</Link>
        </Button>
      </div>
    );
  }

  const list = (
    <ul className={variant === "drawer" ? "divide-y divide-border" : "mt-8 divide-y divide-gray-200 dark:divide-zinc-800"}>
      {items.map((line) => (
        <li
          key={line.courseId}
          className={
            variant === "drawer"
              ? "flex flex-col gap-3 py-4 first:pt-0"
              : "flex flex-col gap-3 py-5 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
          }
        >
          <div className="min-w-0">
            <Link
              href={`/courses/${encodeURIComponent(line.slug)}`}
              className="font-medium text-gray-900 hover:underline dark:text-white"
              onClick={navClick}
            >
              {line.title}
            </Link>
            <p className="mt-1 text-sm text-muted-foreground">
              {line.isFree ? "Free" : formatMinor(line.priceMinor, line.currency)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {line.isFree ? (
              <Button asChild size="sm" variant="secondary">
                <Link href={`/courses/${encodeURIComponent(line.slug)}`} onClick={navClick}>
                  View course
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link
                  href={`/checkout?slug=${encodeURIComponent(line.slug)}`}
                  onClick={navClick}
                >
                  Buy now
                </Link>
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="text-muted-foreground"
              aria-label="Remove from cart"
              onClick={() => removeItem(line.courseId)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );

  if (variant === "drawer") {
    return list;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">Shopping cart</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {items.length} course{items.length === 1 ? "" : "s"}
      </p>
      {list}
    </div>
  );
}
