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

export type ThemeId = "auto" | "light" | "dark" | "snow" | "midnight" | "telegram" | "ocean" | "forest" | "sakura" | "mint" | "neon" | "lavender" | "sunset";
export type CardStyle = "clean" | "soft" | "glass" | "outline";

export interface Settings {
  theme: ThemeId;
  style: CardStyle;
  waterGoal: number;
  lastBackup: number; // 0 = never
  joined: number; // first launch on this device
  design?: number; // design version the settings were last migrated to
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
