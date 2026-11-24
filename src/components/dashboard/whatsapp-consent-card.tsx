"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { whatsappApi } from "@/services/api/student-features";
import { formatDateTime, getApiErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

/** A2: the student chooses whether Laambad may send reminders on WhatsApp (explicit opt-in, revocable). */
export function WhatsappConsentCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["my-whatsapp"],
    queryFn: () => whatsappApi.get().then((r) => r.data),
  });
  const [phone, setPhone] = useState("");
  const [agree, setAgree] = useState(false);
  useEffect(() => {
    if (data) setPhone(data.whatsapp_phone ?? data.suggested_phone ?? "");
  }, [data]);

  const save = useMutation({
    mutationFn: (consent: boolean) => whatsappApi.set(consent, phone).then((r) => r.data),
    onSuccess: (d) => {
      qc.setQueryData(["my-whatsapp"], d);
      setAgree(false);
      toast.success(d.consent ? "WhatsApp reminders turned on" : "WhatsApp reminders turned off");
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not save")),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-[#25D366]" /> WhatsApp reminders
        </CardTitle>
        <CardDescription>
          Get learning reminders and payment updates from Laambad on WhatsApp. Only with your permission — turn it off at any time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : data?.consent ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">On · {data.whatsapp_phone}</p>
              {data.consent_at ? (
                <p className="text-xs text-muted-foreground">Allowed on {formatDateTime(data.consent_at)}</p>
              ) : null}
            </div>
            <Button variant="outline" size="sm" disabled={save.isPending} onClick={() => save.mutate(false)}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Turn off
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="wa-phone">WhatsApp number</Label>
              <Input
                id="wa-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="61 234 5678 (or +44 … outside Somalia)"
                inputMode="tel"
              />
            </div>
            <div className="flex items-start gap-3">
              <Switch id="wa-agree" checked={agree} onCheckedChange={setAgree} />
              <Label htmlFor="wa-agree" className="text-sm font-normal leading-snug">
                I agree that Laambad may contact me on WhatsApp about my courses (reminders and payment updates).
              </Label>
            </div>
            <Button size="sm" disabled={!agree || !phone.trim() || save.isPending} onClick={() => save.mutate(true)}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Turn on WhatsApp reminders
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
