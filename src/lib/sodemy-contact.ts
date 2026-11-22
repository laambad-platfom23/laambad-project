/** Shared contact + social links for marketing pages (Laambad). */

export const SODEMY_CONTACT = {
  email: "Laambad99@gmail.com",
  phonePrimaryDisplay: "+252 61 0887755",
  phoneSecondaryDisplay: "+252 61 0887755",
  phonePrimaryTel: "+252610887755",
  phoneSecondaryTel: "+252610887755",
  phonesDisplay: "+252 61 0887755",
  website: "laambad.com",
  websiteUrl: "https://laambad.com",
  address: "Taleh Hodon, Mogadishu Somalia",
  hours: "Hours: 24/7",
  whatsappUrl: "https://wa.me/252610887755",
  facebookUrl: "https://www.facebook.com/share/1BMF4pxSeu/",
  tiktokUrl: "https://www.tiktok.com/@sodemy.so?_r=1&_t=ZS-98iPEEasaFI",
} as const;

export const SODEMY_SOCIAL_LINKS = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    href: SODEMY_CONTACT.whatsappUrl,
  },
  {
    id: "facebook",
    label: "Facebook",
    href: SODEMY_CONTACT.facebookUrl,
  },
  {
    id: "tiktok",
    label: "TikTok",
    href: SODEMY_CONTACT.tiktokUrl,
  },
] as const;

/** Known site-setting keys (must match backend). */
export const SITE_IMAGE_KEYS = [
  "logo_image",
  "hero_image",
  "about_image",
  "about_video",
  "about_leadership_image",
  "team_founder_image",
  "team_design_lead_image",
  "team_video_lead_image",
  "team_marketing_lead_image",
  "partner_hormuud_image",
  "partner_somtel_image",
  "partner_dahabshiil_image",
  "partner_salaam_image",
  "partner_premier_image",
  "partner_somcable_image",
  "partner_amoud_image",
  "partner_simad_image",
] as const;

export type SiteImageKey = (typeof SITE_IMAGE_KEYS)[number];

/** Keys that accept a URL only (no file upload) — e.g. YouTube / Vimeo. */
export const SITE_URL_ONLY_KEYS = new Set<SiteImageKey>(["about_video"]);

export const SITE_IMAGE_DEFAULTS: Record<SiteImageKey, string> = {
  logo_image: "/images/laambad-logo.png",
  hero_image: "/images/sodemy-hero.png",
  about_image: "/images/about-laambad.png",
  about_video: "",
  about_leadership_image: "/images/team/abdinur-walanwal.png",
  team_founder_image: "/images/team/abdinur-walanwal.png",
  team_design_lead_image: "",
  team_video_lead_image: "",
  team_marketing_lead_image: "",
  partner_hormuud_image: "",
  partner_somtel_image: "",
  partner_dahabshiil_image: "",
  partner_salaam_image: "",
  partner_premier_image: "",
  partner_somcable_image: "",
  partner_amoud_image: "",
  partner_simad_image: "",
};

export const SITE_SETTING_KEYS: readonly string[] = [
  ...SITE_IMAGE_KEYS,
  "team_founder_name",
  "team_founder_title",
  "team_founder_bio",
  "team_design_lead_name",
  "team_design_lead_title",
  "team_design_lead_bio",
  "team_video_lead_name",
  "team_video_lead_title",
  "team_video_lead_bio",
  "team_marketing_lead_name",
  "team_marketing_lead_title",
  "team_marketing_lead_bio",
  "partner_hormuud_name",
  "partner_somtel_name",
  "partner_dahabshiil_name",
  "partner_salaam_name",
  "partner_premier_name",
  "partner_somcable_name",
  "partner_amoud_name",
  "partner_simad_name",
];

export const SITE_IMAGE_LABELS: Record<SiteImageKey, string> = {
  logo_image: "Site logo",
  hero_image: "Home hero image",
  about_image: "About section image",
  about_video: "About section video (YouTube / Vimeo)",
  about_leadership_image: "About page leadership photo",
  team_founder_image: "Team — Founder photo",
  team_design_lead_image: "Team — Design lead photo",
  team_video_lead_image: "Team — Video lead photo",
  team_marketing_lead_image: "Team — Marketing lead photo",
  partner_hormuud_image: "Partner — Hormuud",
  partner_somtel_image: "Partner — Somtel",
  partner_dahabshiil_image: "Partner — Dahabshiil",
  partner_salaam_image: "Partner — Salaam Bank",
  partner_premier_image: "Partner — Premier Bank",
  partner_somcable_image: "Partner — Somcable",
  partner_amoud_image: "Partner — Amoud University",
  partner_simad_image: "Partner — SIMAD University",
};

/** Grouped slots for the Site CMS admin UI. */
export const SITE_CMS_SECTIONS: {
  id: string;
  title: string;
  description: string;
  keys: readonly SiteImageKey[];
}[] = [
  {
    id: "brand",
    title: "Brand",
    description: "Logo shown in the header, footer, and login screens.",
    keys: ["logo_image"],
  },
  {
    id: "marketing",
    title: "Hero & about",
    description:
      "Home hero portrait and About section. Paste a YouTube or Vimeo link in About video — it autoplays on the site and replaces the image when set.",
    keys: ["hero_image", "about_image", "about_video", "about_leadership_image"],
  },
  {
    id: "team",
    title: "Our team",
    description:
      "Edit names, titles, bios, and photos for Instructors & leaders.",
    keys: [
      "team_founder_image",
      "team_design_lead_image",
      "team_video_lead_image",
      "team_marketing_lead_image",
    ],
  },
  {
    id: "partners",
    title: "Clients & partners",
    description:
      "Upload or replace organization logos and names in the Clients & partners marquee.",
    keys: [
      "partner_hormuud_image",
      "partner_somtel_image",
      "partner_dahabshiil_image",
      "partner_salaam_image",
      "partner_premier_image",
      "partner_somcable_image",
      "partner_amoud_image",
      "partner_simad_image",
    ],
  },
];
