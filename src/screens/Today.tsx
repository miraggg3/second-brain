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
import { dayKey, newId, num, parseNum, plural, startOfWeek } from "../utils";
import { ask, Avatar, Card, Empty, Icon, Ring, type IconName } from "../ui";
import { confirmAsk, haptic, hapticOk, tgUser } from "../telegram";
import { FREE_HABITS, requirePremium } from "../premium";
import { goTab, openOverlay } from "../nav";
import { moveById, moveKey, useHold, type MenuItem } from "../gestures";
import { shareImageItem } from "../share";
import { startWorkout } from "./Gym";

export const MOODS = [
  { emoji: "😫", label: "Тяжело" },
  { emoji: "😕", label: "Так себе" },
  { emoji: "😐", label: "Нормально" },
  { emoji: "🙂", label: "Хорошо" },
  { emoji: "🤩", label: "Отлично" },
];
const GLASS = 250;
const DAY = 86_400_000;

export function setMetric(kind: MetricKind, value: number | null) {
  const t = dayKey();
  update("metrics", (m) => {
    const map = { ...m[kind] };
    if (value && value > 0) map[t] = value;
    else delete map[t];
    return { ...m, [kind]: map };
  });
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

// ---------- habits ----------

async function addHabit() {
  if (data.value.habits.length >= FREE_HABITS && !requirePremium(`Бесплатно — до ${FREE_HABITS} привычек`)) return;
  const v = await ask({
    title: "Новая привычка",
    fields: [
      { name: "name", label: "Что делаем каждый день", placeholder: "Читать 20 минут" },
      { name: "emoji", label: "Эмодзи", placeholder: "📚" },
    ],
    ok: "Добавить",
  });
  if (!v?.name) return;
  const h: Habit = { id: newId(), name: v.name.slice(0, 60), emoji: v.emoji.slice(0, 4) || "✨", created: Date.now(), done: {} };
  update("habits", (hs) => [...hs, h]);
}

function toggleHabit(id: string) {
  const t = dayKey();
  update("habits", (hs) => hs.map((h) => {
    if (h.id !== id) return h;
    const done = { ...h.done };
    if (done[t]) delete done[t];
    else { done[t] = true; hapticOk(); }
    return { ...h, done };
  }));
}

async function editHabit(h: Habit) {
  const v = await ask({
    title: "Привычка",
    fields: [
      { name: "name", label: "Название", value: h.name },
      { name: "emoji", label: "Эмодзи", value: h.emoji },
    ],
  });
  if (!v?.name) return;
  update("habits", (hs) => hs.map((x) => (x.id === h.id ? { ...x, name: v.name.slice(0, 60), emoji: v.emoji.slice(0, 4) || "✨" } : x)));
}

async function deleteHabit(h: Habit) {
  if (!(await confirmAsk(`Удалить привычку «${h.name}» вместе с историей?`))) return;
  update("habits", (hs) => hs.filter((x) => x.id !== h.id));
}

function HabitRow({ h }: { h: Habit }) {
  const done = !!h.done[dayKey()];
  const streak = habitStreak(h);
  const ref = useHold<HTMLDivElement>({
    menu: () => [
      shareImageItem(`habit:${h.id}`),
      { label: done ? "Снять отметку" : "Отметить сегодня", icon: "check", run: () => toggleHabit(h.id) },
      { label: "Изменить", icon: "edit", run: () => editHabit(h) },
      { label: "Удалить", icon: "trash", danger: true, run: () => deleteHabit(h) },
    ],
    sort: { group: "habits", id: h.id, onReorder: (a, b, after) => update("habits", (hs) => moveById(hs, a, b, after)) },
  });
  return (
    <div ref={ref} class={`habit ${done ? "done" : ""}`} data-share={`habit:${h.id}`}>
      <span class="habit-emoji">{h.emoji || "✨"}</span>
      <span class="habit-text">
        <b>{h.name}</b>
        <small>{streak > 0 ? <><Icon name="flame" size={13} /> {streak} {plural(streak, "день", "дня", "дней")} подряд</> : "начни серию сегодня"}</small>
      </span>
      <button class="check" aria-label={done ? "Снять отметку" : "Отметить"} onClick={() => toggleHabit(h.id)}><Icon name="check" size={18} stroke={3} /></button>
    </div>
  );
}

// ---------- custom trackers (premium) ----------

async function newTracker() {
  if (!requirePremium("Свои трекеры — в Premium")) return;
  const v = await ask({
    title: "Новый трекер",
    fields: [
      { name: "name", label: "Что считаем", placeholder: "Отжимания" },
      { name: "unit", label: "Единица", placeholder: "раз" },
      { name: "step", label: "Шаг кнопки «+»", type: "number", value: 1, step: "any" },
    ],
    ok: "Создать",
  });
  if (!v?.name) return;
  const t: Tracker = {
    id: newId(), name: v.name.slice(0, 40), unit: v.unit.slice(0, 12),
    step: Math.abs(parseNum(v.step) ?? 1) || 1, values: {},
  };
  update("trackers", (ts) => [...ts, t]);
  // a new tracker appears on the main screen right away
  const w = data.value.settings.widgets;
  if (w) update("settings", (s) => ({ ...s, widgets: [...w, `t:${t.id}`] }));
}

function setTrackerValue(id: string, fn: (old: number) => number) {
  const t = dayKey();
  update("trackers", (ts) => ts.map((tr) => {
    if (tr.id !== id) return tr;
    const values = { ...tr.values };
    const v = fn(values[t] ?? 0);
    if (v > 0) values[t] = v;
    else delete values[t];
    return { ...tr, values };
  }));
}

async function editTracker(tr: Tracker) {
  const v = await ask({
    title: tr.name,
    fields: [{ name: "value", label: "Сегодня", type: "number", step: "any", value: tr.values[dayKey()] ?? "", suffix: tr.unit }],
  });
  if (v) setTrackerValue(tr.id, () => parseNum(v.value) ?? 0);
}

async function deleteTracker(tr: Tracker) {
  if (!(await confirmAsk(`Удалить трекер «${tr.name}» и его историю?`))) return;
  update("trackers", (ts) => ts.filter((x) => x.id !== tr.id));
  const w = data.value.settings.widgets;
  if (w) update("settings", (s) => ({ ...s, widgets: w.filter((x) => x !== `t:${tr.id}`) }));
}

// ---------- widgets ----------

const BUILTIN = ["water", "sleep", "weight", "mood"] as const;
const BUILTIN_INFO: Record<string, { name: string; icon: IconName; color: string }> = {
  water: { name: "Вода", icon: "drop", color: "var(--c-water)" },
  sleep: { name: "Сон", icon: "moon", color: "var(--c-sleep)" },
  weight: { name: "Вес", icon: "scale", color: "var(--c-weight)" },
  mood: { name: "Настроение", icon: "smile", color: "var(--c-mood)" },
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
    return { name: tr?.name ?? "Трекер", icon: "sparkle", color: "var(--accent)" };
  }
  return BUILTIN_INFO[id]!;
}

const widgetEditing = signal(false);
const widgetPicker = signal(false);

async function editMetric(kind: "sleep" | "weight") {
  const cur = data.value.metrics[kind][dayKey()];
  const v = await ask({
    title: kind === "sleep" ? "Сколько спал?" : "Вес сегодня",
    fields: [{
      name: "v", label: kind === "sleep" ? "Часы сна" : "Вес", type: "number", step: "0.1",
      value: cur ?? "", placeholder: kind === "sleep" ? "8" : String(lastValue(data.value.metrics.weight) ?? 70),
      suffix: kind === "sleep" ? "ч" : "кг",
    }],
  });
  if (v) setMetric(kind, parseNum(v.v));
}

function WaterTile() {
  const water = data.value.metrics.water[dayKey()] ?? 0;
  const goal = data.value.settings.waterGoal || 2000;
  return (
    <div class="tile water" data-share="metric:water">
      <div class="tile-head"><span class="tile-ico"><Icon name="drop" size={18} /></span>Вода</div>
      <div class="tile-value">{num(water / 1000, 2)}<small> / {num(goal / 1000, 1)} л</small></div>
      <div class="bar-line"><i style={{ width: `${Math.min(100, (water / goal) * 100)}%` }} /></div>
      <div class="tile-actions">
        <button aria-label="Минус стакан" onClick={() => { haptic(); setMetric("water", Math.max(0, water - GLASS)); }}><Icon name="minus" size={16} /></button>
        <button class="primary" onClick={() => { haptic(); setMetric("water", water + GLASS); }}><Icon name="plus" size={15} />250 мл</button>
      </div>
    </div>
  );
}

function SleepTile() {
  const sleep = data.value.metrics.sleep[dayKey()];
  return (
    <button class="tile sleep" data-share="metric:sleep" onClick={() => editMetric("sleep")}>
      <div class="tile-head"><span class="tile-ico"><Icon name="moon" size={18} /></span>Сон</div>
      <div class="tile-value">{sleep != null ? num(sleep) : "—"}<small> ч</small></div>
      <small class="tile-note">{sleep == null ? "нажми, чтобы внести" : sleep >= 7 ? "отличный сон" : "маловато"}</small>
    </button>
  );
}

function WeightTile() {
  const m = data.value.metrics;
  const t = dayKey();
  const weight = m.weight[t];
  const prevKey = Object.keys(m.weight).sort().filter((k) => k < t).pop();
  const delta = weight != null && prevKey ? weight - m.weight[prevKey]! : null;
  return (
    <button class="tile weight" data-share="metric:weight" onClick={() => editMetric("weight")}>
      <div class="tile-head"><span class="tile-ico"><Icon name="scale" size={18} /></span>Вес</div>
      <div class="tile-value">{weight != null ? num(weight) : "—"}<small> кг</small></div>
      <small class="tile-note">
        {delta != null && delta !== 0 ? `${delta > 0 ? "+" : "−"}${num(Math.abs(delta))} кг с прошлого раза` : weight == null ? "нажми, чтобы внести" : "без изменений"}
      </small>
    </button>
  );
}

function MoodTile() {
  const mood = data.value.metrics.mood[dayKey()] ?? 0;
  return (
    <div class="tile mood" data-share="metric:mood">
      <div class="tile-head"><span class="tile-ico"><Icon name="smile" size={18} /></span>Настроение</div>
      <div class="tile-value small">{mood ? MOODS[mood - 1]!.label : "Как ты?"}</div>
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
      <small class="tile-note">сегодня</small>
      <div class="tile-actions">
        <button aria-label="Ввести значение" onClick={() => editTracker(tr)}><Icon name="edit" size={15} /></button>
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
        { label: "Убрать с экрана", icon: "eyeOff", run: () => hideWidget(id) },
        { label: "Изменить виджеты", icon: "grid", run: () => (widgetEditing.value = true) },
      ];
      if (tracker) items.push({ label: "Удалить трекер", icon: "trash", danger: true, run: () => deleteTracker(tracker) });
      return items;
    },
    sort: { group: "widgets", id, onReorder: reorderWidgets },
  });
  return (
    <div ref={ref} class={`widget ${editing ? "jiggle" : ""}`}>
      {editing && (
        <button class="widget-remove" data-no-hold aria-label="Убрать" onClick={() => hideWidget(id)}>
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
        <h3>Добавить виджет</h3>
        <div class="picker-list">
          {hidden.map((id) => {
            const info = widgetInfo(id);
            return (
              <button key={id} class="picker-item" onClick={() => { addWidget(id); if (hidden.length === 1) close(); }}>
                <span class="row-ico" style={{ background: info.color }}><Icon name={info.icon} size={19} /></span>
                <b class="grow">{info.name}</b>
                <span class="pill-btn"><Icon name="plus" size={14} /> Добавить</span>
              </button>
            );
          })}
          <button class="picker-item" onClick={() => { close(); newTracker(); }}>
            <span class="row-ico" style={{ background: "var(--accent)" }}><Icon name="sparkle" size={19} /></span>
            <span class="grow"><b>Новый трекер</b><small class="muted"> шаги, страницы, отжимания…</small></span>
            {!isPremium.value && <span class="badge-pro">PRO</span>}
          </button>
        </div>
        {!hidden.length && <p class="muted small center">Все виджеты уже на экране</p>}
        <button class="btn block ghost" onClick={close}>Готово</button>
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
        <h2 class="section-title">Тело</h2>
        <button class="text-btn" onClick={() => { haptic(); widgetEditing.value = !editing; }}>
          {editing ? "Готово" : "Изменить"}
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
            <span>Добавить виджет</span>
          </button>
        )}
      </div>
      {editing && <p class="footnote center">Перетаскивай виджеты, чтобы поменять порядок. «−» убирает с экрана.</p>}
      <WidgetPicker />
    </>
  );
}

// ---------- day card ----------

function DayHero() {
  const d = data.value;
  const t = dayKey();
  const habitsDone = d.habits.filter((h) => h.done[t]).length;
  const water = d.metrics.water[t] ?? 0;
  const goal = d.settings.waterGoal || 2000;
  const sleep = d.metrics.sleep[t] ?? 0;
  const ref = useHold<HTMLElement>({ menu: () => [shareImageItem("day")] });
  return (
    <section ref={ref} class="hero" data-share="day">
      <div class="hero-ring">
        <Ring value={d.habits.length ? habitsDone / d.habits.length : 0} color="var(--on-accent)" size={74} stroke={8}>
          <b>{habitsDone}/{d.habits.length}</b>
        </Ring>
        <span>Привычки</span>
      </div>
      <div class="hero-ring">
        <Ring value={water / goal} color="var(--on-accent)" size={74} stroke={8}>
          <b>{Math.round((water / goal) * 100)}%</b>
        </Ring>
        <span>Вода</span>
      </div>
      <div class="hero-ring">
        <Ring value={sleep / 8} color="var(--on-accent)" size={74} stroke={8}>
          <b>{sleep ? num(sleep) : "—"}</b>
        </Ring>
        <span>Сон, ч</span>
      </div>
    </section>
  );
}

// ---------- screen ----------

export function Today() {
  const d = data.value;
  const name = tgUser?.first_name ?? "друг";
  const active = activeWorkout(d.workouts);
  const week = workoutsSince(d.workouts, startOfWeek()).length;
  const streak = weekStreak(d.workouts);
  const hasData = d.notes.length + d.workouts.length + d.habits.length > 0;
  const backupOld = hasData && Date.now() - d.settings.lastBackup > 14 * DAY;

  return (
    <>
      <header class="hello">
        <button class="hello-avatar" onClick={() => goTab("profile")} aria-label="Профиль">
          <Avatar name={tgUser ? `${tgUser.first_name} ${tgUser.last_name ?? ""}` : "Гость"} photo={tgUser?.photo_url}
            seed={tgUser?.id ?? 0} size={46} ring={isPremium.value} />
        </button>
        <div class="grow">
          <p class="eyebrow">{new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1>{greeting()}, {name}</h1>
        </div>
      </header>

      <DayHero />

      {backupOld && (
        <button class="banner" onClick={() => openOverlay({ name: "data" })}>
          <span class="banner-ico"><Icon name="shield" size={20} /></span>
          <span class="grow"><b>Сохрани копию данных</b><small>Записи живут только на этом устройстве</small></span>
          <Icon name="chevron" size={18} />
        </button>
      )}

      <Card title="Привычки">
        {d.habits.map((h) => <HabitRow key={h.id} h={h} />)}
        {!d.habits.length && <Empty icon="flame">Добавь то, что хочешь делать каждый день, и отмечай — серия будет расти.</Empty>}
        <button class="add-row" onClick={addHabit}><Icon name="plus" size={18} /> Новая привычка</button>
      </Card>

      <BodyWidgets />

      <button class="gym-banner" onClick={() => { if (!active) startWorkout(); goTab("gym"); }}>
        <span class="gym-ico"><Icon name="gym" size={26} /></span>
        <span class="grow">
          <b>{active ? "Тренировка идёт" : "Пора в зал?"}</b>
          <small>{week} {plural(week, "тренировка", "тренировки", "тренировок")} на неделе{streak ? ` · ${streak} нед. подряд` : ""}</small>
        </span>
        <span class="pill-btn">{active ? "Открыть" : "Начать"}</span>
      </button>
    </>
  );
}
