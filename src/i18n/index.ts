// Translations.
//
// - Russian is the source language and is bundled; English, Ukrainian and
//   Arabic are separate chunks loaded only when chosen (and the Arabic font
//   only for Arabic), so nobody downloads languages they don't use.
// - t("key", { n, name }) returns the text; plural entries pick the right
//   form for the language via Intl.PluralRules (ru/uk: one/few/many,
//   en: one/other, ar: zero/one/two/few/many/other).
// - Components that call t() re-render when the language changes.
//
// Adding a key: put it into src/i18n/ru/<namespace>.ts and the same file in
// en/, uk/, ar/ — the type check fails until every language has it.

import { computed, signal } from "@preact/signals";
import ru from "./ru";

export type Lang = "ru" | "en" | "uk" | "ar";

export interface Plural {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

export type Entry = string | Plural;
export type Key = keyof typeof ru;
export type Dict = Record<Key, Entry>;

// own name first, so anyone can find their language without reading the UI
export const LANGS: { id: Lang; name: string; english: string; flag: string; rtl?: boolean }[] = [
  { id: "ru", name: "Русский", english: "Russian", flag: "🇷🇺" },
  { id: "en", name: "English", english: "English", flag: "🇬🇧" },
  { id: "uk", name: "Українська", english: "Ukrainian", flag: "🇺🇦" },
  { id: "ar", name: "العربية", english: "Arabic", flag: "🇸🇦", rtl: true },
];

const LOCALE: Record<Lang, string> = { ru: "ru-RU", en: "en-US", uk: "uk-UA", ar: "ar" };

const loaders: Record<Exclude<Lang, "ru">, () => Promise<{ default: Dict }>> = {
  en: () => import("./en"),
  uk: () => import("./uk"),
  ar: () => import("./ar"),
};

export const lang = signal<Lang>("ru");
const dict = signal<Dict>(ru);
let rules = new Intl.PluralRules(LOCALE.ru);

// locale tag for Intl date/number formatting
export const locale = computed(() => LOCALE[lang.value]);
export const isRtl = computed(() => lang.value === "ar");

export const isLang = (v: unknown): v is Lang => typeof v === "string" && v in LOCALE;

// Telegram's language → one of ours (Belarusian/Kazakh users usually read Russian)
export function detectLang(code: string | undefined): Lang {
  const c = (code ?? "").toLowerCase().split("-")[0];
  if (c === "uk") return "uk";
  if (c === "ar") return "ar";
  if (["ru", "be", "kk", "ky", "uz", "tg"].includes(c)) return "ru";
  return c ? "en" : "ru";
}

export async function setLanguage(l: Lang) {
  if (l === "ar") void import("@fontsource-variable/noto-sans-arabic");
  const next = l === "ru" ? ru : (await loaders[l]()).default;
  rules = new Intl.PluralRules(LOCALE[l]);
  dict.value = next;
  lang.value = l;
  const root = document.documentElement;
  root.lang = l;
  root.dir = l === "ar" ? "rtl" : "ltr";
}

function fmt(v: string | number): string {
  if (typeof v === "string") return v;
  return Number.isInteger(v) ? v.toLocaleString(locale.value) : Number(v.toFixed(1)).toLocaleString(locale.value);
}

// t("gym.sets", { n: 3 }) → "3 подхода" / "3 sets" / "3 підходи" / "3 مجموعات"
export function t(key: Key, params?: Record<string, string | number>): string {
  const e = dict.value[key] ?? ru[key];
  let s: string;
  if (typeof e === "string") s = e;
  else {
    const n = Number(params?.n ?? 0);
    s = e[rules.select(n) as keyof Plural] ?? e.other;
  }
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (params[k] === undefined ? m : fmt(params[k]!)));
}
