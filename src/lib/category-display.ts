import {
  BarChart3,
  BookOpen,
  Bot,
  Briefcase,
  Calculator,
  ClipboardList,
  Database,
  GraduationCap,
  HardHat,
  HeartPulse,
  Languages,
  LayoutTemplate,
  Microscope,
  Monitor,
  Palette,
  TrendingUp,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { PublicCourseCategory } from "@/types";

/** "Meta" categories that group courses but are not a subject area (kept in the catalog filter only). */
const NON_SUBJECT_SLUGS = new Set(["new-courses"]);

/** Subject categories for marketing sections (hero, pillars, footer), most courses first. */
export function subjectCategories(cats: PublicCourseCategory[] | undefined, limit?: number) {
  const list = (cats ?? []).filter((c) => !NON_SUBJECT_SLUGS.has(c.slug));
  return limit ? list.slice(0, limit) : list;
}

const ICON_RULES: [RegExp, LucideIcon][] = [
  [/artificial|\bai\b|machine learning/i, Bot],
  [/data science|data analy|data collection|database/i, Database],
  [/statistic|research method|analytics/i, BarChart3],
  [/research|publication/i, Microscope],
  [/accounting|finance|financial|fianancial/i, Calculator],
  [/market|crypto/i, TrendingUp],
  [/procurement|supply chain|logistic/i, Truck],
  [/project|pmp/i, ClipboardList],
  [/construction|architect|engineering/i, HardHat],
  [/graphic|design|video/i, Palette],
  [/web/i, LayoutTemplate],
  [/computer/i, Monitor],
  [/english|language/i, Languages],
  [/health/i, HeartPulse],
  [/business|management|communication/i, Briefcase],
  [/education/i, GraduationCap],
];

export function categoryIcon(name: string): LucideIcon {
  for (const [re, icon] of ICON_RULES) if (re.test(name)) return icon;
  return BookOpen;
}

/** Short label for tight UI (orbit chips, rotating hero word): first words up to ~maxLen chars. */
export function shortCategoryLabel(name: string, maxLen = 20): string {
  if (name.length <= maxLen) return name;
  const words = name.split(/\s+/);
  let out = "";
  for (const w of words) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > maxLen) break;
    out = next;
  }
  out = out.replace(/\s+(and|&|of|for|the)$/i, "");
  return out || name.slice(0, maxLen);
}
