// iPhone-style "hold" gesture for the whole app.
//
//   press        → the item sinks a little
//   hold 0.4 s   → it lifts with a light tap of vibration
//   release      → blurred background, the item and a menu next to it
//   move instead → drag: the item follows the finger, the others make room
//                  (FLIP animation), drop on a [data-drop] target is possible
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
  group: string; // items of one list share a group
  id: string;
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

const HOLD_MS = 420;
const MOVE_CANCEL = 10; // px of movement that means "scrolling", not holding
const DRAG_START = 6;   // px of movement after the lift that starts a drag

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

// ---------- FLIP: others slide to their new place ----------

const lastPos = new WeakMap<Element, { x: number; y: number }>();
const flipAnim = new WeakMap<Element, Animation>();

function flip(el: HTMLElement) {
  flipAnim.get(el)?.cancel();
  const r = el.getBoundingClientRect();
  const pos = { x: r.left + window.scrollX, y: r.top + window.scrollY };
  const prev = lastPos.get(el);
  lastPos.set(el, pos);
  if (!prev || press?.el === el) return;
  const dx = prev.x - pos.x;
  const dy = prev.y - pos.y;
  if ((dx || dy) && Math.abs(dx) < 2000 && Math.abs(dy) < 2000 && press?.state === "dragging") {
    flipAnim.set(el, el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
      { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" },
    ));
  }
}

// ---------- the one active press ----------

interface Press {
  el: HTMLElement;
  opts: { current: HoldOptions };
  pointerId: number;
  x0: number; y0: number; // where the finger went down
  x: number; y: number;   // where it is now
  state: "pressing" | "held" | "dragging";
  timer: number;
  gx: number; gy: number; // finger offset from the item's center when the drag started
  tx: number; ty: number; // current translate of the dragged item
  lastOver: string;
  dropTarget: HTMLElement | null;
  scrollRaf: number;
}

let press: Press | null = null;
let suppressClickUntil = 0;

function center(el: HTMLElement, p: Press) {
  const r = el.getBoundingClientRect();
  return { x: (r.left + r.right) / 2 - p.tx, y: (r.top + r.bottom) / 2 - p.ty };
}

// keep the dragged item under the finger, wherever its layout slot is now
function reposition(p: Press) {
  const c = center(p.el, p);
  p.tx = p.x - p.gx - c.x;
  p.ty = p.y - p.gy - c.y;
  p.el.style.transform = `translate(${p.tx}px, ${p.ty}px) scale(1.04)`;
}

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
  dragMove(p);
}

function startDrag(p: Press) {
  p.state = "dragging";
  const c = center(p.el, p);
  p.gx = p.x0 - c.x;
  p.gy = p.y0 - c.y;
  p.el.classList.remove("held");
  p.el.classList.add("dragging");
  document.documentElement.classList.add("is-dragging");
  autoScroll(p);
  dragMove(p);
}

function dragMove(p: Press) {
  reposition(p);
  const sort = p.opts.current.sort!;
  const hit = document.elementFromPoint(p.x, p.y);

  // a drop target (e.g. a folder) wins over reordering
  const drop = hit?.closest<HTMLElement>("[data-drop]") ?? null;
  if (drop !== p.dropTarget) {
    p.dropTarget?.classList.remove("drop-over");
    p.dropTarget = sort.onDrop && drop ? drop : null;
    if (p.dropTarget) {
      p.dropTarget.classList.add("drop-over");
      tickHaptic();
    }
  }
  if (p.dropTarget) return;

  const over = hit?.closest<HTMLElement>(`[data-sort-group="${sort.group}"]`);
  const overId = over?.dataset.sortId;
  if (!over || !overId || overId === sort.id) return;
  const items = [...document.querySelectorAll<HTMLElement>(`[data-sort-group="${sort.group}"]`)];
  const after = items.indexOf(over) > items.indexOf(p.el);
  const key = `${overId}:${after}`;
  if (key === p.lastOver) return;
  p.lastOver = key;
  sort.onReorder(sort.id, overId, after);
  tickHaptic();
}

// scroll the page when the dragged item is near the top or bottom edge
function autoScroll(p: Press) {
  const step = () => {
    if (press !== p || p.state !== "dragging") return;
    const edge = 90;
    const bottomEdge = window.innerHeight - 130;
    const dy = p.y < edge ? -Math.ceil((edge - p.y) / 6) : p.y > bottomEdge ? Math.ceil((p.y - bottomEdge) / 6) : 0;
    if (dy) {
      window.scrollBy(0, dy);
      reposition(p);
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

function finish(released: boolean) {
  const p = press;
  if (!p) return;
  press = null;
  clearTimeout(p.timer);
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

  suppressClickUntil = Date.now() + 500;

  if (p.state === "held") {
    const items = released ? p.opts.current.menu?.() : undefined;
    if (items?.length) openMenu(el, items);
    el.classList.remove("held");
    return;
  }

  // dragging: drop or settle into the new slot
  const sort = p.opts.current.sort!;
  const target = p.dropTarget?.dataset.drop;
  p.dropTarget?.classList.remove("drop-over");
  el.classList.remove("dragging");
  if (released && target && sort.onDrop) {
    el.style.transform = "";
    dropHaptic();
    sort.onDrop(sort.id, target);
    return;
  }
  const from = el.style.transform;
  el.style.transform = "";
  el.animate([{ transform: from }, { transform: "none" }], { duration: 200, easing: "cubic-bezier(.2,.8,.2,1)" });
  dropHaptic();
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
    state: "pressing", timer: 0, gx: 0, gy: 0, tx: 0, ty: 0, lastOver: "", dropTarget: null, scrollRaf: 0,
  };
  press = p;
  el.classList.add("pressing");
  p.timer = window.setTimeout(() => {
    if (press !== p) return;
    p.state = "held";
    el.classList.remove("pressing");
    el.classList.add("held");
    liftHaptic();
  }, HOLD_MS);
  window.addEventListener("pointermove", onMove);
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

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = !!(options.menu || options.sort);
    el.classList.toggle("holdable", on);
    if (options.sort) {
      el.dataset.sortGroup = options.sort.group;
      el.dataset.sortId = options.sort.id;
    }
    if (press?.el === el && press.state === "dragging") reposition(press);
    else flip(el);
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
  const previewBottom = previewTop + m.rect.height;
  const below = vh - previewBottom - pad >= menuH + 10;
  const menuTop = below ? previewBottom + 10 : Math.max(pad, previewTop - menuH - 10);
  const left = Math.max(pad, Math.min(m.rect.left, vw - width - pad));

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
