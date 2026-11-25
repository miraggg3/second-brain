// Pure logic for gym and habits (no UI, no storage).

import type { DayValues, Habit, Workout, WorkSet } from "./types";
import { dayKey, daysAgo, startOfWeek } from "./utils";
import { t } from "./i18n";

// default suggestions in the current language
export const defaultExercises = (): string[] => t("gym.defaultExercises").split("|");

export const activeWorkout = (ws: Workout[]) => ws.find((w) => !w.end) ?? null;

export const finishedWorkouts = (ws: Workout[]) =>
  ws.filter((w) => w.end).sort((a, b) => b.start - a.start);

export const workoutsSince = (ws: Workout[], date: Date) =>
  ws.filter((w) => w.end && w.start >= date.getTime());

// Weeks in a row with at least one workout. The current week counts once it has one.
export function weekStreak(ws: Workout[]): number {
  const weeks = new Set(ws.filter((w) => w.end).map((w) => startOfWeek(w.start).getTime()));
  const cursor = startOfWeek();
  if (!weeks.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 7);
  let n = 0;
  while (weeks.has(cursor.getTime())) {
    n++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return n;
}

export const setVolume = (sets: WorkSet[]) => sets.reduce((s, x) => s + x.w * x.r, 0);

export const volumeOf = (w: Workout) => w.items.reduce((sum, it) => sum + setVolume(it.sets), 0);

export const setCount = (w: Workout) => w.items.reduce((n, it) => n + it.sets.length, 0);

// Estimated one-rep max (Epley formula)
export const e1rm = (w: number, r: number) => (r <= 1 ? w : w * (1 + r / 30));

export function exerciseNames(ws: Workout[]): string[] {
  const used = finishedWorkouts(ws).flatMap((w) => w.items.map((i) => i.name));
  return [...new Set([...used, ...defaultExercises()])];
}

// Last set of this exercise in a previous workout: pre-fills weight and reps
export function previousSet(ws: Workout[], name: string): WorkSet | null {
  for (const w of finishedWorkouts(ws)) {
    const it = w.items.find((x) => x.name === name && x.sets.length);
    if (it) return it.sets[it.sets.length - 1];
  }
  return null;
}

export interface ExercisePoint {
  date: number;
  best1rm: number;
  maxW: number;
  volume: number;
}

// Best result per workout for one exercise, oldest first
export function exerciseHistory(ws: Workout[], name: string): ExercisePoint[] {
  const out: ExercisePoint[] = [];
  for (const w of finishedWorkouts(ws).reverse()) {
    const it = w.items.find((x) => x.name === name);
    if (!it || !it.sets.length) continue;
    out.push({
      date: w.start,
      best1rm: Math.max(...it.sets.map((s) => e1rm(s.w, s.r))),
      maxW: Math.max(...it.sets.map((s) => s.w)),
      volume: setVolume(it.sets),
    });
  }
  return out;
}

export function duration(ms: number): string {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? t("gym.durationHM", { h, m: m % 60 }) : t("gym.durationM", { m });
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Days in a row the habit was done; today not done yet does not break it.
export function habitStreak(h: Habit): number {
  let n = 0;
  let i = h.done[dayKey()] ? 0 : 1;
  while (h.done[dayKey(daysAgo(i))]) {
    n++;
    i++;
  }
  return n;
}

export function lastValue(map: DayValues): number | null {
  const days = Object.keys(map).sort();
  return days.length ? map[days[days.length - 1]] : null;
}
