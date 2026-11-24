"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, KeyRound, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { passkeysApi } from "@/services/api/student-features";
import { formatDateTime, getApiErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

function deviceName() {
  if (typeof navigator === "undefined") return "Passkey";
  const ua = navigator.userAgent;
  if (/iPhone|iPad/i.test(ua)) return "iPhone / iPad";
  if (/Android/i.test(ua)) return "Android phone";
  if (/Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  return "Passkey";
}

/** A2: add / remove passkeys (fingerprint, face or device PIN instead of a password). */
export function PasskeysCard() {
  const qc = useQueryClient();
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(browserSupportsWebAuthn()), []);
  const { data, isLoading } = useQuery({
    queryKey: ["my-passkeys"],
    queryFn: () => passkeysApi.list().then((r) => r.data),
  });

  const add = useMutation({
    mutationFn: async () => {
      const { data: opts } = await passkeysApi.registerOptions();
      // the browser shows its own fingerprint / face / PIN prompt here
      const response = await startRegistration({ optionsJSON: opts.options as never });
      return passkeysApi.register(opts.challenge_id, response, deviceName());
    },
    onSuccess: () => {
      toast.success("Passkey added — you can now sign in without your password");
      qc.invalidateQueries({ queryKey: ["my-passkeys"] });
    },
    onError: (e: unknown) => {
      const name = (e as { name?: string })?.name;
      if (name === "NotAllowedError" || name === "AbortError") return; // the user cancelled the prompt
      if (name === "InvalidStateError") {
        toast.error("This device already has a passkey for your account.");
        return;
      }
      toast.error(getApiErrorMessage(e, "Could not add the passkey"));
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => passkeysApi.remove(id),
    onSuccess: () => {
      toast.success("Passkey removed");
      qc.invalidateQueries({ queryKey: ["my-passkeys"] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Could not remove")),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint className="h-5 w-5 text-brand" /> Passkeys
        </CardTitle>
        <CardDescription>
          Sign in with your fingerprint, face or phone screen lock instead of a password. Your password keeps working too.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : data?.length ? (
          <ul className="divide-y rounded-lg border">
            {data.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{p.name ?? "Passkey"}</p>
                  <p className="text-xs text-muted-foreground">
                    Added {formatDateTime(p.created_at)}
                    {p.last_used_at ? ` · last used ${formatDateTime(p.last_used_at)}` : ""}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  aria-label="Remove passkey"
                  disabled={remove.isPending}
                  onClick={() => window.confirm("Remove this passkey?") && remove.mutate(p.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No passkeys yet.</p>
        )}
        {supported ? (
          <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending}>
            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
            Add a passkey on this device
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">This browser does not support passkeys.</p>
        )}
      </CardContent>
    </Card>
  );
}
