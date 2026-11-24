// Own visual identity: "field journal". Light = graph paper, dark = blueprint.
// The light/dark choice follows Telegram; the accent ink is a Premium option.

import { effect, signal } from "@preact/signals";
import { canUse, inTelegram, tg } from "./telegram";
import { data, isPremium } from "./store";

export const DEFAULT_ACCENT = "#FF5B1F";

export const ACCENTS: { color: string; name: string }[] = [
  { color: "#FF5B1F", name: "Сигнальный" },
  { color: "#3346FF", name: "Ультрамарин" },
  { color: "#8FD61F", name: "Кислотный" },
  { color: "#FF2E88", name: "Маджента" },
  { color: "#FFC21A", name: "Жёлтый" },
  { color: "#00A99D", name: "Бирюза" },
];

const PAPER = { light: "#F1ECE1", dark: "#0E1A2B" };
const BAR = { light: "#161616", dark: "#08111E" };

function detect(): "light" | "dark" {
  if (inTelegram) return tg!.colorScheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const scheme = signal(detect());

// readable text color on top of the accent
function onAccent(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? "#161616" : "#FFFFFF";
}

export function initTheme() {
  if (inTelegram) tg!.onEvent("themeChanged", () => (scheme.value = tg!.colorScheme));
  else window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => (scheme.value = detect()));

  effect(() => {
    const mode = scheme.value;
    const chosen = data.value.settings.accent;
    const accent = isPremium.value && chosen ? chosen : DEFAULT_ACCENT;
    const root = document.documentElement;
    root.dataset.theme = mode;
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--on-accent", onAccent(accent));
    if (canUse("6.1")) {
      tg!.setHeaderColor(PAPER[mode]);
      tg!.setBackgroundColor(PAPER[mode]);
    }
    if (canUse("7.10")) tg!.setBottomBarColor?.(BAR[mode]);
  });
}
