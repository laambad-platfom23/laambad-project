"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { OrdersTable } from "@/components/dashboard/orders-table";
import { useAuthStore } from "@/store/auth-store";
import { isAdminUser } from "@/lib/auth-routing";

/**
 * Admin: orders of courses AND books (A11). Opens on the pending ones — check the money arrived,
 * then approve (or reject, or give a coupon) to open the course / book for the student.
 */
export default function OrdersPage() {
  const user = useAuthStore((s) => s.user);
  if (user && !isAdminUser(user)) {
    return <p className="p-6 text-muted-foreground">Only administrators can see orders.</p>;
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2.5 text-3xl font-bold tracking-tight">
          <ShoppingBag className="h-7 w-7 text-brand" /> Orders
        </h1>
        <p className="mt-1 text-muted-foreground">
          Course and book orders. Check the money arrived, then approve to open the course or book for the student — or give a coupon.
        </p>
      </div>
      {user ? <OrdersTable defaultStatus="pending" /> : null}
      <p className="text-sm text-muted-foreground">
        Coupons are managed on the{" "}
        <Link href="/dashboard/coupons" className="font-medium text-brand hover:underline">
          Coupons
        </Link>{" "}
        page.
      </p>
    </div>
  );
}
