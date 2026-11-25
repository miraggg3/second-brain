// Habit reminders.
//
// The app sends only habits with a reminder: id, name, emoji, "HH:MM" and the
// user's time zone. Every 5 minutes the cron finds reminders that are due in
// the user's local time and the bot sends them with "Done" and "Open".
// "Done" in the bot is queued in `marks` until the app picks it up on its
// next open; a habit already done in the app is not reminded that day.

import { isLang, langOf, texts, type Lang } from "./texts";

export interface ReminderEnv {
  SQL: D1Database;
  WEBAPP_URL: string;
}

type Tg = <T = unknown>(method: string, body?: object) => Promise<T>;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[\w-]{1,64}$/;
const LATE_LIMIT = 90; // minutes: a reminder missed by more (outage) is skipped

interface Row {
  user_id: number;
  habit_id: string;
  name: string;
  emoji: string;
  time: string;
  tz: string;
  lang: string;
  last_sent: string | null;
  done_day: string | null;
}

function validTz(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// local "YYYY-MM-DD" and minutes since midnight in a time zone
function localNow(tz: string, now = new Date()): { day: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// ---------- API from the app ----------

// Replaces the user's reminder list. Keeps "already sent / done today" of
// habits that stay, so re-syncing never sends a second reminder the same day.
export async function syncReminders(env: ReminderEnv, userId: number, body: Record<string, unknown>): Promise<{ count: number } | null> {
  const tz = body.tz;
  const list = body.reminders;
  if (!validTz(tz) || !Array.isArray(list) || list.length > 50) return null;
  const lang: Lang = langOf(undefined, body.lang);
  const items = list.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const r = x as Record<string, unknown>;
    if (typeof r.id !== "string" || !ID_RE.test(r.id) || typeof r.time !== "string" || !TIME_RE.test(r.time)) return [];
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 60) : "";
    if (!name) return [];
    return [{ id: r.id, name, emoji: typeof r.emoji === "string" ? r.emoji.slice(0, 8) : "", time: r.time }];
  });

  const stmts: D1PreparedStatement[] = [];
  const ids = items.map((i) => i.id);
  stmts.push(ids.length
    ? env.SQL.prepare(`DELETE FROM reminders WHERE user_id = ? AND habit_id NOT IN (${ids.map(() => "?").join(",")})`).bind(userId, ...ids)
    : env.SQL.prepare("DELETE FROM reminders WHERE user_id = ?").bind(userId));
  for (const i of items) {
    stmts.push(env.SQL.prepare(
      `INSERT INTO reminders (user_id, habit_id, name, emoji, time, tz, lang) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, habit_id) DO UPDATE SET name = excluded.name, emoji = excluded.emoji,
         time = excluded.time, tz = excluded.tz, lang = excluded.lang`,
    ).bind(userId, i.id, i.name, i.emoji, i.time, tz, lang));
  }
  await env.SQL.batch(stmts);
  return { count: items.length };
}

// The habit was checked (or unchecked) in the app on `day`.
export async function markFromApp(env: ReminderEnv, userId: number, body: Record<string, unknown>): Promise<boolean> {
  const { habitId, day, done } = body;
  if (typeof habitId !== "string" || !ID_RE.test(habitId) || typeof day !== "string" || !DAY_RE.test(day)) return false;
  if (done) {
    await env.SQL.prepare("UPDATE reminders SET done_day = ? WHERE user_id = ? AND habit_id = ?").bind(day, userId, habitId).run();
  } else {
    await env.SQL.batch([
      env.SQL.prepare("UPDATE reminders SET done_day = NULL WHERE user_id = ? AND habit_id = ? AND done_day = ?").bind(userId, habitId, day),
      env.SQL.prepare("DELETE FROM marks WHERE user_id = ? AND habit_id = ? AND day = ?").bind(userId, habitId, day),
    ]);
  }
  return true;
}

// "Done" presses from the bot, handed to the app once (then forgotten)
export async function takeMarks(env: ReminderEnv, userId: number): Promise<{ habitId: string; day: string }[]> {
  const { results } = await env.SQL.prepare("SELECT habit_id, day FROM marks WHERE user_id = ?").bind(userId).all<{ habit_id: string; day: string }>();
  if (results.length) await env.SQL.prepare("DELETE FROM marks WHERE user_id = ?").bind(userId).run();
  return results.map((r) => ({ habitId: r.habit_id, day: r.day }));
}

// ---------- cron ----------

function reminderKeyboard(env: ReminderEnv, lang: Lang, habitId: string) {
  const x = texts(lang);
  return {
    inline_keyboard: [[
      { text: x.reminderDone, callback_data: `done:${habitId}` },
      { text: x.open, web_app: { url: env.WEBAPP_URL } },
    ]],
  };
}

export async function sendDueReminders(env: ReminderEnv, tg: Tg, now = new Date()) {
  const { results } = await env.SQL.prepare("SELECT * FROM reminders").all<Row>();
  const sent: D1PreparedStatement[] = [];
  const blocked = new Set<number>();
  for (const r of results) {
    if (blocked.has(r.user_id) || !validTz(r.tz)) continue;
    const local = localNow(r.tz, now);
    if (r.last_sent === local.day || r.done_day === local.day) continue;
    const late = local.minutes - minutesOf(r.time);
    if (late < 0 || late > LATE_LIMIT) continue;
    const lang = isLang(r.lang) ? r.lang : "ru";
    try {
      await tg("sendMessage", {
        chat_id: r.user_id,
        text: texts(lang).reminderText.replace("{habit}", `${r.emoji ? r.emoji + " " : ""}${r.name}`),
        reply_markup: reminderKeyboard(env, lang, r.habit_id),
      });
      sent.push(env.SQL.prepare("UPDATE reminders SET last_sent = ? WHERE user_id = ? AND habit_id = ?").bind(local.day, r.user_id, r.habit_id));
    } catch (e) {
      // 403: the user blocked the bot or never started it — stop reminding
      if ((e as { code?: number }).code === 403) {
        blocked.add(r.user_id);
        sent.push(env.SQL.prepare("DELETE FROM reminders WHERE user_id = ?").bind(r.user_id));
      } else {
        console.error("reminder failed:", (e as Error).message);
      }
    }
  }
  if (sent.length) await env.SQL.batch(sent);
}

// ---------- "Done" button in the reminder ----------

interface CallbackQuery {
  id: string;
  from: { id: number; language_code?: string };
  data?: string;
  message?: { chat: { id: number }; message_id: number; text?: string };
}

export async function onReminderCallback(env: ReminderEnv, tg: Tg, q: CallbackQuery) {
  const habitId = q.data?.startsWith("done:") ? q.data.slice(5) : "";
  const row = ID_RE.test(habitId)
    ? await env.SQL.prepare("SELECT * FROM reminders WHERE user_id = ? AND habit_id = ?").bind(q.from.id, habitId).first<Row>()
    : null;
  const lang = row && isLang(row.lang) ? row.lang : langOf(q.from.language_code);
  const x = texts(lang);
  if (!row) {
    await tg("answerCallbackQuery", { callback_query_id: q.id, text: x.reminderGone });
    return;
  }
  const day = localNow(row.tz).day;
  await env.SQL.batch([
    env.SQL.prepare("INSERT OR IGNORE INTO marks (user_id, habit_id, day) VALUES (?, ?, ?)").bind(q.from.id, habitId, day),
    env.SQL.prepare("UPDATE reminders SET done_day = ? WHERE user_id = ? AND habit_id = ?").bind(day, q.from.id, habitId),
  ]);
  await tg("answerCallbackQuery", { callback_query_id: q.id, text: x.reminderMarked });
  if (q.message) {
    await tg("editMessageText", {
      chat_id: q.message.chat.id,
      message_id: q.message.message_id,
      text: x.reminderDoneText.replace("{habit}", `${row.emoji ? row.emoji + " " : ""}${row.name}`),
      reply_markup: { inline_keyboard: [[{ text: x.open, web_app: { url: env.WEBAPP_URL } }]] },
    }).catch(() => undefined);
  }
}
