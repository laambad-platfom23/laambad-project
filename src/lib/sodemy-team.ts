/** Shared team & partner content for landing + About page. */

import type { SiteImageKey } from "@/lib/sodemy-contact";

type SettingsMap = Record<string, string | undefined> | undefined;

export type TeamMember = {
  id: string;
  name: string;
  title: string;
  bio: string;
  /** Site-settings key for this member's photo (admin-managed). */
  imageKey: SiteImageKey;
  nameKey: string;
  titleKey: string;
  bioKey: string;
  /** Static fallback when no admin upload exists */
  imageFallback?: string;
  initials: string;
  accent: string;
};

export const SODEMY_TEAM: TeamMember[] = [
  {
    id: "founder",
    name: "Abdinur Walan Wal",
    title: "Founder & Director",
    bio: "Leads Laambad with a clear vision — high-quality digital skills training that prepares young people for real careers.",
    imageKey: "team_founder_image",
    nameKey: "team_founder_name",
    titleKey: "team_founder_title",
    bioKey: "team_founder_bio",
    imageFallback: "/images/team/abdinur-walanwal.png",
    initials: "AW",
    accent: "bg-[#0B1F3A]",
  },
  {
    id: "design-lead",
    name: "Amina Hassan",
    title: "Head of Graphic Design",
    bio: "Graphic Design instructor with deep Adobe Illustrator, Photoshop, and branding experience — helping students build strong portfolios.",
    imageKey: "team_design_lead_image",
    nameKey: "team_design_lead_name",
    titleKey: "team_design_lead_title",
    bioKey: "team_design_lead_bio",
    initials: "AH",
    accent: "bg-[#061528]",
  },
  {
    id: "video-lead",
    name: "Omar Jama",
    title: "Video & Camera Lead",
    bio: "Video Editing and Camera specialist — After Effects, storytelling, and production for tomorrow’s creatives.",
    imageKey: "team_video_lead_image",
    nameKey: "team_video_lead_name",
    titleKey: "team_video_lead_title",
    bioKey: "team_video_lead_bio",
    initials: "OJ",
    accent: "bg-[#0A1830]",
  },
  {
    id: "marketing-lead",
    name: "Sahra Nur",
    title: "Digital Marketing Lead",
    bio: "Digital Marketing trainer focused on Meta Ads, Google Ads, and real market-ready campaigns.",
    imageKey: "team_marketing_lead_image",
    nameKey: "team_marketing_lead_name",
    titleKey: "team_marketing_lead_title",
    bioKey: "team_marketing_lead_bio",
    initials: "SN",
    accent: "bg-[#0B1F3A]",
  },
];

export type PartnerLogo = {
  id: string;
  name: string;
  mark: string;
  /** Site-settings key for this partner's logo (admin-managed). */
  imageKey: SiteImageKey;
  nameKey: string;
};

/** Partner slots — upload logos from Site CMS; text mark shows until an image is set. */
export const SODEMY_PARTNERS: PartnerLogo[] = [
  { id: "hormuud", name: "Hormuud Telecom", mark: "Hormuud", imageKey: "partner_hormuud_image", nameKey: "partner_hormuud_name" },
  { id: "somtel", name: "Somtel", mark: "Somtel", imageKey: "partner_somtel_image", nameKey: "partner_somtel_name" },
  { id: "dahabshiil", name: "Dahabshiil", mark: "Dahabshiil", imageKey: "partner_dahabshiil_image", nameKey: "partner_dahabshiil_name" },
  { id: "salaam", name: "Salaam Bank", mark: "Salaam", imageKey: "partner_salaam_image", nameKey: "partner_salaam_name" },
  { id: "premier", name: "Premier Bank", mark: "Premier", imageKey: "partner_premier_image", nameKey: "partner_premier_name" },
  { id: "somcable", name: "Somcable", mark: "Somcable", imageKey: "partner_somcable_image", nameKey: "partner_somcable_name" },
  { id: "amoud", name: "Amoud University", mark: "Amoud", imageKey: "partner_amoud_image", nameKey: "partner_amoud_name" },
  { id: "sims", name: "SIMAD University", mark: "SIMAD", imageKey: "partner_simad_image", nameKey: "partner_simad_name" },
];

export const SODEMY_ABOUT_BLURB =
  "Laambad is an e-learning platform offering practical courses taught by experienced instructors — so students gain job-ready skills and certificates.";

export function initialsFromName(name: string, fallback: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const a = parts[0][0] ?? "";
  const b = parts[parts.length - 1][0] ?? "";
  return `${a}${b}`.toUpperCase();
}

export function settingValue(
  settings: SettingsMap,
  key: string,
  fallback: string,
): string {
  const v = settings?.[key]?.trim();
  const raw = v || fallback;
  // CMS may still store old Sodemy copy — normalize visible brand to Laambad.
  return raw.replace(/\bSODEMY\b/gi, "Laambad").replace(/\bSodemy\b/g, "Laambad");
}

export function resolveTeamMembers(settings?: SettingsMap): TeamMember[] {
  return SODEMY_TEAM.map((member) => {
    const name = settingValue(settings, member.nameKey, member.name);
    return {
      ...member,
      name,
      title: settingValue(settings, member.titleKey, member.title),
      bio: settingValue(settings, member.bioKey, member.bio),
      initials: initialsFromName(name, member.initials),
    };
  });
}

export function resolvePartners(settings?: SettingsMap): PartnerLogo[] {
  return SODEMY_PARTNERS.map((partner) => {
    const name = settingValue(settings, partner.nameKey, partner.name);
    return {
      ...partner,
      name,
      mark: name,
    };
  });
}

export const TEAM_CMS_TEXT_KEYS = SODEMY_TEAM.flatMap((m) => [
  m.nameKey,
  m.titleKey,
  m.bioKey,
]);

export const PARTNER_CMS_TEXT_KEYS = SODEMY_PARTNERS.map((p) => p.nameKey);
