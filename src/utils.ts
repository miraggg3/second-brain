// Dates and numbers, formatted for the current language (i18n locale).

import { locale, t } from "./i18n";

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const pad2 = (n: number) => String(n).padStart(2, "0");

// Local calendar day as "YYYY-MM-DD"
export function dayKey(d: Date | number = new Date()): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
}

// "YYYY-MM-DD" -> Date at local noon
export function fromDayKey(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

export function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

export function lastDays(n: number): Date[] {
  return Array.from({ length: n }, (_, i) => daysAgo(n - 1 - i));
}

// Monday 00:00 of the week containing `d`
export function startOfWeek(d: Date | number = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function formatDate(
  ms: number | Date,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" },
): string {
  return new Date(ms).toLocaleString(locale.value, opts);
}

// "24.11" / "11/24" / "24/11"
export function shortDay(d: Date | number | string): string {
  const date = typeof d === "string" ? fromDayKey(d) : new Date(d);
  return date.toLocaleDateString(locale.value, { day: "2-digit", month: "2-digit" });
}

export function num(v: number, digits = 1): string {
  return Number(v.toFixed(digits)).toLocaleString(locale.value);
}

// Russian-only word forms; new code uses t() plural entries instead.
// plural(5, "тренировка", "тренировки", "тренировок") -> "тренировок"
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

// accepts "7,5", "7.5" and Arabic-Indic / Persian digits with "٫"
export function parseNum(s: string): number | null {
  const western = String(s)
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6f0))
    .replace(/[٫,]/, ".");
  const v = parseFloat(western);
  return Number.isFinite(v) ? v : null;
}

export function bytes(n: number): string {
  if (n < 1024) return `${num(n, 0)} ${t("unit.bytes")}`;
  if (n < 1024 * 1024) return `${num(n / 1024, 0)} ${t("unit.kb")}`;
  return `${num(n / 1024 / 1024, 1)} ${t("unit.mb")}`;
}
