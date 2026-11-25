// Color themes and card styles. Pure data, no DOM.
//
// Every palette is checked by scripts/check-contrast.ts (npm run contrast):
// text and secondary text on page and cards, accent on cards, text on the
// accent, and the category colors both as icons on cards and under white text.

import type { CardStyle, ThemeId } from "./types";
import type { Key } from "./i18n";

// Names are i18n keys. This file also runs under plain Node
// (scripts/check-contrast.ts), so it can't import the i18n runtime: the app
// hands t() over with setThemeTranslator() and names are looked up on use.
let tr: (key: Key) => string = (key) => key;
export function setThemeTranslator(f: (key: Key) => string) {
  tr = f;
}

// Colors of the trackers: same meaning in every theme, tuned per theme
export interface Categories {
  water: string;
  sleep: string;
  weight: string;
  mood: string;
  gym: string;
}

export interface Palette {
  name: string;    // i18n key (built-in themes)
  dark: boolean;
  premium: boolean;
  bg: string;      // page
  card: string;    // cards
  raised: string;  // inputs, chips inside cards
  text: string;
  muted: string;   // secondary text
  accent: string;
  accent2: string; // second gradient stop
  onAccent: string;
  cats: Categories;
}

// Deep tones for light themes and calm-bright tones for dark ones: both read
// as icons on cards and carry white text on top.
const CATS_LIGHT: Categories = {
  water: "#1F6FEB", sleep: "#6A4BE8", weight: "#0F7F73", mood: "#B26200", gym: "#D93A4A",
};
const CATS_DARK: Categories = {
  water: "#3A86F0", sleep: "#8162F2", weight: "#12907F", mood: "#C46F08", gym: "#E0434F",
};

export const PALETTES: Record<Exclude<ThemeId, "auto" | "telegram">, Palette> = {
  // calm neutral palettes for the default "clean" style: one accent, no gradient
  light: {
    name: "appearance.themeLight", dark: false, premium: false,
    bg: "#F2F2F7", card: "#FFFFFF", raised: "#EDEDF0", text: "#000000", muted: "#6C6C72",
    accent: "#0071E3", accent2: "#0071E3", onAccent: "#FFFFFF", cats: CATS_LIGHT,
  },
  dark: {
    name: "appearance.themeDark", dark: true, premium: false,
    bg: "#000000", card: "#1C1C1E", raised: "#2C2C2E", text: "#FFFFFF", muted: "#98989F",
    accent: "#0A6CFF", accent2: "#0A6CFF", onAccent: "#FFFFFF", cats: CATS_DARK,
  },
  // indigo → violet
  snow: {
    name: "appearance.themeSnow", dark: false, premium: false,
    bg: "#F4F5FA", card: "#FFFFFF", raised: "#ECEEF6", text: "#14151C", muted: "#646A80",
    accent: "#4F46E5", accent2: "#8B5CF6", onAccent: "#FFFFFF", cats: CATS_LIGHT,
  },
  midnight: {
    name: "appearance.themeMidnight", dark: true, premium: false,
    bg: "#0B0C12", card: "#171822", raised: "#232533", text: "#F3F4F9", muted: "#9497AD",
    accent: "#8B8BFF", accent2: "#C38BFF", onAccent: "#0B0C12", cats: CATS_DARK,
  },
  // coolors-style palettes
  ocean: { // "Sky blue · Pacific cyan · Prussian blue"
    name: "appearance.themeOcean", dark: true, premium: true,
    bg: "#061521", card: "#0D2133", raised: "#163049", text: "#EAF6FF", muted: "#8EABC6",
    accent: "#48CAE4", accent2: "#0096C7", onAccent: "#03131F",
    cats: { ...CATS_DARK, water: "#2F86D9", weight: "#0F8C7E" },
  },
  forest: { // "Celadon · Mint · Brunswick green"
    name: "appearance.themeForest", dark: true, premium: true,
    bg: "#0B1510", card: "#13221A", raised: "#1D3127", text: "#EDF6EF", muted: "#95AE9F",
    accent: "#74C69D", accent2: "#B7E4C7", onAccent: "#0B1510",
    cats: { ...CATS_DARK, weight: "#2E8B57" },
  },
  sakura: { // "Paradise pink · Amaranth pink · Lavender blush"
    name: "appearance.themeSakura", dark: false, premium: true,
    bg: "#FFF0F3", card: "#FFFFFF", raised: "#FFE3EA", text: "#2B1520", muted: "#7E5E6A",
    accent: "#D6336C", accent2: "#E8598C", onAccent: "#FFFFFF",
    cats: { ...CATS_LIGHT, gym: "#C92A6B" },
  },
  mint: { // "Jungle green · Emerald · Honeydew"
    name: "appearance.themeMint", dark: false, premium: true,
    bg: "#EDF8F2", card: "#FFFFFF", raised: "#DDF1E6", text: "#0F261D", muted: "#557466",
    accent: "#087A5E", accent2: "#1F9A8F", onAccent: "#FFFFFF",
    cats: { ...CATS_LIGHT, weight: "#0B7A6A" },
  },
  neon: { // "Electric lime · Aquamarine · Eerie black"
    name: "appearance.themeNeon", dark: true, premium: true,
    bg: "#0A0A0A", card: "#161616", raised: "#232323", text: "#F5F5F5", muted: "#A3A3A3",
    accent: "#CCFF33", accent2: "#00F5D4", onAccent: "#0A0A0A", cats: CATS_DARK,
  },
  lavender: { // "Medium slate blue · Mauve · Ghost white"
    name: "appearance.themeLavender", dark: false, premium: true,
    bg: "#F5F3FF", card: "#FFFFFF", raised: "#ECE8FF", text: "#1E1736", muted: "#655E85",
    accent: "#6D4AFF", accent2: "#A855F7", onAccent: "#FFFFFF", cats: CATS_LIGHT,
  },
  sunset: { // "Coral · Mango · Dark purple" (synthwave)
    name: "appearance.themeSunset", dark: true, premium: true,
    bg: "#140E1F", card: "#20172F", raised: "#2D2242", text: "#FBF3FF", muted: "#AE9EC6",
    accent: "#FF7A59", accent2: "#FFB347", onAccent: "#140E1F", cats: CATS_DARK,
  },
};

export const THEME_ORDER: ThemeId[] = [
  "auto", "light", "dark", "snow", "midnight", "telegram",
  "ocean", "forest", "sakura", "mint", "neon", "lavender", "sunset",
];

export const THEME_INFO: Record<"auto" | "telegram", { name: Key; premium: boolean }> = {
  auto: { name: "appearance.themeAuto", premium: false },
  telegram: { name: "appearance.themeTelegram", premium: false },
};

export function themeName(id: ThemeId): string {
  return tr(id === "auto" || id === "telegram" ? THEME_INFO[id].name : PALETTES[id].name as Key);
}

export function themeIsPremium(id: ThemeId): boolean {
  return id === "auto" || id === "telegram" ? false : PALETTES[id].premium;
}

export { CATS_DARK, CATS_LIGHT };

export const STYLES: { id: CardStyle; name: string; note: string; premium: boolean }[] = [
  { id: "clean", get name() { return tr("appearance.styleClean"); }, get note() { return tr("appearance.styleCleanNote"); }, premium: false },
  { id: "soft", get name() { return tr("appearance.styleSoft"); }, get note() { return tr("appearance.styleSoftNote"); }, premium: false },
  { id: "outline", get name() { return tr("appearance.styleOutline"); }, get note() { return tr("appearance.styleOutlineNote"); }, premium: false },
  { id: "glass", get name() { return tr("appearance.styleGlass"); }, get note() { return tr("appearance.styleGlassNote"); }, premium: true },
];

export const isThemeId = (v: unknown): v is ThemeId => typeof v === "string" && THEME_ORDER.includes(v as ThemeId);
export const isCardStyle = (v: unknown): v is CardStyle => typeof v === "string" && STYLES.some((s) => s.id === v);
