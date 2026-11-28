"use client";

import Link from "next/link";
import { BookOpen, GraduationCap, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cartCheckoutHref, cartItemHref, useCartStore, type CartLine } from "@/store/cart-store";

function formatMinor(n: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
    minimumFractionDigits: 2,
  }).format(n / 100);
}

/** "2 courses · 1 book" */
export function cartCountLabel(items: Pick<CartLine, "kind">[]) {
  const courses = items.filter((i) => i.kind === "course").length;
  const books = items.length - courses;
  const parts = [];
  if (courses) parts.push(`${courses} course${courses === 1 ? "" : "s"}`);
  if (books) parts.push(`${books} book${books === 1 ? "" : "s"}`);
  return parts.join(" · ");
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
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button asChild size="sm">
              <Link href="/courses" onClick={navClick}>
                Browse courses
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/books" onClick={navClick}>
                Browse books
              </Link>
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">Your cart is empty</h1>
        <p className="mt-2 text-sm text-muted-foreground">Add courses from the catalog, or books from the Books page.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/courses">Browse courses</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/books">Browse books</Link>
          </Button>
        </div>
      </div>
    );
  }

  const list = (
    <ul className={variant === "drawer" ? "divide-y divide-border" : "mt-8 divide-y divide-gray-200 dark:divide-zinc-800"}>
      {items.map((line) => {
        const KindIcon = line.kind === "book" ? BookOpen : GraduationCap;
        return (
          <li
            key={`${line.kind}:${line.id}`}
            className={
              variant === "drawer"
                ? "flex flex-col gap-3 py-4 first:pt-0"
                : "flex flex-col gap-3 py-5 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
            }
          >
            <div className="min-w-0">
              <span className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <KindIcon className="h-3.5 w-3.5" aria-hidden />
                {line.kind === "book" ? "Book" : "Course"}
              </span>
              <Link
                href={cartItemHref(line)}
                className="block font-medium text-gray-900 hover:underline dark:text-white"
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
                  <Link href={cartItemHref(line)} onClick={navClick}>
                    {line.kind === "book" ? "Open book" : "View course"}
                  </Link>
                </Button>
              ) : (
                <Button asChild size="sm">
                  <Link href={cartCheckoutHref(line)} onClick={navClick}>
                    Buy now
                  </Link>
                </Button>
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-muted-foreground"
                aria-label={`Remove ${line.title} from cart`}
                onClick={() => removeItem(line.kind, line.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );

  if (variant === "drawer") {
    return list;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">Shopping cart</h1>
      <p className="mt-1 text-sm text-muted-foreground">{cartCountLabel(items)}</p>
      {list}
    </div>
  );
}
