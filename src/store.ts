// App state: one signal with all data. Components read `data.value` and
// re-render automatically; every change goes through set()/update() and is saved.

import { computed, signal } from "@preact/signals";
import type { AppData, DataKey } from "./types";
import { loadKey, removeKey, saveKey } from "./storage";
import { toast } from "./ui";

export const DEFAULTS: AppData = {
  notes: [],
  workouts: [],
  habits: [],
  metrics: { water: {}, sleep: {}, mood: {}, weight: {} },
  trackers: [],
  settings: { theme: "auto", style: "soft", waterGoal: 2000, lastBackup: 0, joined: 0 },
  premium: { until: 0, lifetime: false },
};

export const DATA_KEYS = Object.keys(DEFAULTS) as DataKey[];

export const data = signal<AppData>(structuredClone(DEFAULTS));
export const loaded = signal(false);

function withDefaults<K extends DataKey>(key: K, value: unknown): AppData[K] {
  const def = DEFAULTS[key];
  if (Array.isArray(def)) return (Array.isArray(value) ? value : structuredClone(def)) as AppData[K];
  // objects: merge so keys added in newer versions get their defaults
  const obj = value && typeof value === "object" ? value : {};
  return { ...structuredClone(def), ...obj } as AppData[K];
}

export async function loadAll() {
  const next = { ...data.value };
  for (const key of DATA_KEYS) {
    const raw = await loadKey<unknown>(key, null);
    (next as Record<DataKey, unknown>)[key] = withDefaults(key, raw);
  }
  if (!next.settings.joined) {
    next.settings = { ...next.settings, joined: Date.now() };
    saveKey("settings", next.settings).catch(() => undefined);
  }
  data.value = next;
  loaded.value = true;
}

export function set<K extends DataKey>(key: K, value: AppData[K]) {
  data.value = { ...data.value, [key]: value };
  saveKey(key, value).catch((e) => {
    console.error(e);
    toast("Не удалось сохранить: место на устройстве закончилось?");
  });
}

export function update<K extends DataKey>(key: K, fn: (v: AppData[K]) => AppData[K]) {
  set(key, fn(data.value[key]));
}

// Replace everything at once (import). Premium status is kept.
export async function replaceAll(next: AppData) {
  data.value = next;
  for (const key of DATA_KEYS) await saveKey(key, next[key]);
}

export async function wipeAll() {
  for (const key of DATA_KEYS) await removeKey(key);
  data.value = { ...structuredClone(DEFAULTS), premium: data.value.premium };
  await saveKey("premium", data.value.premium);
}

export const isPremium = computed(() => {
  const p = data.value.premium;
  return p.lifetime || p.until > Date.now();
});
