// "Сегодня": greeting, daily rings, habits, body metrics, custom trackers, gym.

import { useState } from "preact/hooks";
import { data, isPremium, update } from "../store";
import type { Habit, MetricKind, Tracker } from "../types";
import { activeWorkout, habitStreak, lastValue, weekStreak, workoutsSince } from "../domain";
import { dayKey, newId, num, parseNum, plural, startOfWeek } from "../utils";
import { ask, Avatar, Card, Empty, Icon, Ring } from "../ui";
import { confirmAsk, haptic, hapticOk, tgUser } from "../telegram";
import { FREE_HABITS, requirePremium } from "../premium";
import { goTab, openOverlay } from "../nav";
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

async function deleteHabit(h: Habit) {
  if (!(await confirmAsk(`Удалить привычку «${h.name}» вместе с историей?`))) return;
  update("habits", (hs) => hs.filter((x) => x.id !== h.id));
}

function HabitRow({ h, editing }: { h: Habit; editing: boolean }) {
  const done = !!h.done[dayKey()];
  const streak = habitStreak(h);
  return (
    <div class={`habit ${done ? "done" : ""}`}>
      <span class="habit-emoji">{h.emoji || "✨"}</span>
      <span class="habit-text">
        <b>{h.name}</b>
        <small>{streak > 0 ? <><Icon name="flame" size={13} /> {streak} {plural(streak, "день", "дня", "дней")} подряд</> : "начни серию сегодня"}</small>
      </span>
      {editing
        ? <button class="icon-btn danger" aria-label="Удалить" onClick={() => deleteHabit(h)}><Icon name="trash" size={19} /></button>
        : <button class="check" aria-label={done ? "Снять отметку" : "Отметить"} onClick={() => toggleHabit(h.id)}><Icon name="check" size={18} stroke={3} /></button>}
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
}

// ---------- metric tiles ----------

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

function MetricTiles() {
  const m = data.value.metrics;
  const t = dayKey();
  const water = m.water[t] ?? 0;
  const goal = data.value.settings.waterGoal || 2000;
  const sleep = m.sleep[t];
  const weight = m.weight[t];
  const weights = Object.keys(m.weight).sort();
  const prevKey = weights.filter((k) => k < t).pop();
  const delta = weight != null && prevKey ? weight - m.weight[prevKey]! : null;
  const mood = m.mood[t] ?? 0;

  return (
    <div class="tiles">
      <div class="tile water">
        <div class="tile-head"><span class="tile-ico"><Icon name="drop" size={18} /></span>Вода</div>
        <div class="tile-value">{num(water / 1000, 2)}<small> / {num(goal / 1000, 1)} л</small></div>
        <div class="bar-line"><i style={{ width: `${Math.min(100, (water / goal) * 100)}%` }} /></div>
        <div class="tile-actions">
          <button aria-label="Минус стакан" onClick={() => { haptic(); setMetric("water", Math.max(0, water - GLASS)); }}><Icon name="minus" size={16} /></button>
          <button class="primary" onClick={() => { haptic(); setMetric("water", water + GLASS); }}><Icon name="plus" size={15} />250 мл</button>
        </div>
      </div>

      <button class="tile sleep" onClick={() => editMetric("sleep")}>
        <div class="tile-head"><span class="tile-ico"><Icon name="moon" size={18} /></span>Сон</div>
        <div class="tile-value">{sleep != null ? num(sleep) : "—"}<small> ч</small></div>
        <small class="tile-note">{sleep == null ? "нажми, чтобы внести" : sleep >= 7 ? "отличный сон" : "маловато"}</small>
      </button>

      <button class="tile weight" onClick={() => editMetric("weight")}>
        <div class="tile-head"><span class="tile-ico"><Icon name="scale" size={18} /></span>Вес</div>
        <div class="tile-value">{weight != null ? num(weight) : "—"}<small> кг</small></div>
        <small class="tile-note">
          {delta != null && delta !== 0 ? `${delta > 0 ? "+" : "−"}${num(Math.abs(delta))} кг с прошлого раза` : weight == null ? "нажми, чтобы внести" : "без изменений"}
        </small>
      </button>

      <div class="tile mood">
        <div class="tile-head"><span class="tile-ico"><Icon name="smile" size={18} /></span>Настроение</div>
        <div class="tile-value small">{mood ? MOODS[mood - 1]!.label : "Как ты?"}</div>
        <div class="moods">
          {MOODS.map((md, i) => (
            <button key={md.label} class={mood === i + 1 ? "on" : ""} aria-label={md.label}
              onClick={() => { haptic(); setMetric("mood", mood === i + 1 ? null : i + 1); }}>{md.emoji}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- screen ----------

export function Today() {
  const d = data.value;
  const t = dayKey();
  const [editHabits, setEditHabits] = useState(false);
  const [editTrackers, setEditTrackers] = useState(false);
  const name = tgUser?.first_name ?? "друг";
  const habitsDone = d.habits.filter((h) => h.done[t]).length;
  const water = d.metrics.water[t] ?? 0;
  const goal = d.settings.waterGoal || 2000;
  const sleep = d.metrics.sleep[t] ?? 0;
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

      <section class="hero">
        <div class="hero-ring">
          <Ring value={d.habits.length ? habitsDone / d.habits.length : 0} color="#fff" size={74} stroke={8}>
            <b>{habitsDone}/{d.habits.length}</b>
          </Ring>
          <span>Привычки</span>
        </div>
        <div class="hero-ring">
          <Ring value={water / goal} color="#fff" size={74} stroke={8}>
            <b>{Math.round((water / goal) * 100)}%</b>
          </Ring>
          <span>Вода</span>
        </div>
        <div class="hero-ring">
          <Ring value={sleep / 8} color="#fff" size={74} stroke={8}>
            <b>{sleep ? num(sleep) : "—"}</b>
          </Ring>
          <span>Сон, ч</span>
        </div>
      </section>

      {backupOld && (
        <button class="banner" onClick={() => openOverlay({ name: "data" })}>
          <span class="banner-ico"><Icon name="shield" size={20} /></span>
          <span class="grow"><b>Сохрани копию данных</b><small>Записи живут только на этом устройстве</small></span>
          <Icon name="chevron" size={18} />
        </button>
      )}

      <Card title="Привычки" action={d.habits.length > 0 &&
        <button class="text-btn" onClick={() => setEditHabits(!editHabits)}>{editHabits ? "Готово" : "Изменить"}</button>}>
        {d.habits.map((h) => <HabitRow key={h.id} h={h} editing={editHabits} />)}
        {!d.habits.length && <Empty icon="flame">Добавь то, что хочешь делать каждый день, и отмечай — серия будет расти.</Empty>}
        <button class="add-row" onClick={addHabit}><Icon name="plus" size={18} /> Новая привычка</button>
      </Card>

      <h2 class="section-title">Тело</h2>
      <MetricTiles />

      <button class="gym-banner" onClick={() => { if (!active) startWorkout(); goTab("gym"); }}>
        <span class="gym-ico"><Icon name="gym" size={26} /></span>
        <span class="grow">
          <b>{active ? "Тренировка идёт" : "Пора в зал?"}</b>
          <small>{week} {plural(week, "тренировка", "тренировки", "тренировок")} на неделе{streak ? ` · ${streak} нед. подряд` : ""}</small>
        </span>
        <span class="pill-btn">{active ? "Открыть" : "Начать"}</span>
      </button>

      <Card title="Свои трекеры" action={
        <span class="row-actions">
          {!isPremium.value && <span class="badge-pro">PRO</span>}
          {d.trackers.length > 0 && <button class="text-btn" onClick={() => setEditTrackers(!editTrackers)}>{editTrackers ? "Готово" : "Изменить"}</button>}
        </span>}>
        {d.trackers.map((tr) => (
          <div class="tracker" key={tr.id}>
            <button class="tracker-main" onClick={() => editTracker(tr)}>
              <b>{tr.name}</b>
              <small>{num(tr.values[t] ?? 0)} {tr.unit} сегодня</small>
            </button>
            {editTrackers
              ? <button class="icon-btn danger" aria-label="Удалить" onClick={() => deleteTracker(tr)}><Icon name="trash" size={19} /></button>
              : <button class="pill-btn" onClick={() => { haptic(); setTrackerValue(tr.id, (v) => v + tr.step); }}>+{num(tr.step)}</button>}
          </div>
        ))}
        {!d.trackers.length && <Empty icon="sparkle">Считай что угодно: шаги, страницы, отжимания, часы учёбы.</Empty>}
        <button class="add-row" onClick={newTracker}><Icon name="plus" size={18} /> Новый трекер</button>
      </Card>
    </>
  );
}
