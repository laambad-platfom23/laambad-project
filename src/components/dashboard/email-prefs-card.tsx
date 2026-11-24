"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import apiClient from "@/services/api/client";
import { getApiErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

/** A4: real e-mail preferences (replaces the old placeholder switches). */
export function EmailPrefsCard() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["email-prefs"],
    queryFn: () => apiClient.get<{ reminders: boolean }>("/api/v1/me/email-prefs").then((r) => r.data),
  });
  const save = useMutation({
    mutationFn: (reminders: boolean) => apiClient.put<{ reminders: boolean }>("/api/v1/me/email-prefs", { reminders }).then((r) => r.data),
    onSuccess: (d) => {
      qc.setQueryData(["email-prefs"], d);
      toast.success(d.reminders ? "Learning reminders turned on" : "Learning reminders turned off");
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not save")),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-brand" /> E-mail
        </CardTitle>
        <CardDescription>
          Account e-mails (codes, enrolment, payments, certificates) are always sent. You choose the learning reminders.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Learning reminders</p>
            <p className="text-xs text-muted-foreground">At most one e-mail a week when you have not studied for 7 days.</p>
          </div>
          <Switch
            checked={data?.reminders ?? true}
            disabled={!data || save.isPending}
            onCheckedChange={(v) => save.mutate(v)}
            aria-label="Learning reminder e-mails"
          />
        </div>
      </CardContent>
    </Card>
  );
}
