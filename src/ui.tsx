// Shared UI kit: toast, bottom-sheet form, icons, cards, rings, steppers, avatar.

import { signal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { hapticTick } from "./telegram";
import { useHold } from "./gestures";
import { shareImageItem } from "./share";
import { locale, t } from "./i18n";

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
  type?: "text" | "number" | "time";
  value?: string | number;
  placeholder?: string;
  step?: string;
  suffix?: string;
}

interface SheetState {
  title: string;
  note?: string;
  ok: string;
  fields: Field[];
  resolve: (v: Record<string, string> | null) => void;
}

export const sheet = signal<SheetState | null>(null);

// Resolves to { name: value } or null when cancelled.
export function ask(opts: { title: string; fields: Field[]; ok?: string; note?: string }) {
  return new Promise<Record<string, string> | null>((resolve) => {
    sheet.value = { ok: t("common.save"), ...opts, resolve };
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
    if (s) setTimeout(() => form.current?.querySelector("input")?.focus(), 80);
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
        <div class="sheet-grip" />
        <h3>{s.title}</h3>
        {s.note && <p class="sheet-note">{s.note}</p>}
        {s.fields.map((f) => (
          <label key={f.name} class="sheet-field">
            <span>{f.label}</span>
            <div class="input-wrap">
              <input
                name={f.name}
                type={f.type ?? "text"}
                defaultValue={String(f.value ?? "")}
                placeholder={f.placeholder}
                step={f.step}
                inputMode={f.type === "number" ? "decimal" : undefined}
                autoComplete="off"
              />
              {f.suffix && <i>{f.suffix}</i>}
            </div>
          </label>
        ))}
        <div class="sheet-actions">
          <button type="button" class="btn ghost" onClick={() => closeSheet()}>{t("common.cancel")}</button>
          <button type="submit" class="btn">{s.ok}</button>
        </div>
      </form>
    </div>
  );
}

// ---------- icons (24px, rounded strokes) ----------

const PATHS = {
  today: "M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  gym: "M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11",
  notes: "M7 3.5h7.5L19 8v12.5H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2zM14 3.5V8h5M8.5 12.5h7M8.5 16h5",
  progress: "M4 19.5h16M6.5 16v-4M11 16V8M15.5 16v-6M20 16V5",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c.8-3.6 3.9-5.5 7.5-5.5s6.7 1.9 7.5 5.5",
  sparkle: "M12 3l2 5.5L19.5 10.5 14 12.5 12 18l-2-5.5L4.5 10.5 10 8.5zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  palette: "M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.8-.9 1.5-1.8-.4-1.1.3-2.2 1.5-2.2H17a3.5 3.5 0 0 0 3.5-3.5c0-5-3.8-9.5-8.5-9.5zM7.5 12.5h.01M9.5 8h.01M14.5 8h.01M17 11.5h.01",
  transfer: "M7 4L3.5 7.5 7 11M3.5 7.5H16M17 13l3.5 3.5L17 20M20.5 16.5H8",
  chevron: "M9.5 6l6 6-6 6",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  close: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  check: "M5 12.5l4.5 4.5L19 7.5",
  trash: "M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4l.8-12.5M10 11v5M14 11v5",
  send: "M20.5 3.5L10 14M20.5 3.5L14 20.5l-4-6.5-6.5-4z",
  download: "M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14",
  upload: "M12 15.5V4.5M7.5 9L12 4.5 16.5 9M5 19.5h14",
  copy: "M9 9h10.5v10.5H9zM15 9V4.5H4.5V15H9",
  share: "M12 3.5v11M8 7.5l4-4 4 4M6 11H5v9.5h14V11h-1",
  play: "M8 5.5v13l10-6.5z",
  lock: "M6.5 11h11v9h-11zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  flame: "M12 21c3.6 0 6-2.4 6-6 0-4.2-3.5-6.4-4.5-11-2.4 1.6-3.5 4.2-3.3 6.4C9.3 9.8 8.6 9 8.4 7.6 6.8 9.2 6 11.3 6 15c0 3.6 2.4 6 6 6z",
  drop: "M12 3.5c3.3 4 6 7.2 6 10.5a6 6 0 0 1-12 0c0-3.3 2.7-6.5 6-10.5z",
  moon: "M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z",
  scale: "M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5zM9 9.5a3 3 0 0 1 6 0M12 9.5l1.2-1.5",
  smile: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM8.5 14c.9 1.3 2 2 3.5 2s2.6-.7 3.5-2M9 9.5h.01M15 9.5h.01",
  trophy: "M8 4.5h8v5a4 4 0 0 1-8 0zM8 6.5H4.5c0 3 1.5 4.5 3.7 4.8M16 6.5h3.5c0 3-1.5 4.5-3.7 4.8M12 13.5v3.5M8.5 20h7M10 17h4",
  crown: "M4 8l4 4 4-6.5 4 6.5 4-4-1.5 10h-13zM5.5 20.5h13",
  edit: "M4.5 19.5l1-4L16 5a2.1 2.1 0 0 1 3 3L8.5 18.5zM14 7l3 3",
  timer: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2M9.5 2.5h5",
  heart: "M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7.1 4.5 4.5 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z",
  shield: "M12 3.5l7 2.5v5.5c0 4.6-3 8-7 9.5-4-1.5-7-4.9-7-9.5V6z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  bell: "M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0",
  bellOff: "M3.5 3.5l17 17M8.2 5.9A6 6 0 0 1 18 11v4M6 11v5.5l-1.5 2H17M10 20.5a2 2 0 0 0 4 0",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-1.9 1.1L15 20.5h-4l-.3-2a7 7 0 0 1-1.9-1.1l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-2.2L4.9 9.1l2-3.4 1.9.7a7 7 0 0 1 1.9-1.1l.3-2h4l.3 2a7 7 0 0 1 1.9 1.1l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 2.2z",
  globe: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM3.5 12h17M12 3.5c2.3 2.3 3.4 5.2 3.4 8.5s-1.1 6.2-3.4 8.5M12 3.5C9.7 5.8 8.6 8.7 8.6 12s1.1 6.2 3.4 8.5",
  folder: "M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z",
  grid: "M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z",
  eyeOff: "M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4.5 9.5 6-.5.8-1.6 2.3-3.2 3.6M6.4 7.6C4.5 8.9 3.1 10.8 2.5 12c1 1.5 4.5 6 9.5 6 1.6 0 3-.4 4.3-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg class={`ico ico-${name}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" stroke-width={stroke}>
      <path d={PATHS[name]} />
    </svg>
  );
}

// ---------- layout ----------

export function Card(props: {
  title?: string;
  icon?: IconName;
  action?: ComponentChildren;
  class?: string;
  children?: ComponentChildren;
  onClick?: () => void;
  id?: string;
  share?: string; // tracker key: hold the card to share it as a picture (shareCards.tsx)
}) {
  const ref = useHold<HTMLElement>({ menu: props.share ? () => [shareImageItem(props.share!)] : undefined });
  return (
    <section ref={ref} id={props.id} class={`card ${props.class ?? ""}`} onClick={props.onClick} data-share={props.share}>
      {(props.title || props.action) && (
        <div class="card-head">
          <h2>
            {props.icon && <Icon name={props.icon} size={18} />}
            {props.title}
          </h2>
          {props.action}
        </div>
      )}
      {props.children}
    </section>
  );
}

export function Empty({ icon, children }: { icon?: IconName; children: ComponentChildren }) {
  return (
    <div class="empty">
      {icon && <span class="empty-ico"><Icon name={icon} size={22} /></span>}
      <p>{children}</p>
    </div>
  );
}

export function PageHead({ title, sub, right }: { title: string; sub?: string; right?: ComponentChildren }) {
  return (
    <header class="page-head">
      <div class="grow">
        {sub && <p class="eyebrow">{sub}</p>}
        <h1>{title}</h1>
      </div>
      {right}
    </header>
  );
}

// Progress ring. value 0..1
export function Ring({ value, color, size = 64, stroke = 7, children }:
  { value: number; color: string; size?: number; stroke?: number; children?: ComponentChildren }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div class="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} class="ring-track" stroke-width={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} class="ring-value" stroke={color} stroke-width={stroke}
          stroke-dasharray={`${c} ${c}`} stroke-dashoffset={c * (1 - v)} />
      </svg>
      <div class="ring-label">{children}</div>
    </div>
  );
}

// − value + control. Tapping the number lets you type it.
export function Stepper({ value, step, min = 0, unit, onChange, digits = 1 }:
  { value: number; step: number; min?: number; unit: string; onChange: (v: number) => void; digits?: number }) {
  const fmt = (v: number) => Number(v.toFixed(digits)).toLocaleString(locale.value);
  const change = (d: number) => {
    hapticTick();
    onChange(Math.max(min, Number((value + d).toFixed(2))));
  };
  const type = async () => {
    const v = await ask({ title: unit === t("unit.kg") ? t("app.weight") : t("app.reps"), fields: [{ name: "v", label: unit, type: "number", step: "any", value }] });
    const n = v ? parseFloat(v.v.replace(",", ".")) : NaN;
    if (Number.isFinite(n) && n >= min) onChange(n);
  };
  return (
    <div class="stepper">
      <button type="button" aria-label={t("app.less")} onClick={() => change(-step)}><Icon name="minus" size={18} /></button>
      <button type="button" class="stepper-val" onClick={type}>
        <b>{fmt(value)}</b>
        <small>{unit}</small>
      </button>
      <button type="button" aria-label={t("app.more")} onClick={() => change(step)}><Icon name="plus" size={18} /></button>
    </div>
  );
}

const AVATAR_GRADIENTS = [
  ["#FF8A65", "#F0528C"], ["#5B5BF6", "#22C6D6"], ["#10B981", "#A3E635"],
  ["#9B5CF6", "#F0528C"], ["#F59E0B", "#EF4444"], ["#06B6D4", "#3B82F6"],
];

export function Avatar({ name, photo, size = 44, seed = 0, ring }:
  { name: string; photo?: string; size?: number; seed?: number; ring?: boolean }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  const [a, b] = AVATAR_GRADIENTS[Math.abs(seed) % AVATAR_GRADIENTS.length]!;
  return (
    <span class={`avatar ${ring ? "ring-gold" : ""}`} style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, ${a}, ${b})` }}>
      {initials}
      {photo && <img src={photo} alt="" referrerpolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = "none")} />}
    </span>
  );
}

export function Segmented<T extends string>({ value, options, onChange }:
  { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div class="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" class={o.id === value ? "on" : ""} onClick={() => { hapticTick(); onChange(o.id); }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Row({ icon, color, title, sub, right, onClick, danger }: {
  icon: IconName; color?: string; title: string; sub?: string; right?: ComponentChildren;
  onClick?: () => void; danger?: boolean;
}) {
  return (
    <button class={`row-item ${danger ? "danger" : ""}`} onClick={onClick}>
      <span class="row-ico" style={color ? { background: color } : undefined}><Icon name={icon} size={19} /></span>
      <span class="row-text">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </span>
      {right ?? <Icon name="chevron" size={18} />}
    </button>
  );
}
