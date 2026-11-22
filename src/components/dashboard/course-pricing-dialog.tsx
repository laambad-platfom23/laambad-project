"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { coursesApi } from "@/services/api/courses";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Props = {
  courseId: string | null;
  courseTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

async function fetchPricingOrNull(courseId: string) {
  try {
    const r = await coursesApi.getPricing(courseId);
    return r.data;
  } catch (e) {
    const err = e as AxiosError<{ code?: string }>;
    if (err.response?.status === 404) return null;
    throw e;
  }
}

export function CoursePricingDialog({ courseId, courseTitle, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const enabled = Boolean(open && courseId);

  const { data: pricing, isLoading, isError, error } = useQuery({
    queryKey: ["course-pricing", courseId],
    queryFn: () => fetchPricingOrNull(courseId!),
    enabled,
  });

  const [priceFree, setPriceFree] = useState(true);
  const [priceMajor, setPriceMajor] = useState("");
  const [currency, setCurrency] = useState("USD");

  useEffect(() => {
    if (!pricing) {
      setPriceFree(true);
      setPriceMajor("");
      setCurrency("USD");
      return;
    }
    setPriceFree(pricing.is_free);
    setCurrency((pricing.currency || "USD").toUpperCase());
    if (pricing.is_free) {
      setPriceMajor("");
    } else {
      setPriceMajor((pricing.price / 100).toFixed(2));
    }
  }, [pricing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!courseId) throw new Error("missing");
      const cents = priceFree ? 0 : Math.round(parseFloat(priceMajor || "0") * 100);
      if (!priceFree) {
        if (!Number.isFinite(cents) || cents <= 0) {
          throw new Error("invalid_price");
        }
      }
      await coursesApi.updatePricing(courseId, {
        is_free: priceFree,
        price: priceFree ? 0 : cents,
        currency: currency.trim() || "USD",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["course-pricing", courseId] });
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
      queryClient.invalidateQueries({ queryKey: ["catalog-courses"] });
      toast.success("Pricing saved");
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof Error && err.message === "invalid_price") {
        toast.error("Enter a valid price greater than zero, or enable Free course");
        return;
      }
      toast.error("Could not save pricing");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Course pricing</DialogTitle>
          <DialogDescription>
            {courseTitle ? (
              <>
                Set catalog price for <span className="font-medium text-foreground">{courseTitle}</span>. Required
                before you can publish.
              </>
            ) : (
              <>Set free vs paid pricing for this course. Required before you can publish.</>
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">
            {(error as Error)?.message || "Could not load pricing"}
          </p>
        ) : (
          <div className="space-y-3 rounded-lg border border-dashed bg-muted/20 p-3">
            <div>
              <p className="text-xs text-muted-foreground">
                Free = instant enroll. Paid = payment before full access. Enter amounts in major units (e.g. 29.99); we
                store minor units (cents).
              </p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="cp-free">Free course</Label>
                <p className="text-xs text-muted-foreground">No payment required</p>
              </div>
              <Switch id="cp-free" checked={priceFree} onCheckedChange={setPriceFree} />
            </div>
            {!priceFree && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cp-price">Price</Label>
                  <Input
                    id="cp-price"
                    inputMode="decimal"
                    value={priceMajor}
                    onChange={(e) => setPriceMajor(e.target.value)}
                    placeholder="e.g. 29.99"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cp-currency">Currency</Label>
                  <Input
                    id="cp-currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    placeholder="USD"
                    maxLength={8}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saveMutation.isPending || isLoading || isError}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save pricing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
