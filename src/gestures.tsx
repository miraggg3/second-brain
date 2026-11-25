// iPhone-style "hold" gesture for the whole app.
//
//   press        → the item sinks a little
//   hold 0.4 s   → it lifts with a soft tap of vibration
//   release      → blurred background, the item and a menu next to it
//   move instead → drag: the item follows the finger, the others slide aside
//
// Smoothness rules:
// - nothing is re-rendered or saved while dragging: the item and its
//   neighbours only move with CSS transforms (GPU), in one rAF per frame;
// - the new place is computed from the neighbours' ORIGINAL positions, so it
//   can't flip back and forth when an item slides under the finger;
// - the data changes once, on release, and the item settles into its slot.
//
// Use: const ref = useHold<HTMLDivElement>({ menu, sort }); <div ref={ref}>…

import { signal } from "@preact/signals";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { Icon, type IconName } from "./ui";
import { canUse, tg } from "./telegram";

export interface MenuItem {
  label: string;
  icon: IconName;
  danger?: boolean;
  run?: () => void;
  submenu?: () => MenuItem[]; // replaces the menu instead of closing it
}

export interface SortOptions {
  group: string; // items of one list share a group (and a parent element)
  id: string;
  // called once on release: put dragId right before/after overId
  onReorder: (dragId: string, overId: string, after: boolean) => void;
  onDrop?: (dragId: string, target: string) => void; // target = value of data-drop
}

export interface HoldOptions {
  menu?: () => MenuItem[];
  sort?: SortOptions;
}

interface MenuState {
  rect: DOMRect;
  clone: HTMLElement;
  items: MenuItem[];
}

export const holdMenu = signal<MenuState | null>(null);

const HOLD_MS = 400;
const SINK_DELAY = 90;  // a quick touch that turns into a scroll doesn't sink at all
const MOVE_CANCEL = 10; // px: movement before the lift means scrolling
const DRAG_START = 5;   // px: movement after the lift starts a drag
const SLIDE = "transform .3s cubic-bezier(.25,.9,.3,1)";

// ---------- haptics ----------

function liftHaptic() {
  if (canUse("6.1")) tg!.HapticFeedback.impactOccurred("soft");
  // outside Telegram: browsers allow vibration only after a real tap
  else if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(8);
}

function tickHaptic() {
  if (canUse("6.1")) tg!.HapticFeedback.selectionChanged();
}

function dropHaptic() {
  if (canUse("6.1")) tg!.HapticFeedback.impactOccurred("light");
}

// ---------- the one active press ----------

interface Slot {
  el: HTMLElement;
  id: string;
  x: number; y: number; w: number; h: number; // layout box (offsetLeft/Top: ignores transforms)
}

interface Drop {
  el: HTMLElement;
  value: string;
  rect: DOMRect; // viewport rect when the drag started
}

interface Press {
  el: HTMLElement;
  opts: { current: HoldOptions };
  pointerId: number;
  x0: number; y0: number; // finger down
  x: number; y: number;   // finger now
  state: "pressing" | "held" | "dragging";
  sinkTimer: number;
  holdTimer: number;
  // drag
  scroll0: number;
  slots: Slot[];
  from: number;          // index of the dragged item
  to: number;            // where it would go now
  grid: boolean;
  gap: number;
  drops: Drop[];
  dropOver: Drop | null;
  raf: number;
  scrollRaf: number;
}

let press: Press | null = null;
let suppressClickUntil = 0;

function onMove(e: PointerEvent) {
  const p = press;
  if (!p || e.pointerId !== p.pointerId) return;
  p.x = e.clientX;
  p.y = e.clientY;
  const moved = Math.hypot(p.x - p.x0, p.y - p.y0);
  if (p.state === "pressing") {
    if (moved > MOVE_CANCEL) finish(false);
    return;
  }
  if (p.state === "held") {
    if (moved > DRAG_START && p.opts.current.sort) startDrag(p);
    return;
  }
  // one update per frame, however many pointer events arrive
  if (!p.raf) p.raf = requestAnimationFrame(() => { p.raf = 0; frame(p); });
}

function startDrag(p: Press) {
  const sort = p.opts.current.sort!;
  const parent = p.el.parentElement!;
  const items = [...parent.children].filter(
    (c): c is HTMLElement => c instanceof HTMLElement && c.dataset.sortGroup === sort.group,
  );
  p.slots = items.map((el) => ({
    el, id: el.dataset.sortId ?? "", x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight,
  }));
  p.from = p.to = items.indexOf(p.el);
  p.grid = p.slots.some((s, i) => i > 0 && s.y === p.slots[i - 1]!.y);
  const a = p.slots[0], b = p.slots[1];
  p.gap = a && b && !p.grid ? Math.max(0, b.y - (a.y + a.h)) : 0;
  p.scroll0 = window.scrollY;
  p.drops = sort.onDrop
    ? [...document.querySelectorAll<HTMLElement>("[data-drop]")].map((el) => ({ el, value: el.dataset.drop!, rect: el.getBoundingClientRect() }))
    : [];
  p.state = "dragging";
  p.el.classList.remove("held");
  p.el.classList.add("dragging");
  for (const s of p.slots) if (s.el !== p.el) {
    s.el.style.transition = SLIDE;
    s.el.style.willChange = "transform";
  }
  document.documentElement.classList.add("is-dragging");
  autoScroll(p);
  frame(p);
}

// where every item should be if the dragged one were at index `to`
function layoutFor(p: Press, to: number): Map<HTMLElement, { x: number; y: number }> {
  const order = p.slots.filter((_, i) => i !== p.from);
  order.splice(to, 0, p.slots[p.from]!);
  const pos = new Map<HTMLElement, { x: number; y: number }>();
  if (p.grid) {
    order.forEach((s, i) => pos.set(s.el, { x: p.slots[i]!.x, y: p.slots[i]!.y }));
  } else {
    let y = p.slots[0]!.y;
    for (const s of order) {
      pos.set(s.el, { x: s.x, y });
      y += s.h + p.gap;
    }
  }
  return pos;
}

function frame(p: Press) {
  if (press !== p || p.state !== "dragging") return;
  const dx = p.x - p.x0;
  const dy = p.y - p.y0 + (window.scrollY - p.scroll0);
  p.el.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.03)`;

  // over a drop target (e.g. a folder)?
  const over = p.drops.find((d) => {
    const top = d.rect.top - (window.scrollY - p.scroll0);
    return p.x >= d.rect.left && p.x <= d.rect.right && p.y >= top && p.y <= top + d.rect.height;
  }) ?? null;
  if (over !== p.dropOver) {
    p.dropOver?.el.classList.remove("drop-over");
    p.dropOver = over;
    if (over) {
      over.el.classList.add("drop-over");
      tickHaptic();
    }
  }

  // New index from the ORIGINAL positions, with hysteresis so a trembling
  // finger on the border never makes items jump back and forth:
  // a neighbour goes up past the dragged item when the item's BOTTOM edge
  // passes its middle, and comes back only when the item's TOP edge does.
  const me = p.slots[p.from]!;
  let to: number;
  if (p.dropOver) {
    to = p.from; // hovering a folder: the list goes back to normal
  } else if (p.grid) {
    const cx = me.x + me.w / 2 + dx;
    const cy = me.y + me.h / 2 + dy;
    const dist = (s: Slot) => Math.hypot(s.x + s.w / 2 - cx, s.y + s.h / 2 - cy);
    to = p.to;
    p.slots.forEach((s, i) => {
      if (dist(s) + Math.min(s.w, s.h) * 0.2 < dist(p.slots[to]!)) to = i;
    });
  } else {
    // a neighbour that was ABOVE swaps when the item's top edge passes its
    // middle; one that was BELOW, when the bottom edge does. Swapping back
    // needs the edge to return HYST px past the middle: no flip-flopping.
    const HYST = 10;
    const top = me.y + dy;
    const bottom = top + me.h;
    let above = 0;
    p.slots.forEach((s, i) => {
      if (i === p.from) return;
      const mid = s.y + s.h / 2;
      const k = i < p.from ? i : i - 1; // index among the others
      if (i < p.from) {
        const swapped = k >= p.to;
        const nowSwapped = swapped ? top < mid + HYST : top < mid - HYST;
        if (!nowSwapped) above++;
      } else {
        const swapped = k < p.to;
        const nowSwapped = swapped ? bottom > mid - HYST : bottom > mid + HYST;
        if (nowSwapped) above++;
      }
    });
    to = above;
  }
  if (to === p.to) return;
  p.to = to;
  tickHaptic();
  const pos = layoutFor(p, to);
  for (const s of p.slots) {
    if (s.el === p.el) continue;
    const t = pos.get(s.el)!;
    s.el.style.transform = t.x === s.x && t.y === s.y ? "" : `translate3d(${t.x - s.x}px, ${t.y - s.y}px, 0)`;
  }
}

// scroll the page when the dragged item is near the top or bottom edge
function autoScroll(p: Press) {
  const step = () => {
    if (press !== p || p.state !== "dragging") return;
    const edge = 90;
    const bottom = window.innerHeight - 130;
    const v = p.y < edge ? -(edge - p.y) / 7 : p.y > bottom ? (p.y - bottom) / 7 : 0;
    if (v) {
      window.scrollBy(0, v);
      frame(p);
    }
    p.scrollRaf = requestAnimationFrame(step);
  };
  p.scrollRaf = requestAnimationFrame(step);
}

function onUp(e: PointerEvent) {
  if (press && e.pointerId === press.pointerId) finish(true);
}

function onCancel(e: PointerEvent) {
  if (press && e.pointerId === press.pointerId) finish(false);
}

// runs after Preact has re-rendered (it renders in a microtask)
function afterRender(fn: () => void) {
  Promise.resolve().then(() => Promise.resolve()).then(fn);
}

function finish(released: boolean) {
  const p = press;
  if (!p) return;
  press = null;
  clearTimeout(p.sinkTimer);
  clearTimeout(p.holdTimer);
  cancelAnimationFrame(p.raf);
  cancelAnimationFrame(p.scrollRaf);
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", onUp);
  window.removeEventListener("pointercancel", onCancel);
  document.documentElement.classList.remove("is-dragging");
  const { el } = p;

  if (p.state === "pressing") {
    el.classList.remove("pressing");
    return; // a normal tap: let the click through
  }

  suppressClickUntil = Date.now() + 450;

  if (p.state === "held") {
    const items = released ? p.opts.current.menu?.() : undefined;
    if (items?.length) openMenu(el, items);
    el.classList.remove("held");
    return;
  }

  // ---- drag ended ----
  const sort = p.opts.current.sort!;
  const drop = released ? p.dropOver : null;
  p.dropOver?.el.classList.remove("drop-over");
  dropHaptic();

  // where everything is on screen right now
  const seen = new Map(p.slots.map((s) => [s.el, s.el.getBoundingClientRect()]));
  for (const s of p.slots) {
    s.el.style.transition = "none";
    s.el.style.transform = "";
    s.el.style.willChange = "";
  }
  el.classList.remove("dragging");

  if (drop && sort.onDrop) {
    sort.onDrop(sort.id, drop.value);
  } else if (released && p.to !== p.from) {
    const over = p.slots[p.to]!;
    sort.onReorder(sort.id, over.id, p.to > p.from);
  }

  // FLIP: from where things were seen to their new layout place
  afterRender(() => {
    for (const s of p.slots) {
      s.el.style.transition = "";
      if (!s.el.isConnected) continue;
      const was = seen.get(s.el)!;
      const now = s.el.getBoundingClientRect();
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && s.el !== el) continue;
      const scale = s.el === el ? " scale(1.03)" : "";
      s.el.animate(
        [{ transform: `translate3d(${dx}px, ${dy}px, 0)${scale}` }, { transform: "none" }],
        { duration: s.el === el ? 320 : 260, easing: "cubic-bezier(.25,.9,.3,1)" },
      );
    }
  });
}

function startPress(e: PointerEvent, el: HTMLElement, opts: { current: HoldOptions }) {
  const ev = e as PointerEvent & { holdTaken?: boolean };
  if (ev.holdTaken) return; // an inner holdable already took it
  ev.holdTaken = true;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  if (press || holdMenu.value) return;
  if (!opts.current.menu && !opts.current.sort) return;
  if ((e.target as Element).closest("input, textarea, select, [contenteditable='true'], [data-no-hold]")) return;

  const p: Press = {
    el, opts, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
    state: "pressing", sinkTimer: 0, holdTimer: 0,
    scroll0: 0, slots: [], from: 0, to: 0, grid: false, gap: 0, drops: [], dropOver: null, raf: 0, scrollRaf: 0,
  };
  press = p;
  p.sinkTimer = window.setTimeout(() => press === p && el.classList.add("pressing"), SINK_DELAY);
  p.holdTimer = window.setTimeout(() => {
    if (press !== p) return;
    p.state = "held";
    el.classList.remove("pressing");
    el.classList.add("held");
    liftHaptic();
  }, HOLD_MS);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
}

// ---------- global listeners, once ----------

export function installHoldGestures() {
  // once lifted, the finger moves the item, not the page
  document.addEventListener("touchmove", (e) => {
    if (press && press.state !== "pressing") e.preventDefault();
  }, { passive: false });
  // the release that ended a hold must not also tap the item (or the menu's
  // backdrop right under the finger); taps on menu items always go through
  document.addEventListener("click", (e) => {
    if (Date.now() < suppressClickUntil && !(e.target as Element).closest?.(".hold-menu")) {
      suppressClickUntil = 0;
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
  // no "copy / select" callout on holdable items
  document.addEventListener("contextmenu", (e) => {
    if ((e.target as Element).closest?.(".holdable")) e.preventDefault();
  });
}

// ---------- hook ----------

export function useHold<T extends HTMLElement>(options: HoldOptions) {
  const ref = useRef<T>(null);
  const opts = useRef(options);
  opts.current = options;

  // cheap: only attributes, no measuring
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.toggle("holdable", !!(options.menu || options.sort));
    if (options.sort) {
      el.dataset.sortGroup = options.sort.group;
      el.dataset.sortId = options.sort.id;
    }
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const down = (e: PointerEvent) => startPress(e, el, opts);
    el.addEventListener("pointerdown", down);
    return () => {
      el.removeEventListener("pointerdown", down);
      if (press?.el === el) finish(false);
    };
  }, []);

  return ref;
}

// ---------- menu ----------

function openMenu(el: HTMLElement, items: MenuItem[]) {
  const rect = el.getBoundingClientRect();
  const clone = el.cloneNode(true) as HTMLElement;
  clone.classList.remove("pressing", "held", "dragging", "holdable");
  clone.removeAttribute("data-sort-group");
  clone.removeAttribute("data-sort-id");
  clone.style.cssText = `width:${rect.width}px;height:${rect.height}px;margin:0;transform:none;`;
  holdMenu.value = { rect, clone, items };
}

export function closeHoldMenu() {
  holdMenu.value = null;
}

export function HoldMenuLayer() {
  const m = holdMenu.value;
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (m && host.current) host.current.replaceChildren(m.clone);
  }, [m]);
  if (!m) return null;

  const pad = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(260, vw - pad * 2);
  const menuH = m.items.length * 50 + 12;
  // keep the preview on screen; a very tall item is shifted up
  const previewTop = Math.max(pad, Math.min(m.rect.top, vh - pad - menuH - 10 - Math.min(m.rect.height, vh * 0.45)));
  const previewBottom = previewTop + Math.min(m.rect.height, vh * 0.45);
  const below = vh - previewBottom - pad >= menuH + 10;
  const menuTop = below ? previewBottom + 10 : Math.max(pad, previewTop - menuH - 10);
  const rtl = document.documentElement.dir === "rtl";
  const left = Math.max(pad, Math.min(rtl ? m.rect.right - width : m.rect.left, vw - width - pad));

  const pick = (item: MenuItem) => {
    if (item.submenu) {
      holdMenu.value = { ...m, items: item.submenu() };
      return;
    }
    closeHoldMenu();
    item.run?.();
  };

  return (
    <div class="hold-layer" onClick={(e) => e.target === e.currentTarget && closeHoldMenu()}>
      <div class="hold-preview" ref={host}
        style={{ left: m.rect.left, top: previewTop, width: m.rect.width, maxHeight: vh * 0.45 }} />
      <div class={`hold-menu ${below ? "down" : "up"}`} style={{ left, top: menuTop, width }}>
        {m.items.map((it) => (
          <button key={it.label} class={it.danger ? "danger" : ""} onClick={() => pick(it)}>
            <span>{it.label}</span>
            <Icon name={it.submenu ? "chevron" : it.icon} size={19} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- list helpers ----------

// moves `dragId` next to `overId` in an array of things with ids
export function moveById<T extends { id: string }>(list: T[], dragId: string, overId: string, after: boolean): T[] {
  return moveKey(list, (x) => x.id, dragId, overId, after);
}

export function moveKey<T>(list: T[], key: (x: T) => string, dragId: string, overId: string, after: boolean): T[] {
  const item = list.find((x) => key(x) === dragId);
  if (!item || dragId === overId) return list;
  const rest = list.filter((x) => key(x) !== dragId);
  const i = rest.findIndex((x) => key(x) === overId);
  if (i < 0) return list;
  rest.splice(after ? i + 1 : i, 0, item);
  return rest;
}
