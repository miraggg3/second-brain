// Color themes and card styles. Pure data, no DOM.

import type { CardStyle, ThemeId } from "./types";

export interface Palette {
  name: string;
  dark: boolean;
  premium: boolean;
  bg: string;      // page
  card: string;    // cards
  raised: string;  // inputs, chips inside cards
  text: string;
  muted: string;
  accent: string;
  accent2: string; // second gradient stop
  onAccent: string;
}

export const PALETTES: Record<Exclude<ThemeId, "auto" | "telegram">, Palette> = {
  // calm neutral palettes for the default "clean" style: one accent, no gradient
  light: {
    name: "Светлая", dark: false, premium: false,
    bg: "#EEF0F6", card: "#FFFFFF", raised: "#EDEDF0", text: "#000000", muted: "#7C7C82",
    accent: "#007AFF", accent2: "#007AFF", onAccent: "#FFFFFF",
  },
  dark: {
    name: "Тёмная", dark: true, premium: false,
    bg: "#000000", card: "#1C1C1E", raised: "#2C2C2E", text: "#FFFFFF", muted: "#8D8D93",
    accent: "#0A84FF", accent2: "#0A84FF", onAccent: "#FFFFFF",
  },
  snow: {
    name: "Снег", dark: false, premium: false,
    bg: "#F3F4F8", card: "#FFFFFF", raised: "#F1F2F7", text: "#14151C", muted: "#868AA0",
    accent: "#5B5BF6", accent2: "#9B5CF6", onAccent: "#FFFFFF",
  },
  midnight: {
    name: "Полночь", dark: true, premium: false,
    bg: "#0B0C12", card: "#17181F", raised: "#22232D", text: "#F3F4F9", muted: "#7F8399",
    accent: "#7C7CFF", accent2: "#C17BFF", onAccent: "#FFFFFF",
  },
  ocean: {
    name: "Океан", dark: true, premium: true,
    bg: "#04121C", card: "#0B2130", raised: "#12304A", text: "#E8F6FF", muted: "#6E93AB",
    accent: "#22C6D6", accent2: "#3B82F6", onAccent: "#04121C",
  },
  forest: {
    name: "Лес", dark: true, premium: true,
    bg: "#0A120D", card: "#132019", raised: "#1C2D23", text: "#ECF7EF", muted: "#7A9584",
    accent: "#4ADE80", accent2: "#A3E635", onAccent: "#0A120D",
  },
  sakura: {
    name: "Сакура", dark: false, premium: true,
    bg: "#FFF3F6", card: "#FFFFFF", raised: "#FFE9EF", text: "#2B1420", muted: "#A27C8C",
    accent: "#F0528C", accent2: "#FF8A65", onAccent: "#FFFFFF",
  },
  mint: {
    name: "Мята", dark: false, premium: true,
    bg: "#EEF9F5", card: "#FFFFFF", raised: "#E3F4EE", text: "#0F2620", muted: "#6F948A",
    accent: "#10B981", accent2: "#06B6D4", onAccent: "#FFFFFF",
  },
  neon: {
    name: "Неон", dark: true, premium: true,
    bg: "#050505", card: "#121212", raised: "#1D1D1D", text: "#F5F5F5", muted: "#7C7C7C",
    accent: "#C8FF2E", accent2: "#2EFFD5", onAccent: "#050505",
  },
};

export const THEME_ORDER: ThemeId[] = ["auto", "light", "dark", "snow", "midnight", "telegram", "ocean", "forest", "sakura", "mint", "neon"];

export const THEME_INFO: Record<"auto" | "telegram", { name: string; premium: boolean }> = {
  auto: { name: "Авто", premium: false },
  telegram: { name: "Как в Telegram", premium: false },
};

export function themeName(id: ThemeId): string {
  return id === "auto" || id === "telegram" ? THEME_INFO[id].name : PALETTES[id].name;
}

export function themeIsPremium(id: ThemeId): boolean {
  return id === "auto" || id === "telegram" ? false : PALETTES[id].premium;
}

export const STYLES: { id: CardStyle; name: string; note: string; premium: boolean }[] = [
  { id: "clean", name: "Прозрачный", note: "стеклянные панели и кнопки поверх мягкого фона", premium: false },
  { id: "soft", name: "Мягкий", note: "заливка и лёгкая тень", premium: false },
  { id: "outline", name: "Контур", note: "тонкие линии, без теней", premium: false },
  { id: "glass", name: "Стекло", note: "полупрозрачные карточки на цветном фоне", premium: true },
];

export const isThemeId = (v: unknown): v is ThemeId => typeof v === "string" && THEME_ORDER.includes(v as ThemeId);
export const isCardStyle = (v: unknown): v is CardStyle => typeof v === "string" && STYLES.some((s) => s.id === v);
