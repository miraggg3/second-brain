// Applies the chosen theme + card style to the page and to Telegram's own bars.

import { effect, signal } from "@preact/signals";
import { canUse, inTelegram, tg } from "./telegram";
import { data, isPremium } from "./store";
import { PALETTES, themeIsPremium, type Palette } from "./themes";
import type { ThemeId } from "./types";

function detectScheme(): "light" | "dark" {
  if (inTelegram) return tg!.colorScheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const scheme = signal(detectScheme());

// Theme colors of the Telegram app itself
function telegramPalette(): Palette {
  const dark = scheme.value === "dark";
  const base = dark ? PALETTES.dark : PALETTES.light;
  const p = tg?.themeParams ?? {};
  const accent = p.button_color ?? base.accent;
  return {
    ...base,
    name: "Telegram",
    bg: p.secondary_bg_color ?? base.bg,
    card: p.section_bg_color ?? p.bg_color ?? base.card,
    text: p.text_color ?? base.text,
    muted: p.hint_color ?? base.muted,
    accent,
    accent2: p.link_color ?? accent,
    onAccent: p.button_text_color ?? "#FFFFFF",
  };
}

export function paletteOf(id: ThemeId): Palette {
  if (id === "auto") return scheme.value === "dark" ? PALETTES.dark : PALETTES.light;
  if (id === "telegram") return telegramPalette();
  return PALETTES[id];
}

export function initTheme() {
  if (inTelegram) tg!.onEvent("themeChanged", () => (scheme.value = tg!.colorScheme));
  else window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => (scheme.value = detectScheme()));

  effect(() => {
    const s = data.value.settings;
    // premium themes/styles fall back when the subscription ends
    const themeId = themeIsPremium(s.theme) && !isPremium.value ? "auto" : s.theme;
    const style = s.style === "glass" && !isPremium.value ? "clean" : s.style;
    const p = paletteOf(themeId);
    const root = document.documentElement;
    root.dataset.mode = p.dark ? "dark" : "light";
    root.dataset.style = style;
    const vars: Record<string, string> = {
      "--bg": p.bg, "--card": p.card, "--raised": p.raised, "--text": p.text, "--muted": p.muted,
      "--accent": p.accent, "--accent2": p.accent2, "--on-accent": p.onAccent,
    };
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    if (canUse("6.1")) {
      tg!.setHeaderColor(p.bg);
      tg!.setBackgroundColor(p.bg);
    }
    if (canUse("7.10")) tg!.setBottomBarColor?.(p.bg);
  });
}
