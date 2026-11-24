"use client";

import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuthStore } from "@/store/auth-store";
import { authApi } from "@/services/api/auth";
import { uploadsApi } from "@/services/api/uploads";
import { getInitials, getApiErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import { Loader2, Camera } from "lucide-react";
import { isStaffUser } from "@/lib/auth-routing";
import { EmailPrefsCard } from "@/components/dashboard/email-prefs-card";
import { PasskeysCard } from "@/components/dashboard/passkeys-card";
import { WhatsappConsentCard } from "@/components/dashboard/whatsapp-consent-card";

export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const [name, setName] = useState(user?.name || "");
  const [email] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    setUploading(true);
    try {
      const result = await uploadsApi.uploadMedia(file, "avatars");
      setAvatarUrl(result.url);
      toast.success("Photo uploaded — remember to save");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not upload photo"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await authApi.updateMe({ name, phone, avatar_url: avatarUrl });
      setUser({ ...user, ...data });
      toast.success("Profile saved successfully");
    } catch {
      toast.error("Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings and preferences.</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your personal information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Profile photo */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 ring-2 ring-[#0B1F3A]/15">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} className="object-cover" /> : null}
              <AvatarFallback className="bg-[#0B1F3A]/12 text-lg font-semibold text-[#0B1F3A]">
                {getInitials(name || "U")}
              </AvatarFallback>
            </Avatar>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhoto}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {uploading ? "Uploading…" : "Change photo"}
              </Button>
              <p className="mt-1.5 text-xs text-muted-foreground">JPG or PNG. Square images look best.</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+252 …"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} disabled readOnly />
            <p className="text-xs text-muted-foreground">Email can&apos;t be changed here.</p>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* A2: sign-in with passkeys + WhatsApp consent */}
      {!isStaffUser(user) ? (
        <>
          <PasskeysCard />
          <WhatsappConsentCard />
        </>
      ) : null}

      {/* A4: real e-mail preferences (the old switches were placeholders) */}
      <EmailPrefsCard />

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Irreversible actions for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" size="sm">
            Delete Account
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
