// Shared UI: toast, bottom-sheet form, icons and layout pieces.

import { signal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

// ---------- toast ----------

const toastText = signal<string | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(text: string) {
  toastText.value = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastText.value = null), 2600);
}

export function Toast() {
  return toastText.value ? <div class="toast" role="status">{toastText.value}</div> : null;
}

// ---------- bottom sheet form ----------

export interface Field {
  name: string;
  label: string;
  type?: "text" | "number";
  value?: string | number;
  placeholder?: string;
  step?: string;
}

interface SheetState {
  title: string;
  ok: string;
  fields: Field[];
  resolve: (v: Record<string, string> | null) => void;
}

export const sheet = signal<SheetState | null>(null);

// Resolves to { name: value } or null when cancelled.
export function ask(opts: { title: string; fields: Field[]; ok?: string }) {
  return new Promise<Record<string, string> | null>((resolve) => {
    sheet.value = { ok: "Сохранить", ...opts, resolve };
  });
}

export function closeSheet(result: Record<string, string> | null = null) {
  sheet.value?.resolve(result);
  sheet.value = null;
}

export function Sheet() {
  const s = sheet.value;
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (s) setTimeout(() => form.current?.querySelector("input")?.focus(), 60);
  }, [s]);
  if (!s) return null;

  const submit = (e: Event) => {
    e.preventDefault();
    const values: Record<string, string> = {};
    for (const input of form.current!.querySelectorAll("input")) values[input.name] = input.value.trim();
    closeSheet(values);
  };

  return (
    <div class="sheet-bg" onClick={(e) => e.target === e.currentTarget && closeSheet()}>
      <form class="sheet" ref={form} onSubmit={submit}>
        <div class="sheet-tab">запись</div>
        <h3>{s.title}</h3>
        {s.fields.map((f) => (
          <label key={f.name}>
            <span>{f.label}</span>
            <input
              name={f.name}
              type={f.type ?? "text"}
              defaultValue={String(f.value ?? "")}
              placeholder={f.placeholder}
              step={f.step}
              inputMode={f.type === "number" ? "decimal" : undefined}
              autoComplete="off"
            />
          </label>
        ))}
        <div class="row">
          <button type="button" class="btn ghost" onClick={() => closeSheet()}>Отмена</button>
          <button type="submit" class="btn">{s.ok}</button>
        </div>
      </form>
    </div>
  );
}

// ---------- icons (hand-drawn-ish strokes) ----------

const PATHS = {
  day: "M4 5h16v15H4z M4 10h16 M9 3v4 M15 3v4",
  gym: "M3 9v6 M6.5 6v12 M17.5 6v12 M21 9v6 M6.5 12h11",
  notes: "M6 3h9l4 4v14H6z M15 3v4h4 M9 12h7 M9 16h5",
  progress: "M4 4v16h16 M7.5 15l4-4.5 3 3L20 7",
  star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z",
  data: "M8 4v16 M4 8l4-4 4 4 M16 20V4 M12 16l4 4 4-4",
  plus: "M12 5v14 M5 12h14",
  close: "M6 6l12 12 M18 6L6 18",
  back: "M15 5l-7 7 7 7",
  send: "M4 11.5L20 4l-6.5 16-2.5-6.5z",
  download: "M12 4v11 M7 10l5 5 5-5 M5 20h14",
  upload: "M12 20V9 M7 14l5-5 5 5 M5 4h14",
  copy: "M9 9h11v11H9z M15 9V4H4v11h5",
  paste: "M8 4h8v3H8z M6 5H4v16h16V5h-2 M8 12h8 M8 16h5",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13",
  play: "M7 4l13 8-13 8z",
  lock: "M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg class="ico" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

// ---------- layout ----------

export function Section(props: {
  label: string;
  num?: string;
  action?: ComponentChildren;
  class?: string;
  children?: ComponentChildren;
  onClick?: () => void;
}) {
  return (
    <section class={`sheet-card ${props.class ?? ""}`} onClick={props.onClick}>
      <div class="sec-head">
        <span class="sec-label">
          {props.num && <b>{props.num}</b>}
          {props.label}
        </span>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}

export function Empty({ children }: { children: ComponentChildren }) {
  return <p class="empty">{children}</p>;
}
