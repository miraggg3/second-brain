// Backup file: export everything to one JSON file and import it on another
// device (phone -> PC). Imported data is validated item by item, so a broken
// or foreign file can never corrupt the app.

import type {
  AppData, DayValues, Exercise, Folder, Habit, Metrics, Note, Tracker, UserData, Workout,
} from "./types";
import { DEFAULTS } from "./store";
import { isCardStyle, isThemeId } from "./themes";
import { isLang, t } from "./i18n";
import { dayKey } from "./utils";

export const BACKUP_APP = "second-brain";
export const BACKUP_VERSION = 1;

export interface Backup {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: number;
  data: UserData;
}

export function makeBackup(d: AppData): Backup {
  const { premium: _premium, ...user } = d;
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: Date.now(), data: user };
}

export const backupFileName = () => `second-brain-${dayKey()}.json`;

// ---------- validation ----------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 100_000) => (typeof v === "string" ? v.slice(0, max) : null);
const fin = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function arr<T>(v: unknown, clean: (x: Obj) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const c = isObj(x) ? clean(x) : null;
    return c ? [c] : [];
  });
}

function dayValues(v: unknown): DayValues {
  const out: DayValues = {};
  if (!isObj(v)) return out;
  for (const [k, x] of Object.entries(v)) {
    const n = fin(x);
    if (DAY_RE.test(k) && n !== null) out[k] = n;
  }
  return out;
}

const cleanNote = (x: Obj): Note | null => {
  const id = str(x.id, 64), text = str(x.text), created = fin(x.created), updated = fin(x.updated);
  if (!id || text === null || created === null) return null;
  const note: Note = { id, text, created, updated: updated ?? created };
  const folder = str(x.folder, 64), order = fin(x.order);
  if (folder) note.folder = folder;
  if (order !== null) note.order = order;
  return note;
};

const cleanFolder = (x: Obj): Folder | null => {
  const id = str(x.id, 64), name = str(x.name, 60);
  return id && name ? { id, name, created: fin(x.created) ?? Date.now() } : null;
};

const WIDGET_RE = /^(water|sleep|weight|mood|t:[\w-]{1,64})$/;
function cleanWidgets(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return [...new Set(v.filter((x): x is string => typeof x === "string" && WIDGET_RE.test(x)))];
}

const cleanExercise = (x: Obj): Exercise | null => {
  const name = str(x.name, 80);
  if (!name) return null;
  const sets = arr(x.sets, (s) => {
    const w = fin(s.w), r = fin(s.r);
    return w !== null && r !== null && w >= 0 && r > 0 ? { w, r } : null;
  });
  return { name, sets };
};

const cleanWorkout = (x: Obj): Workout | null => {
  const id = str(x.id, 64), start = fin(x.start), end = fin(x.end);
  // unfinished workouts are not transferred: the other device may have its own
  return id && start !== null && end !== null ? { id, start, end, items: arr(x.items, cleanExercise) } : null;
};

const cleanHabit = (x: Obj): Habit | null => {
  const id = str(x.id, 64), name = str(x.name, 80);
  if (!id || !name) return null;
  const done: Record<string, true> = {};
  if (isObj(x.done)) for (const k of Object.keys(x.done)) if (DAY_RE.test(k) && x.done[k]) done[k] = true;
  return { id, name, emoji: str(x.emoji, 8) ?? "", created: fin(x.created) ?? Date.now(), done };
};

const cleanTracker = (x: Obj): Tracker | null => {
  const id = str(x.id, 64), name = str(x.name, 60);
  if (!id || !name) return null;
  const step = fin(x.step);
  return { id, name, unit: str(x.unit, 16) ?? "", step: step && step > 0 ? step : 1, values: dayValues(x.values) };
};

function cleanMetrics(v: unknown): Metrics {
  const m = isObj(v) ? v : {};
  return { water: dayValues(m.water), sleep: dayValues(m.sleep), mood: dayValues(m.mood), weight: dayValues(m.weight) };
}

// Throws an Error with a user-facing message.
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(t("data.errNotJson"));
  }
  if (!isObj(raw)) throw new Error(t("data.errEmpty"));
  // also accept "backup.json" from the old .zip export (data without a wrapper)
  const wrapped = raw.app === BACKUP_APP && isObj(raw.data);
  const d = wrapped ? (raw.data as Obj) : raw;
  if (!wrapped && !("notes" in d || "workouts" in d || "habits" in d)) {
    throw new Error(t("data.errForeign"));
  }
  if (wrapped && Number(raw.version) > BACKUP_VERSION) {
    throw new Error(t("data.errNewer"));
  }
  const s = isObj(d.settings) ? d.settings : {};
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: fin(raw.exportedAt) ?? 0,
    data: {
      notes: arr(d.notes, cleanNote),
      folders: arr(d.folders, cleanFolder),
      workouts: arr(d.workouts, cleanWorkout),
      habits: arr(d.habits, cleanHabit),
      metrics: cleanMetrics(d.metrics),
      trackers: arr(d.trackers, cleanTracker),
      settings: {
        ...DEFAULTS.settings,
        theme: isThemeId(s.theme) ? s.theme : DEFAULTS.settings.theme,
        style: isCardStyle(s.style) ? s.style : DEFAULTS.settings.style,
        waterGoal: fin(s.waterGoal) ?? DEFAULTS.settings.waterGoal,
        joined: fin(s.joined) ?? 0,
        widgets: cleanWidgets(s.widgets),
        lang: isLang(s.lang) ? s.lang : undefined,
      },
    },
  };
}

// ---------- summary ----------

export function countMetrics(m: Metrics): number {
  return Object.values(m).reduce((n, map) => n + Object.keys(map).length, 0);
}

export function summarize(d: UserData): string {
  const parts = [
    [d.notes.length, "data.sumNotes"],
    [d.workouts.length, "data.sumWorkouts"],
    [d.habits.length, "data.sumHabits"],
    [d.trackers.length, "data.sumTrackers"],
    [countMetrics(d.metrics), "data.sumMetrics"],
  ] as const;
  const text = parts.filter(([n]) => n > 0).map(([n, key]) => t(key, { n }));
  return text.join(", ") || t("data.sumEmpty");
}

// ---------- merge / replace ----------

function byId<T extends { id: string }>(local: T[], incoming: T[], pick: (a: T, b: T) => T): T[] {
  const map = new Map(local.map((x) => [x.id, x]));
  for (const y of incoming) {
    const x = map.get(y.id);
    map.set(y.id, x ? pick(x, y) : y);
  }
  return [...map.values()];
}

const sets = (w: Workout) => w.items.reduce((n, it) => n + it.sets.length, 0);

// Keeps everything from both devices. Same item on both: the newer / fuller one wins,
// day-by-day values are combined.
export function mergeData(local: AppData, inc: UserData): AppData {
  const metrics = { ...local.metrics };
  for (const k of Object.keys(metrics) as (keyof Metrics)[]) metrics[k] = { ...local.metrics[k], ...inc.metrics[k] };
  return {
    ...local,
    notes: byId(local.notes, inc.notes, (a, b) => (b.updated > a.updated ? b : a)),
    folders: byId(local.folders, inc.folders, (_a, b) => b),
    workouts: byId(local.workouts, inc.workouts, (a, b) => (!a.end || sets(b) > sets(a) ? b : a)),
    habits: byId(local.habits, inc.habits, (a, b) => ({ ...b, done: { ...a.done, ...b.done } })),
    trackers: byId(local.trackers, inc.trackers, (a, b) => ({ ...b, values: { ...a.values, ...b.values } })),
    metrics,
    settings: {
      ...local.settings,
      joined: Math.min(local.settings.joined || Date.now(), inc.settings.joined || Date.now()),
      // trackers new to this device show up on the main screen too
      widgets: local.settings.widgets && [
        ...local.settings.widgets,
        ...inc.trackers.filter((t) => !local.trackers.some((x) => x.id === t.id)).map((t) => `t:${t.id}`),
      ],
    },
  };
}

// Everything on this device is replaced by the file (premium status stays).
export function replaceData(local: AppData, inc: UserData): AppData {
  const active = local.workouts.filter((w) => !w.end);
  return { ...inc, workouts: [...inc.workouts, ...active], premium: local.premium };
}
