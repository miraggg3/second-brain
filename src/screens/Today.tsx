// "Сегодня": greeting, daily rings, habits, body widgets, gym.
//
// Habits and widgets are held (menu) and dragged (order). The "Тело" grid is
// set up like phone widgets: choose which tiles are shown and in what order;
// custom trackers are widgets too.

import { signal } from "@preact/signals";
import { createPortal } from "preact/compat";
import type { ComponentChildren } from "preact";
import { data, isPremium, update } from "../store";
import type { Habit, MetricKind, Tracker } from "../types";
import { activeWorkout, habitStreak, lastValue, weekStreak, workoutsSince } from "../domain";
import { dayKey, newId, num, parseNum, startOfWeek } from "../utils";
import { locale, t } from "../i18n";
import { ask, Avatar, Card, Empty, Icon, Ring, type IconName } from "../ui";
import { confirmAsk, haptic, hapticOk, tgUser } from "../telegram";
import { FREE_HABITS, requirePremium } from "../premium";
import { goTab, openOverlay } from "../nav";
import { moveById, moveKey, useHold, type MenuItem } from "../gestures";
import { shareImageItem } from "../share";
import { startWorkout } from "./Gym";

export const MOODS = [
  { emoji: "😫", get label() { return t("today.mood1"); } },
  { emoji: "😕", get label() { return t("today.mood2"); } },
  { emoji: "😐", get label() { return t("today.mood3"); } },
  { emoji: "🙂", get label() { return t("today.mood4"); } },
  { emoji: "🤩", get label() { return t("today.mood5"); } },
];
const GLASS = 250;
const DAY = 86_400_000;

export function setMetric(kind: MetricKind, value: number | null) {
  const today = dayKey();
  update("metrics", (m) => {
    const map = { ...m[kind] };
    if (value && value > 0) map[today] = value;
    else delete map[today];
    return { ...m, [kind]: map };
  });
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return t("today.greetingNight");
  if (h < 12) return t("today.greetingMorning");
  if (h < 18) return t("today.greetingDay");
  return t("today.greetingEvening");
}

// ---------- habits ----------

async function addHabit() {
  if (data.value.habits.length >= FREE_HABITS && !requirePremium(t("today.freeHabitsLimit", { n: FREE_HABITS }))) return;
  const v = await ask({
    title: t("today.newHabit"),
    fields: [
      { name: "name", label: t("today.habitNameLabel"), placeholder: t("today.habitNamePlaceholder") },
      { name: "emoji", label: t("today.emoji"), placeholder: "📚" },
    ],
    ok: t("common.add"),
  });
  if (!v?.name) return;
  const h: Habit = { id: newId(), name: v.name.slice(0, 60), emoji: v.emoji.slice(0, 4) || "✨", created: Date.now(), done: {} };
  update("habits", (hs) => [...hs, h]);
}

function toggleHabit(id: string) {
  const today = dayKey();
  update("habits", (hs) => hs.map((h) => {
    if (h.id !== id) return h;
    const done = { ...h.done };
    if (done[today]) delete done[today];
    else { done[today] = true; hapticOk(); }
    return { ...h, done };
  }));
}

async function editHabit(h: Habit) {
  const v = await ask({
    title: t("today.habit"),
    fields: [
      { name: "name", label: t("common.name"), value: h.name },
      { name: "emoji", label: t("today.emoji"), value: h.emoji },
    ],
  });
  if (!v?.name) return;
  update("habits", (hs) => hs.map((x) => (x.id === h.id ? { ...x, name: v.name.slice(0, 60), emoji: v.emoji.slice(0, 4) || "✨" } : x)));
}

async function deleteHabit(h: Habit) {
  if (!(await confirmAsk(t("today.deleteHabitConfirm", { name: h.name })))) return;
  update("habits", (hs) => hs.filter((x) => x.id !== h.id));
}

function HabitRow({ h }: { h: Habit }) {
  const done = !!h.done[dayKey()];
  const streak = habitStreak(h);
  const ref = useHold<HTMLDivElement>({
    menu: () => [
      shareImageItem(`habit:${h.id}`),
      { label: done ? t("today.uncheck") : t("today.checkToday"), icon: "check", run: () => toggleHabit(h.id) },
      { label: t("common.edit"), icon: "edit", run: () => editHabit(h) },
      { label: t("common.delete"), icon: "trash", danger: true, run: () => deleteHabit(h) },
    ],
    sort: { group: "habits", id: h.id, onReorder: (a, b, after) => update("habits", (hs) => moveById(hs, a, b, after)) },
  });
  return (
    <div ref={ref} class={`habit ${done ? "done" : ""}`} data-share={`habit:${h.id}`}>
      <span class="habit-emoji">{h.emoji || "✨"}</span>
      <span class="habit-text">
        <b>{h.name}</b>
        <small>{streak > 0 ? <><Icon name="flame" size={13} /> {t("today.habitStreak", { n: streak })}</> : t("today.startStreak")}</small>
      </span>
      <button class="check" aria-label={done ? t("today.uncheck") : t("today.check")} onClick={() => toggleHabit(h.id)}><Icon name="check" size={18} stroke={3} /></button>
    </div>
  );
}

// ---------- custom trackers (premium) ----------

async function newTracker() {
  if (!requirePremium(t("today.trackersPremium"))) return;
  const v = await ask({
    title: t("today.newTracker"),
    fields: [
      { name: "name", label: t("today.trackerNameLabel"), placeholder: t("today.trackerNamePlaceholder") },
      { name: "unit", label: t("today.trackerUnitLabel"), placeholder: t("today.trackerUnitPlaceholder") },
      { name: "step", label: t("today.trackerStepLabel"), type: "number", value: 1, step: "any" },
    ],
    ok: t("common.create"),
  });
  if (!v?.name) return;
  const tr: Tracker = {
    id: newId(), name: v.name.slice(0, 40), unit: v.unit.slice(0, 12),
    step: Math.abs(parseNum(v.step) ?? 1) || 1, values: {},
  };
  update("trackers", (ts) => [...ts, tr]);
  // a new tracker appears on the main screen right away
  const w = data.value.settings.widgets;
  if (w) update("settings", (s) => ({ ...s, widgets: [...w, `t:${tr.id}`] }));
}

function setTrackerValue(id: string, fn: (old: number) => number) {
  const today = dayKey();
  update("trackers", (ts) => ts.map((tr) => {
    if (tr.id !== id) return tr;
    const values = { ...tr.values };
    const v = fn(values[today] ?? 0);
    if (v > 0) values[today] = v;
    else delete values[today];
    return { ...tr, values };
  }));
}

async function editTracker(tr: Tracker) {
  const v = await ask({
    title: tr.name,
    fields: [{ name: "value", label: t("tab.today"), type: "number", step: "any", value: tr.values[dayKey()] ?? "", suffix: tr.unit }],
  });
  if (v) setTrackerValue(tr.id, () => parseNum(v.value) ?? 0);
}

async function deleteTracker(tr: Tracker) {
  if (!(await confirmAsk(t("today.deleteTrackerConfirm", { name: tr.name })))) return;
  update("trackers", (ts) => ts.filter((x) => x.id !== tr.id));
  const w = data.value.settings.widgets;
  if (w) update("settings", (s) => ({ ...s, widgets: w.filter((x) => x !== `t:${tr.id}`) }));
}

// ---------- widgets ----------

const BUILTIN = ["water", "sleep", "weight", "mood"] as const;
const BUILTIN_INFO: Record<string, { name: () => string; icon: IconName; color: string }> = {
  water: { name: () => t("today.water"), icon: "drop", color: "var(--c-water)" },
  sleep: { name: () => t("today.sleep"), icon: "moon", color: "var(--c-sleep)" },
  weight: { name: () => t("today.weight"), icon: "scale", color: "var(--c-weight)" },
  mood: { name: () => t("today.mood"), icon: "smile", color: "var(--c-mood)" },
};

// tiles that can be on the screen, in the order the user chose
function allWidgets(): string[] {
  return [...BUILTIN, ...data.value.trackers.map((t) => `t:${t.id}`)];
}

function shownWidgets(): string[] {
  const all = allWidgets();
  const chosen = data.value.settings.widgets;
  return chosen ? chosen.filter((id) => all.includes(id)) : all;
}

const setWidgets = (widgets: string[]) => update("settings", (s) => ({ ...s, widgets }));

function hideWidget(id: string) {
  haptic();
  setWidgets(shownWidgets().filter((x) => x !== id));
}

function addWidget(id: string) {
  hapticOk();
  setWidgets([...shownWidgets(), id]);
}

function reorderWidgets(dragId: string, overId: string, after: boolean) {
  setWidgets(moveKey(shownWidgets(), (x) => x, dragId, overId, after));
}

function widgetInfo(id: string): { name: string; icon: IconName; color: string } {
  if (id.startsWith("t:")) {
    const tr = data.value.trackers.find((t) => `t:${t.id}` === id);
    return { name: tr?.name ?? t("today.tracker"), icon: "sparkle", color: "var(--accent)" };
  }
  const info = BUILTIN_INFO[id]!;
  return { ...info, name: info.name() };
}

const widgetEditing = signal(false);
const widgetPicker = signal(false);

async function editMetric(kind: "sleep" | "weight") {
  const cur = data.value.metrics[kind][dayKey()];
  const v = await ask({
    title: kind === "sleep" ? t("today.sleepTitle") : t("today.weightTitle"),
    fields: [{
      name: "v", label: kind === "sleep" ? t("today.sleepLabel") : t("today.weight"), type: "number", step: "0.1",
      value: cur ?? "", placeholder: kind === "sleep" ? "8" : String(lastValue(data.value.metrics.weight) ?? 70),
      suffix: kind === "sleep" ? t("unit.h") : t("unit.kg"),
    }],
  });
  if (v) setMetric(kind, parseNum(v.v));
}

function WaterTile() {
  const water = data.value.metrics.water[dayKey()] ?? 0;
  const goal = data.value.settings.waterGoal || 2000;
  return (
    <div class="tile water" data-share="metric:water">
      <div class="tile-head"><span class="tile-ico"><Icon name="drop" size={18} /></span>{t("today.water")}</div>
      <div class="tile-value">{num(water / 1000, 2)}<small> / {num(goal / 1000, 1)} {t("unit.l")}</small></div>
      <div class="bar-line"><i style={{ width: `${Math.min(100, (water / goal) * 100)}%` }} /></div>
      <div class="tile-actions">
        <button aria-label={t("today.minusGlass")} onClick={() => { haptic(); setMetric("water", Math.max(0, water - GLASS)); }}><Icon name="minus" size={16} /></button>
        <button class="primary" onClick={() => { haptic(); setMetric("water", water + GLASS); }}><Icon name="plus" size={15} />{GLASS} {t("unit.ml")}</button>
      </div>
    </div>
  );
}

function SleepTile() {
  const sleep = data.value.metrics.sleep[dayKey()];
  return (
    <button class="tile sleep" data-share="metric:sleep" onClick={() => editMetric("sleep")}>
      <div class="tile-head"><span class="tile-ico"><Icon name="moon" size={18} /></span>{t("today.sleep")}</div>
      <div class="tile-value">{sleep != null ? num(sleep) : "—"}<small> {t("unit.h")}</small></div>
      <small class="tile-note">{sleep == null ? t("today.tapToEnter") : sleep >= 7 ? t("today.sleepGreat") : t("today.sleepLow")}</small>
    </button>
  );
}

function WeightTile() {
  const m = data.value.metrics;
  const today = dayKey();
  const weight = m.weight[today];
  const prevKey = Object.keys(m.weight).sort().filter((k) => k < today).pop();
  const delta = weight != null && prevKey ? weight - m.weight[prevKey]! : null;
  return (
    <button class="tile weight" data-share="metric:weight" onClick={() => editMetric("weight")}>
      <div class="tile-head"><span class="tile-ico"><Icon name="scale" size={18} /></span>{t("today.weight")}</div>
      <div class="tile-value">{weight != null ? num(weight) : "—"}<small> {t("unit.kg")}</small></div>
      <small class="tile-note">
        {delta != null && delta !== 0 ? t("today.weightDelta", { delta: `${delta > 0 ? "+" : "−"}${num(Math.abs(delta))}` }) : weight == null ? t("today.tapToEnter") : t("today.noChange")}
      </small>
    </button>
  );
}

function MoodTile() {
  const mood = data.value.metrics.mood[dayKey()] ?? 0;
  return (
    <div class="tile mood" data-share="metric:mood">
      <div class="tile-head"><span class="tile-ico"><Icon name="smile" size={18} /></span>{t("today.mood")}</div>
      <div class="tile-value small">{mood ? MOODS[mood - 1]!.label : t("today.howAreYou")}</div>
      <div class="moods">
        {MOODS.map((md, i) => (
          <button key={md.label} class={mood === i + 1 ? "on" : ""} aria-label={md.label}
            onClick={() => { haptic(); setMetric("mood", mood === i + 1 ? null : i + 1); }}>{md.emoji}</button>
        ))}
      </div>
    </div>
  );
}

function TrackerTile({ tr }: { tr: Tracker }) {
  const v = tr.values[dayKey()] ?? 0;
  return (
    <div class="tile tracker-tile" data-share={`tracker:${tr.id}`}>
      <div class="tile-head"><span class="tile-ico"><Icon name="sparkle" size={18} /></span><span class="tile-name">{tr.name}</span></div>
      <div class="tile-value">{num(v)}<small> {tr.unit}</small></div>
      <small class="tile-note">{t("common.today")}</small>
      <div class="tile-actions">
        <button aria-label={t("today.enterValue")} onClick={() => editTracker(tr)}><Icon name="edit" size={15} /></button>
        <button class="primary" onClick={() => { haptic(); setTrackerValue(tr.id, (x) => x + tr.step); }}><Icon name="plus" size={15} />{num(tr.step)}</button>
      </div>
    </div>
  );
}

function shareKeyOf(id: string): string {
  return id.startsWith("t:") ? `tracker:${id.slice(2)}` : `metric:${id}`;
}

function WidgetSlot({ id, children }: { id: string; children: ComponentChildren }) {
  const editing = widgetEditing.value;
  const tracker = id.startsWith("t:") ? data.value.trackers.find((t) => `t:${t.id}` === id) : undefined;
  const ref = useHold<HTMLDivElement>({
    menu: () => {
      const items: MenuItem[] = [
        shareImageItem(shareKeyOf(id)),
        { label: t("today.hideWidget"), icon: "eyeOff", run: () => hideWidget(id) },
        { label: t("today.editWidgets"), icon: "grid", run: () => (widgetEditing.value = true) },
      ];
      if (tracker) items.push({ label: t("today.deleteTracker"), icon: "trash", danger: true, run: () => deleteTracker(tracker) });
      return items;
    },
    sort: { group: "widgets", id, onReorder: reorderWidgets },
  });
  return (
    <div ref={ref} class={`widget ${editing ? "jiggle" : ""}`}>
      {editing && (
        <button class="widget-remove" data-no-hold aria-label={t("today.remove")} onClick={() => hideWidget(id)}>
          <Icon name="minus" size={16} stroke={3} />
        </button>
      )}
      <div class="widget-body">{children}</div>
    </div>
  );
}

function WidgetPicker() {
  if (!widgetPicker.value) return null;
  const shown = shownWidgets();
  const hidden = allWidgets().filter((id) => !shown.includes(id));
  const close = () => (widgetPicker.value = false);
  return createPortal(
    <div class="sheet-bg" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="sheet picker">
        <div class="sheet-grip" />
        <h3>{t("today.addWidget")}</h3>
        <div class="picker-list">
          {hidden.map((id) => {
            const info = widgetInfo(id);
            return (
              <button key={id} class="picker-item" onClick={() => { addWidget(id); if (hidden.length === 1) close(); }}>
                <span class="row-ico" style={{ background: info.color }}><Icon name={info.icon} size={19} /></span>
                <b class="grow">{info.name}</b>
                <span class="pill-btn"><Icon name="plus" size={14} /> {t("common.add")}</span>
              </button>
            );
          })}
          <button class="picker-item" onClick={() => { close(); newTracker(); }}>
            <span class="row-ico" style={{ background: "var(--accent)" }}><Icon name="sparkle" size={19} /></span>
            <span class="grow"><b>{t("today.newTracker")}</b><small class="muted"> {t("today.newTrackerHint")}</small></span>
            {!isPremium.value && <span class="badge-pro">{t("common.pro")}</span>}
          </button>
        </div>
        {!hidden.length && <p class="muted small center">{t("today.allWidgetsShown")}</p>}
        <button class="btn block ghost" onClick={close}>{t("common.done")}</button>
      </div>
    </div>,
    document.body,
  );
}

function BodyWidgets() {
  const editing = widgetEditing.value;
  const shown = shownWidgets();
  return (
    <>
      <div class="section-row">
        <h2 class="section-title">{t("today.body")}</h2>
        <button class="text-btn" onClick={() => { haptic(); widgetEditing.value = !editing; }}>
          {editing ? t("common.done") : t("common.edit")}
        </button>
      </div>
      <div class={`tiles ${editing ? "editing" : ""}`}>
        {shown.map((id) => {
          let tile: ComponentChildren = null;
          if (id === "water") tile = <WaterTile />;
          else if (id === "sleep") tile = <SleepTile />;
          else if (id === "weight") tile = <WeightTile />;
          else if (id === "mood") tile = <MoodTile />;
          else {
            const tr = data.value.trackers.find((t) => `t:${t.id}` === id);
            if (tr) tile = <TrackerTile tr={tr} />;
          }
          return tile && <WidgetSlot key={id} id={id}>{tile}</WidgetSlot>;
        })}
        {(editing || !shown.length) && (
          <button class="tile add-tile" onClick={() => (widgetPicker.value = true)}>
            <Icon name="plus" size={26} />
            <span>{t("today.addWidget")}</span>
          </button>
        )}
      </div>
      {editing && <p class="footnote center">{t("today.widgetsHint")}</p>}
      <WidgetPicker />
    </>
  );
}

// ---------- day card ----------

function DayHero() {
  const d = data.value;
  const today = dayKey();
  const habitsDone = d.habits.filter((h) => h.done[today]).length;
  const water = d.metrics.water[today] ?? 0;
  const goal = d.settings.waterGoal || 2000;
  const sleep = d.metrics.sleep[today] ?? 0;
  const ref = useHold<HTMLElement>({ menu: () => [shareImageItem("day")] });
  return (
    <section ref={ref} class="hero" data-share="day">
      <div class="hero-ring">
        <Ring value={d.habits.length ? habitsDone / d.habits.length : 0} color="var(--on-accent)" size={74} stroke={8}>
          <b>{habitsDone}/{d.habits.length}</b>
        </Ring>
        <span>{t("today.habits")}</span>
      </div>
      <div class="hero-ring">
        <Ring value={water / goal} color="var(--on-accent)" size={74} stroke={8}>
          <b>{Math.round((water / goal) * 100)}%</b>
        </Ring>
        <span>{t("today.water")}</span>
      </div>
      <div class="hero-ring">
        <Ring value={sleep / 8} color="var(--on-accent)" size={74} stroke={8}>
          <b>{sleep ? num(sleep) : "—"}</b>
        </Ring>
        <span>{t("today.sleepHours")}</span>
      </div>
    </section>
  );
}

// ---------- screen ----------

export function Today() {
  const d = data.value;
  const name = tgUser?.first_name ?? t("common.friend");
  const active = activeWorkout(d.workouts);
  const week = workoutsSince(d.workouts, startOfWeek()).length;
  const streak = weekStreak(d.workouts);
  const hasData = d.notes.length + d.workouts.length + d.habits.length > 0;
  const backupOld = hasData && Date.now() - d.settings.lastBackup > 14 * DAY;

  return (
    <>
      <header class="hello">
        <button class="hello-avatar" onClick={() => goTab("profile")} aria-label={t("tab.profile")}>
          <Avatar name={tgUser ? `${tgUser.first_name} ${tgUser.last_name ?? ""}` : t("common.guest")} photo={tgUser?.photo_url}
            seed={tgUser?.id ?? 0} size={46} ring={isPremium.value} />
        </button>
        <div class="grow">
          <p class="eyebrow">{new Date().toLocaleDateString(locale.value, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1>{t("today.greetingName", { greeting: greeting(), name })}</h1>
        </div>
      </header>

      <DayHero />

      {backupOld && (
        <button class="banner" onClick={() => openOverlay({ name: "data" })}>
          <span class="banner-ico"><Icon name="shield" size={20} /></span>
          <span class="grow"><b>{t("today.backupTitle")}</b><small>{t("today.backupHint")}</small></span>
          <Icon name="chevron" size={18} />
        </button>
      )}

      <Card title={t("today.habits")}>
        {d.habits.map((h) => <HabitRow key={h.id} h={h} />)}
        {!d.habits.length && <Empty icon="flame">{t("today.habitsEmpty")}</Empty>}
        <button class="add-row" onClick={addHabit}><Icon name="plus" size={18} /> {t("today.newHabit")}</button>
      </Card>

      <BodyWidgets />

      <button class="gym-banner" onClick={() => { if (!active) startWorkout(); goTab("gym"); }}>
        <span class="gym-ico"><Icon name="gym" size={26} /></span>
        <span class="grow">
          <b>{active ? t("today.workoutInProgress") : t("today.gymTime")}</b>
          <small>{t("today.workoutsThisWeek", { n: week })}{streak ? ` · ${t("today.weeksInRow", { n: streak })}` : ""}</small>
        </span>
        <span class="pill-btn">{active ? t("today.open") : t("today.start")}</span>
      </button>
    </>
  );
}
