// Data model. Every top-level key of AppData is stored separately on the device.

export interface Note {
  id: string;
  text: string;
  created: number;
  updated: number;
}

export interface WorkSet {
  w: number; // weight, kg
  r: number; // reps
}

export interface Exercise {
  name: string;
  sets: WorkSet[];
}

export interface Workout {
  id: string;
  start: number;
  end: number | null; // null = workout in progress
  items: Exercise[];
}

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  created: number;
  done: Record<string, true>; // "2026-11-24" -> true
}

export type MetricKind = "water" | "sleep" | "mood" | "weight";
export type DayValues = Record<string, number>; // "2026-11-24" -> value
export type Metrics = Record<MetricKind, DayValues>;

export interface Tracker {
  id: string;
  name: string;
  unit: string;
  step: number;
  values: DayValues;
}

export interface Settings {
  accent: string | null;
  waterGoal: number;
  lastBackup: number; // 0 = never
}

export interface Premium {
  until: number;
  lifetime: boolean;
}

export interface AppData {
  notes: Note[];
  workouts: Workout[];
  habits: Habit[];
  metrics: Metrics;
  trackers: Tracker[];
  settings: Settings;
  premium: Premium; // cached server answer, never exported
}

export type DataKey = keyof AppData;
export type UserData = Omit<AppData, "premium">;
