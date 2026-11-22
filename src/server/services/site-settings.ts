import { prisma, newId, now } from "@/lib/db";
import { Err } from "@/lib/api/errors";
import { savePublicUpload } from "@/lib/local-storage";

function isKnownKey(key: string) {
  const base = [
    "logo_image",
    "hero_image",
    "about_image",
    "about_video",
    "about_leadership_image",
  ];
  if (base.includes(key)) return true;
  if (key.startsWith("team_")) {
    return (
      key.endsWith("_image") ||
      key.endsWith("_name") ||
      key.endsWith("_title") ||
      key.endsWith("_bio")
    );
  }
  if (key.startsWith("partner_")) {
    return key.endsWith("_image") || key.endsWith("_name");
  }
  return false;
}

function isImageUploadKey(key: string) {
  if (key === "about_video") return false;
  if (
    ["logo_image", "hero_image", "about_image", "about_leadership_image"].includes(key)
  ) {
    return true;
  }
  if (key.startsWith("team_") && key.endsWith("_image")) return true;
  if (key.startsWith("partner_") && key.endsWith("_image")) return true;
  return false;
}

export async function getMap() {
  try {
    const rows = await prisma.siteSetting.findMany();
    const data: Record<string, string> = {};
    for (const r of rows) {
      if (r.value) data[r.key] = r.value;
    }
    return data;
  } catch {
    // Table may not exist yet if Go AutoMigrate never ran against this DB.
    return {};
  }
}

export async function upsertImages(payload: Record<string, string>) {
  const t = now();
  for (const [key, value] of Object.entries(payload)) {
    if (!isKnownKey(key)) throw Err.invalidInput(`unknown setting key: ${key}`);
    const existing = await prisma.siteSetting.findUnique({ where: { key } });
    if (existing) {
      await prisma.siteSetting.update({
        where: { key },
        data: { value: value ?? "", updatedAt: t },
      });
    } else {
      await prisma.siteSetting.create({
        data: { id: newId(), key, value: value ?? "", createdAt: t, updatedAt: t },
      });
    }
  }
  return getMap();
}

export async function uploadSiteImage(
  settingKey: string,
  filename: string,
  contentType: string,
  data: Buffer
) {
  if (!isImageUploadKey(settingKey)) {
    throw Err.invalidInput("key does not accept image upload");
  }
  const saved = await savePublicUpload("website", filename, data, contentType);
  await upsertImages({ [settingKey]: saved.url });
  return saved.url;
}

export { isKnownKey };
