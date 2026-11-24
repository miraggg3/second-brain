// "Зал": log a workout as a table of sets, history, streaks and attendance grid.

import { useEffect, useState } from "preact/hooks";
import { data, set, update } from "../store";
import type { Workout } from "../types";
import {
  activeWorkout, clock, duration, exerciseNames, finishedWorkouts, previousSet, volumeOf,
  weekStreak, workoutsSince,
} from "../domain";
import { dayKey, formatDate, newId, num, pad2, parseNum, plural, startOfWeek } from "../utils";
import { Heatmap } from "../charts";
import { Empty, Icon, Section, toast } from "../ui";
import { confirmAsk, haptic, hapticOk } from "../telegram";
import { Header } from "./Header";

export function startWorkout() {
  if (activeWorkout(data.value.workouts)) return;
  update("workouts", (ws) => [...ws, { id: newId(), start: Date.now(), end: null, items: [] }]);
  haptic("medium");
}

// change the active workout
function editActive(fn: (w: Workout) => Workout) {
  update("workouts", (ws) => ws.map((w) => (w.end ? w : fn(w))));
}

// ---------- active workout ----------

function SetForm({ w, i }: { w: Workout; i: number }) {
  const it = w.items[i];
  const last = it.sets[it.sets.length - 1] ?? previousSet(data.value.workouts, it.name);
  const [kg, setKg] = useState(last ? String(last.w) : "");
  const [reps, setReps] = useState(last ? String(last.r) : "");

  const add = () => {
    const r = parseInt(reps, 10);
    if (!(r > 0)) return toast("Сколько повторений?");
    const weight = Math.max(0, parseNum(kg) ?? 0);
    haptic("medium");
    editActive((x) => ({
      ...x,
      items: x.items.map((e, j) => (j === i ? { ...e, sets: [...e.sets, { w: weight, r }] } : e)),
    }));
  };

  return (
    <div class="set-form">
      <input class="mono" type="number" inputMode="decimal" step="0.5" min="0" placeholder="кг"
        value={kg} onInput={(e) => setKg(e.currentTarget.value)} />
      <span class="mono">×</span>
      <input class="mono" type="number" inputMode="numeric" step="1" min="1" placeholder="повт"
        value={reps} onInput={(e) => setReps(e.currentTarget.value)} />
      <button class="btn small" onClick={add}>+ подход</button>
    </div>
  );
}

function ActiveWorkout({ w }: { w: Workout }) {
  const [, tick] = useState(0);
  const [name, setName] = useState("");
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const addExercise = () => {
    const n = name.trim();
    if (!n) return;
    editActive((x) => ({ ...x, items: [...x.items, { name: n.slice(0, 60), sets: [] }] }));
    setName("");
  };

  const removeExercise = async (i: number) => {
    const it = w.items[i];
    if (it.sets.length && !(await confirmAsk(`Убрать «${it.name}» со всеми подходами?`))) return;
    editActive((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }));
  };

  const removeSet = (i: number, j: number) =>
    editActive((x) => ({
      ...x,
      items: x.items.map((e, k) => (k === i ? { ...e, sets: e.sets.filter((_, n) => n !== j) } : e)),
    }));

  const finish = async () => {
    const items = w.items.filter((it) => it.sets.length);
    if (!items.length) {
      if (!(await confirmAsk("Ни одного подхода. Удалить тренировку?"))) return;
      update("workouts", (ws) => ws.filter((x) => x.id !== w.id));
      return;
    }
    const end = Date.now();
    editActive((x) => ({ ...x, items, end }));
    hapticOk();
    toast(`Записано: ${duration(end - w.start)}, ${num(volumeOf({ ...w, items }), 0)} кг объёма`);
  };

  const cancel = async () => {
    if (!(await confirmAsk("Отменить тренировку? Подходы удалятся."))) return;
    update("workouts", (ws) => ws.filter((x) => x.id !== w.id));
  };

  return (
    <>
      <header class="head">
        <div class="head-title">
          <span class="idx live">REC</span>
          <h1>Тренировка</h1>
          <p class="mono sub">объём {num(volumeOf(w), 0)} кг</p>
        </div>
        <div class="stopwatch mono">{clock(Date.now() - w.start)}</div>
      </header>

      {w.items.map((it, i) => (
        <Section key={`${i}-${it.name}`} num={pad2(i + 1)} label={it.name}
          action={<button class="x" aria-label="Убрать упражнение" onClick={() => removeExercise(i)}><Icon name="close" size={16} /></button>}>
          {it.sets.length > 0 && (
            <table class="log mono">
              <tbody>
                {it.sets.map((s, j) => (
                  <tr key={j}>
                    <td class="n">{j + 1}</td>
                    <td><b>{num(s.w)}</b> кг</td>
                    <td>× <b>{s.r}</b></td>
                    <td class="r"><button class="x" aria-label="Удалить подход" onClick={() => removeSet(i, j)}><Icon name="close" size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <SetForm key={it.sets.length} w={w} i={i} />
        </Section>
      ))}

      <Section label="Добавить упражнение">
        <div class="set-form">
          <input list="ex-names" placeholder="Жим лёжа, присед…" value={name} autoComplete="off"
            onInput={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && addExercise()} />
          <button class="btn small" onClick={addExercise}><Icon name="plus" size={18} /></button>
        </div>
        <datalist id="ex-names">
          {exerciseNames(data.value.workouts).map((n) => <option key={n} value={n} />)}
        </datalist>
      </Section>

      <div class="row">
        <button class="btn" onClick={finish}>Завершить</button>
        <button class="btn ghost danger" onClick={cancel}>Отменить</button>
      </div>
    </>
  );
}

// ---------- overview ----------

function Overview() {
  const ws = data.value.workouts;
  const [openId, setOpenId] = useState<string | null>(null);
  const all = finishedWorkouts(ws);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const week = workoutsSince(ws, startOfWeek()).length;
  const month = workoutsSince(ws, monthStart).length;
  const streak = weekStreak(ws);
  const perDay: Record<string, number> = {};
  for (const w of all) perDay[dayKey(w.start)] = (perDay[dayKey(w.start)] ?? 0) + 1;

  const remove = async (id: string) => {
    if (!(await confirmAsk("Удалить тренировку из истории?"))) return;
    set("workouts", ws.filter((x) => x.id !== id));
  };

  return (
    <>
      <Header idx="02" title="Зал" sub={`${all.length} ${plural(all.length, "тренировка", "тренировки", "тренировок")} в журнале`} />

      <button class="btn big" onClick={startWorkout}><Icon name="play" size={18} /> Начать тренировку</button>

      <div class="ledger">
        <div><b>{week}</b><span>неделя</span></div>
        <div><b>{month}</b><span>месяц</span></div>
        <div><b>{streak}</b><span>{plural(streak, "неделя", "недели", "недель")} подряд</span></div>
      </div>

      <Section num="A" label="Посещения, 16 недель">
        <Heatmap levelOf={(d) => Math.min(3, (perDay[d] ?? 0) * 2)} />
      </Section>

      <Section num="B" label="Журнал">
        {all.length ? all.slice(0, 40).map((w) => (
          <div key={w.id} class={`entry ${openId === w.id ? "open" : ""}`}>
            <button class="entry-head" onClick={() => setOpenId(openId === w.id ? null : w.id)}>
              <span class="mono date">{formatDate(w.start, { day: "2-digit", month: "2-digit" })}</span>
              <span class="grow">{w.items.map((i) => i.name).join(" · ")}</span>
              <span class="mono sub">{duration((w.end ?? w.start) - w.start)}</span>
            </button>
            {openId === w.id && (
              <div class="entry-body">
                {w.items.map((it) => (
                  <p key={it.name}>
                    <b>{it.name}</b>
                    <span class="mono sub">{it.sets.map((s) => `${num(s.w)}×${s.r}`).join("  ")}</span>
                  </p>
                ))}
                <div class="row">
                  <span class="mono sub grow">объём {num(volumeOf(w), 0)} кг</span>
                  <button class="link danger" onClick={() => remove(w.id)}>удалить</button>
                </div>
              </div>
            )}
          </div>
        )) : <Empty>Здесь появятся твои тренировки. Нажми «Начать» в зале — и записывай подходы прямо между ними.</Empty>}
      </Section>
    </>
  );
}

export function Gym() {
  const w = activeWorkout(data.value.workouts);
  return w ? <ActiveWorkout w={w} /> : <Overview />;
}
