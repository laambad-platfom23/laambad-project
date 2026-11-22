"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminOnlyPage } from "@/hooks/use-admin-only";
import { siteSettingsApi } from "@/services/api/site-settings";
import {
  SITE_CMS_SECTIONS,
  SITE_IMAGE_DEFAULTS,
  SITE_IMAGE_LABELS,
  SITE_SETTING_KEYS,
  SITE_URL_ONLY_KEYS,
  type SiteImageKey,
} from "@/lib/sodemy-contact";
import { SODEMY_PARTNERS, SODEMY_TEAM } from "@/lib/sodemy-team";
import { SiteImageUploadButton } from "@/components/dashboard/site-image-upload-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ImageIcon, Loader2, RotateCcw, Save } from "lucide-react";
import { getApiErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { resolveSiteVideoEmbed } from "@/lib/site-video";

function emptyDraft(): Record<string, string> {
  return Object.fromEntries(SITE_SETTING_KEYS.map((k) => [k, ""]));
}

function ImageSlot({
  settingKey,
  draft,
  setDraft,
  aspectClass,
}: {
  settingKey: SiteImageKey;
  draft: Record<string, string>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  aspectClass?: string;
}) {
  const isUrlOnly = SITE_URL_ONLY_KEYS.has(settingKey);
  const isLogo = settingKey === "logo_image";
  const value = draft[settingKey]?.trim() ?? "";
  const video = isUrlOnly ? resolveSiteVideoEmbed(value) : null;
  const preview = !isUrlOnly ? value || SITE_IMAGE_DEFAULTS[settingKey] : "";

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 shadow-sm",
        settingKey === "about_video" && "lg:col-span-2",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <Label className="text-sm font-semibold">{SITE_IMAGE_LABELS[settingKey]}</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">{settingKey}</p>
          {settingKey === "about_video" && (
            <p className="mt-1 text-xs text-muted-foreground">
              Paste a YouTube or Vimeo link. When set, it replaces the About image on the home page
              and autoplays (muted).
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {!isUrlOnly && (
            <SiteImageUploadButton
              settingKey={settingKey}
              label="Upload"
              onUrl={(url) => setDraft((d) => ({ ...d, [settingKey]: url }))}
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title="Clear"
            onClick={() => setDraft((d) => ({ ...d, [settingKey]: "" }))}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div
        className={cn(
          "relative mb-3 overflow-hidden rounded-lg border bg-muted",
          aspectClass ??
            (isLogo
              ? "aspect-square max-w-[160px]"
              : settingKey === "about_video"
                ? "aspect-video max-w-2xl"
                : "aspect-[16/10]"),
        )}
      >
        {isUrlOnly ? (
          video ? (
            <iframe
              title="About video preview"
              src={video.embedSrc}
              className="absolute inset-0 h-full w-full border-0"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="flex h-full min-h-[140px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
              Paste a YouTube or Vimeo URL below — preview appears here
            </div>
          )
        ) : preview ? (
          <Image
            src={preview}
            alt={SITE_IMAGE_LABELS[settingKey]}
            fill
            className={cn(isLogo ? "object-contain p-2" : "object-cover")}
            sizes="(max-width: 1024px) 100vw, 40vw"
            unoptimized={preview.startsWith("http")}
          />
        ) : (
          <div className="flex h-full min-h-[100px] items-center justify-center text-sm text-muted-foreground">
            No image
          </div>
        )}
      </div>
      <Input
        value={draft[settingKey] ?? ""}
        onChange={(e) =>
          setDraft((d) => ({ ...d, [settingKey]: e.target.value }))
        }
        placeholder={
          isUrlOnly
            ? "https://www.youtube.com/watch?v=… or https://vimeo.com/…"
            : SITE_IMAGE_DEFAULTS[settingKey] || "Paste image URL…"
        }
      />
      {isUrlOnly && value && !video && (
        <p className="mt-2 text-xs text-destructive">
          Unrecognized link — use a full YouTube or Vimeo URL.
        </p>
      )}
    </div>
  );
}

function TeamEditor({
  draft,
  setDraft,
}: {
  draft: Record<string, string>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {SODEMY_TEAM.map((member) => {
        const preview =
          draft[member.imageKey]?.trim() || member.imageFallback || "";
        return (
          <div key={member.id} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <Label className="text-sm font-semibold">
                  {draft[member.nameKey]?.trim() || member.name}
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">{member.id}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <SiteImageUploadButton
                  settingKey={member.imageKey}
                  label={preview ? "Replace" : "Upload"}
                  onUrl={(url) =>
                    setDraft((d) => ({ ...d, [member.imageKey]: url }))
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  title="Clear photo"
                  onClick={() =>
                    setDraft((d) => ({ ...d, [member.imageKey]: "" }))
                  }
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="relative mb-4 aspect-[16/10] overflow-hidden rounded-lg border bg-muted">
              {preview ? (
                <Image
                  src={preview}
                  alt={member.name}
                  fill
                  className="object-cover object-top"
                  sizes="(max-width: 1024px) 100vw, 40vw"
                  unoptimized={preview.startsWith("http")}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No photo — initials will show on the site
                </div>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input
                  className="mt-1"
                  value={draft[member.nameKey] ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [member.nameKey]: e.target.value }))
                  }
                  placeholder={member.name}
                />
              </div>
              <div>
                <Label className="text-xs">Title</Label>
                <Input
                  className="mt-1"
                  value={draft[member.titleKey] ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [member.titleKey]: e.target.value }))
                  }
                  placeholder={member.title}
                />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea
                  className="mt-1 min-h-[96px]"
                  value={draft[member.bioKey] ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [member.bioKey]: e.target.value }))
                  }
                  placeholder={member.bio}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PartnersEditor({
  draft,
  setDraft,
}: {
  draft: Record<string, string>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {SODEMY_PARTNERS.map((partner) => {
        const preview = draft[partner.imageKey]?.trim() || "";
        const displayName = draft[partner.nameKey]?.trim() || partner.name;
        return (
          <div key={partner.id} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <Label className="text-sm font-semibold">{displayName}</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">{partner.imageKey}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <SiteImageUploadButton
                  settingKey={partner.imageKey}
                  label={preview ? "Replace" : "Upload"}
                  onUrl={(url) =>
                    setDraft((d) => ({ ...d, [partner.imageKey]: url }))
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  title="Clear logo"
                  onClick={() =>
                    setDraft((d) => ({ ...d, [partner.imageKey]: "" }))
                  }
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="relative mb-3 flex aspect-[3/2] items-center justify-center overflow-hidden rounded-lg border bg-white p-4 dark:bg-muted">
              {preview ? (
                <Image
                  src={preview}
                  alt={displayName}
                  fill
                  className="object-contain p-2"
                  sizes="200px"
                  unoptimized={preview.startsWith("http")}
                />
              ) : (
                <div className="text-center text-sm text-muted-foreground">
                  No logo — name text will show
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs">Organization name</Label>
              <Input
                className="mt-1"
                value={draft[partner.nameKey] ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [partner.nameKey]: e.target.value }))
                }
                placeholder={partner.name}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SiteCmsPage() {
  const { ready } = useAdminOnlyPage();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>(emptyDraft);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-site-settings"],
    queryFn: () => siteSettingsApi.getAdmin().then((r) => r.data.data ?? {}),
    enabled: ready,
  });

  useEffect(() => {
    if (!data) return;
    setDraft((prev) => {
      const next = { ...prev };
      for (const key of SITE_SETTING_KEYS) {
        next[key] = data[key] ?? "";
      }
      return next;
    });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => siteSettingsApi.upsert(draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-site-settings"] });
      queryClient.invalidateQueries({ queryKey: ["public-site-settings"] });
      toast.success("Site CMS saved");
    },
    onError: (err) => toast.error(getApiErrorMessage(err, "Could not save")),
  });

  if (!ready) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Site CMS</h1>
          <p className="text-muted-foreground">
            Manage logo, hero, about, team names and photos, and partner logos. Changes appear on
            the public site after you save.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save changes
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ImageIcon className="h-5 w-5" />
            Website content
          </CardTitle>
          <CardDescription>
            Upload images or edit names and descriptions, then click Save changes. Replacing a
            partner or team photo is saved immediately after upload.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          ) : (
            <Tabs defaultValue={SITE_CMS_SECTIONS[0].id} className="w-full">
              <TabsList className="mb-6 flex h-auto w-full flex-wrap justify-start gap-1">
                {SITE_CMS_SECTIONS.map((section) => (
                  <TabsTrigger key={section.id} value={section.id} className="text-xs sm:text-sm">
                    {section.title}
                  </TabsTrigger>
                ))}
              </TabsList>
              {SITE_CMS_SECTIONS.map((section) => (
                <TabsContent key={section.id} value={section.id} className="space-y-4">
                  <div>
                    <h2 className="text-base font-semibold">{section.title}</h2>
                    <p className="text-sm text-muted-foreground">{section.description}</p>
                  </div>
                  {section.id === "team" ? (
                    <TeamEditor draft={draft} setDraft={setDraft} />
                  ) : section.id === "partners" ? (
                    <PartnersEditor draft={draft} setDraft={setDraft} />
                  ) : (
                    <div
                      className={cn(
                        "grid gap-6",
                        section.id === "brand" ? "max-w-sm" : "lg:grid-cols-2",
                      )}
                    >
                      {section.keys.map((key) => (
                        <ImageSlot
                          key={key}
                          settingKey={key}
                          draft={draft}
                          setDraft={setDraft}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
