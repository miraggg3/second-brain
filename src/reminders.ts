// Habit reminders from the bot.
//
// Only habits with a reminder leave the device: id, name, emoji, time and the
// time zone are sent to the server whenever they change. Checking a habit
// tells the server "done today" so the bot doesn't remind; "Done" pressed in
// a bot reminder comes back with /api/me and is applied here.

import { effect } from "@preact/signals";
import { api, serverOnline } from "./api";
import { data, update } from "./store";
import { lang, t } from "./i18n";
import { inTelegram } from "./telegram";
import { toast } from "./ui";
import type { Habit } from "./types";

const SENT_KEY = "reminders:last-sync";

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function payload() {
  return {
    tz: timeZone(),
    lang: lang.value,
    reminders: data.value.habits
      .filter((h) => h.remind)
      .map((h) => ({ id: h.id, name: h.name, emoji: h.emoji, time: h.remind })),
  };
}

function lastSent(): string | null {
  try { return localStorage.getItem(SENT_KEY); } catch { return null; }
}

async function push(body: string) {
  if (!inTelegram || !serverOnline.value || body === lastSent()) return;
  // never had reminders: nothing to tell the server
  if (lastSent() === null && !JSON.parse(body).reminders.length) return;
  try {
    await api("/api/reminders", JSON.parse(body));
    try { localStorage.setItem(SENT_KEY, body); } catch { /* fine, it'll resend */ }
  } catch (e) {
    console.warn("reminders not synced:", (e as Error).message);
  }
}

// keeps the server's list in sync with the habits (debounced)
export function initReminderSync() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  effect(() => {
    const body = JSON.stringify(payload());
    if (!serverOnline.value) return;
    clearTimeout(timer);
    timer = setTimeout(() => void push(body), 1200);
  });
}

// the habit was checked / unchecked for `day` in the app
export function reportHabitDone(h: Habit, day: string, done: boolean) {
  if (!h.remind || !inTelegram || !serverOnline.value) return;
  api("/api/reminders/done", { habitId: h.id, day, done }).catch(() => undefined);
}

// "Done" pressed in bot reminders while the app was closed
export function applyBotMarks(marks: { habitId: string; day: string }[] | undefined) {
  if (!marks?.length) return;
  let n = 0;
  update("habits", (hs) => hs.map((h) => {
    const days = marks.filter((m) => m.habitId === h.id && !h.done[m.day]).map((m) => m.day);
    if (!days.length) return h;
    n += days.length;
    const done = { ...h.done };
    for (const d of days) done[d] = true;
    return { ...h, done };
  }));
  if (n) toast(t("today.markedFromBot", { n }));
}
