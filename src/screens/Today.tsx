// "День": habits, water, sleep, weight, mood, custom trackers and a gym strip.

import { data, isPremium, update } from "../store";
import type { Habit, MetricKind, Tracker } from "../types";
import { activeWorkout, habitStreak, lastValue, weekStreak, workoutsSince } from "../domain";
import { dayKey, newId, num, parseNum, plural, startOfWeek } from "../utils";
import { ask, Empty, Icon, Section } from "../ui";
import { confirmAsk, haptic, hapticOk } from "../telegram";
import { FREE_HABITS, requirePremium } from "../premium";
import { goTab, openOverlay } from "../nav";
import { Header } from "./Header";
import { startWorkout } from "./Gym";

const MOODS = ["Паршиво", "Так себе", "Нормально", "Хорошо", "Огонь"];
const GLASS = 250;
const DAY = 86_400_000;

function setMetric(kind: MetricKind, value: number | null) {
  const t = dayKey();
  update("metrics", (m) => {
    const map = { ...m[kind] };
    if (value && value > 0) map[t] = value;
    else delete map[t];
    return { ...m, [kind]: map };
  });
}

// ---------- habits ----------

async function addHabit() {
  if (data.value.habits.length >= FREE_HABITS && !requirePremium(`Бесплатно — ${FREE_HABITS} привычки. Больше в Premium ★`)) return;
  const v = await ask({
    title: "Новая привычка",
    fields: [
      { name: "name", label: "Что делаем каждый день", placeholder: "Читать 20 минут" },
      { name: "emoji", label: "Значок (необязательно)", placeholder: "📚" },
    ],
  });
  if (!v?.name) return;
  const h: Habit = { id: newId(), name: v.name.slice(0, 60), emoji: v.emoji.slice(0, 4), created: Date.now(), done: {} };
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

function HabitRow({ h }: { h: Habit }) {
  const done = !!h.done[dayKey()];
  const streak = habitStreak(h);
  return (
    <div class={`habit ${done ? "done" : ""}`}>
      <button class="box" aria-label={done ? "Снять отметку" : "Отметить"} onClick={() => toggleHabit(h.id)}>
        {done && <svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19" /></svg>}
      </button>
      <span class="habit-name">{h.emoji} {h.name}</span>
      {streak > 0 && <span class="tally mono">{streak} {plural(streak, "день", "дня", "дней")}</span>}
      <button class="x" aria-label="Удалить" onClick={() => deleteHabit(h)}><Icon name="close" size={16} /></button>
    </div>
  );
}

// ---------- custom trackers (premium) ----------

async function newTracker() {
  if (!requirePremium("Свои трекеры — в Premium ★")) return;
  const v = await ask({
    title: "Новый трекер",
    fields: [
      { name: "name", label: "Что считаем", placeholder: "Отжимания" },
      { name: "unit", label: "Единица", placeholder: "раз" },
      { name: "step", label: "Шаг кнопки «+»", type: "number", value: 1, step: "any" },
    ],
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
    fields: [{ name: "value", label: `Сегодня, ${tr.unit}`, type: "number", step: "any", value: tr.values[dayKey()] ?? "" }],
  });
  if (v) setTrackerValue(tr.id, () => parseNum(v.value) ?? 0);
}

async function deleteTracker(tr: Tracker) {
  if (!(await confirmAsk(`Удалить трекер «${tr.name}» и его историю?`))) return;
  update("trackers", (ts) => ts.filter((x) => x.id !== tr.id));
}

// ---------- screen ----------

export function Today() {
  const d = data.value;
  const t = dayKey();
  const m = d.metrics;
  const water = m.water[t] ?? 0;
  const goal = d.settings.waterGoal || 2000;
  const glasses = Math.min(12, Math.round(goal / GLASS));
  const mood = m.mood[t] ?? 0;
  const active = activeWorkout(d.workouts);
  const week = workoutsSince(d.workouts, startOfWeek()).length;
  const streak = weekStreak(d.workouts);
  const hasData = d.notes.length + d.workouts.length + d.habits.length > 0;
  const backupOld = hasData && Date.now() - d.settings.lastBackup > 14 * DAY;

  const tapGlass = (i: number) => {
    haptic();
    const full = Math.round(water / GLASS);
    setMetric("water", full === i + 1 ? i * GLASS : (i + 1) * GLASS);
  };

  return (
    <>
      <Header
        idx="01"
        title="День"
        sub={new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
      />

      {backupOld && (
        <button class="notice" onClick={() => openOverlay({ name: "data" })}>
          <b>Копии давно не было.</b> Данные живут только на этом устройстве — сохрани файл, чтобы не потерять и перенести на ПК →
        </button>
      )}

      <section class="sheet-card gym-strip">
        <div class="big-num">{week}</div>
        <div class="grow">
          <b>{plural(week, "тренировка", "тренировки", "тренировок")} за неделю</b>
          <p class="mono sub">{streak ? `серия: ${streak} ${plural(streak, "неделя", "недели", "недель")} подряд` : "серия начнётся с первой тренировки"}</p>
        </div>
        <button class="btn small" onClick={() => { if (!active) startWorkout(); goTab("gym"); }}>
          {active ? "Продолжить" : "В зал"}
        </button>
      </section>

      <Section num="A" label="Привычки" action={<button class="link" onClick={addHabit}>+ добавить</button>}>
        {d.habits.length
          ? d.habits.map((h) => <HabitRow key={h.id} h={h} />)
          : <Empty>Запиши то, что хочешь делать каждый день: «Читать 20 минут», «Без сахара», «Растяжка». Отмечай крестиком — серия будет расти.</Empty>}
      </Section>

      <Section num="B" label="Тело">
        <div class="metric">
          <div class="metric-head">
            <span>Вода</span>
            <span class="mono"><b>{num(water, 0)}</b> / {goal} мл</span>
          </div>
          <div class="glasses">
            {Array.from({ length: glasses }, (_, i) => (
              <button key={i} class={`glass ${water >= (i + 1) * GLASS ? "full" : ""}`}
                aria-label={`${(i + 1) * GLASS} мл`} onClick={() => tapGlass(i)} />
            ))}
            <button class="glass plus" aria-label="+250 мл" onClick={() => { haptic(); setMetric("water", water + GLASS); }}>+</button>
          </div>
        </div>

        <div class="metric-row">
          <label class="field">
            <span>Сон</span>
            <input class="mono" type="number" inputMode="decimal" step="0.5" min="0" max="24"
              defaultValue={m.sleep[t] != null ? String(m.sleep[t]) : ""} placeholder="—"
              onChange={(e) => setMetric("sleep", parseNum(e.currentTarget.value))} />
            <i>ч</i>
          </label>
          <label class="field">
            <span>Вес</span>
            <input class="mono" type="number" inputMode="decimal" step="0.1" min="0"
              defaultValue={m.weight[t] != null ? String(m.weight[t]) : ""}
              placeholder={String(lastValue(m.weight) ?? "—")}
              onChange={(e) => setMetric("weight", parseNum(e.currentTarget.value))} />
            <i>кг</i>
          </label>
        </div>

        <div class="metric">
          <div class="metric-head">
            <span>Настроение</span>
            <span class="mono">{mood ? MOODS[mood - 1] : "—"}</span>
          </div>
          <div class="scale">
            {MOODS.map((label, i) => (
              <button key={label} class={mood >= i + 1 ? "on" : ""} aria-label={label}
                onClick={() => { haptic(); setMetric("mood", mood === i + 1 ? null : i + 1); }}>
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section num="C" label={isPremium.value ? "Свои трекеры" : "Свои трекеры ★"}
        action={<button class="link" onClick={newTracker}>+ добавить</button>}>
        {d.trackers.length ? d.trackers.map((tr) => (
          <div class="tracker" key={tr.id}>
            <span class="grow">{tr.name}</span>
            <button class="count mono" onClick={() => editTracker(tr)}>{num(tr.values[t] ?? 0)} <small>{tr.unit}</small></button>
            <button class="btn small" onClick={() => { haptic(); setTrackerValue(tr.id, (v) => v + tr.step); }}>+{num(tr.step)}</button>
            <button class="x" aria-label="Удалить" onClick={() => deleteTracker(tr)}><Icon name="close" size={16} /></button>
          </div>
        )) : (
          <Empty>Считай что угодно: страницы, шаги, отжимания, чашки кофе, часы учёбы.{isPremium.value ? "" : " Доступно в Premium."}</Empty>
        )}
      </Section>
    </>
  );
}
