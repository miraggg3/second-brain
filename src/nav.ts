// Navigation: four tabs plus full-screen overlays (note editor, premium, data).

import { signal } from "@preact/signals";

export type Tab = "today" | "gym" | "notes" | "progress";

export type Overlay =
  | { name: "editor"; id: string | null }
  | { name: "premium" }
  | { name: "data" };

export const tab = signal<Tab>("today");
export const overlay = signal<Overlay | null>(null);

export function goTab(t: Tab) {
  overlay.value = null;
  tab.value = t;
  window.scrollTo(0, 0);
}

export function openOverlay(o: Overlay) {
  overlay.value = o;
  window.scrollTo(0, 0);
}

export function closeOverlay() {
  overlay.value = null;
  window.scrollTo(0, 0);
}
