"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/store/cart-store";
import { CartPanelBody } from "@/components/cart/cart-panel-body";
import { cn } from "@/lib/utils";

export function ShoppingCartSheet({
  className,
  variant = "default",
}: {
  className?: string;
  /** Gold variant kept for API compat — uses Laambad orange, not yellow */
  variant?: "default" | "gold";
}) {
  const [open, setOpen] = useState(false);
  const count = useCartStore((s) => s.items.length);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative rounded-full p-2",
            variant === "gold"
              ? "text-[#0B1F3A] hover:bg-[#0B1F3A]/10"
              : "text-foreground hover:bg-muted dark:text-[#EEF2F9]/90 dark:hover:bg-[#123252]/15 dark:hover:text-white",
            className
          )}
          aria-label={count > 0 ? `Shopping cart, ${count} items` : "Shopping cart"}
        >
          <ShoppingCart className="h-5 w-5" />
          {mounted && count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm">
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="shrink-0 space-y-1 border-b border-border/60 px-6 py-4 text-left">
          <SheetTitle className="text-lg">Shopping cart</SheetTitle>
          <SheetDescription className="sr-only">
            Review courses in your cart, remove items, or go to the full cart page.
          </SheetDescription>
          {count > 0 ? (
            <p className="text-sm font-normal text-muted-foreground">
              {count} course{count === 1 ? "" : "s"}
            </p>
          ) : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6">
          <CartPanelBody variant="drawer" onNavigate={() => setOpen(false)} />
        </div>
        <div className="shrink-0 border-t border-border/60 bg-muted/20 px-6 py-4">
          <Button asChild variant="outline" className="w-full">
            <Link href="/cart" onClick={() => setOpen(false)}>
              Open cart page
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
