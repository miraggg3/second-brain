// "Зал": start a workout, log sets with steppers, history and stats.

import { useEffect, useState } from "preact/hooks";
import { data, set, update } from "../store";
import type { Workout } from "../types";
import {
  activeWorkout, clock, duration, exerciseNames, finishedWorkouts, previousSet, setCount, volumeOf,
  weekStreak, workoutsSince,
} from "../domain";
import { dayKey, newId, num, plural, startOfWeek } from "../utils";
import { Heatmap } from "../charts";
import { Card, Empty, Icon, PageHead, Stepper, toast } from "../ui";
import { confirmAsk, haptic, hapticOk } from "../telegram";
import { shareFrom } from "../share";

export function startWorkout() {
  if (activeWorkout(data.value.workouts)) return;
  update("workouts", (ws) => [...ws, { id: newId(), start: Date.now(), end: null, items: [] }]);
  haptic("medium");
}

function editActive(fn: (w: Workout) => Workout) {
  update("workouts", (ws) => ws.map((w) => (w.end ? w : fn(w))));
}

// ---------- active workout ----------

function ExerciseCard({ w, i }: { w: Workout; i: number }) {
  const it = w.items[i]!;
  const last = it.sets[it.sets.length - 1] ?? previousSet(data.value.workouts, it.name);
  const [kg, setKg] = useState(last?.w ?? 20);
  const [reps, setReps] = useState(last?.r ?? 10);

  const addSet = () => {
    haptic("medium");
    editActive((x) => ({
      ...x,
      items: x.items.map((e, j) => (j === i ? { ...e, sets: [...e.sets, { w: kg, r: reps }] } : e)),
    }));
  };

  const removeSet = (j: number) =>
    editActive((x) => ({
      ...x,
      items: x.items.map((e, k) => (k === i ? { ...e, sets: e.sets.filter((_, n) => n !== j) } : e)),
    }));

  const removeExercise = async () => {
    if (it.sets.length && !(await confirmAsk(`Убрать «${it.name}» со всеми подходами?`))) return;
    editActive((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }));
  };

  return (
    <Card title={it.name} action={<button class="icon-btn" aria-label="Убрать упражнение" onClick={removeExercise}><Icon name="close" size={18} /></button>}>
      {it.sets.length > 0 && (
        <div class="sets">
          {it.sets.map((s, j) => (
            <button key={j} class="set-chip" onClick={() => removeSet(j)} title="Нажми, чтобы удалить">
              <small>{j + 1}</small>
              <b>{num(s.w)}</b>×{s.r}
            </button>
          ))}
        </div>
      )}
      <div class="set-controls">
        <Stepper value={kg} step={2.5} unit="кг" onChange={setKg} />
        <Stepper value={reps} step={1} min={1} unit="повт" onChange={setReps} digits={0} />
      </div>
      <button class="btn block" onClick={addSet}><Icon name="plus" size={18} /> Подход {it.sets.length + 1}</button>
    </Card>
  );
}

function ActiveWorkout({ w }: { w: Workout }) {
  const [, tick] = useState(0);
  const [name, setName] = useState("");
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const used = new Set(w.items.map((i) => i.name));
  const q = name.trim().toLowerCase();
  const suggestions = exerciseNames(data.value.workouts)
    .filter((n) => !used.has(n) && (!q || n.toLowerCase().includes(q)))
    .slice(0, 8);

  const addExercise = (n: string) => {
    const clean = n.trim();
    if (!clean) return;
    haptic();
    editActive((x) => ({ ...x, items: [...x.items, { name: clean.slice(0, 60), sets: [] }] }));
    setName("");
  };

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
    toast(`Отличная работа! ${duration(end - w.start)}, ${num(volumeOf({ ...w, items }), 0)} кг объёма`);
  };

  const cancel = async () => {
    if (!(await confirmAsk("Отменить тренировку? Подходы удалятся."))) return;
    update("workouts", (ws) => ws.filter((x) => x.id !== w.id));
  };

  return (
    <>
      <section class="workout-hero">
        <p class="eyebrow light"><span class="live-dot" /> Тренировка идёт</p>
        <div class="workout-clock">{clock(Date.now() - w.start)}</div>
        <div class="workout-meta">
          <span><b>{w.items.length}</b> упр.</span>
          <span><b>{setCount(w)}</b> {plural(setCount(w), "подход", "подхода", "подходов")}</span>
          <span><b>{num(volumeOf(w), 0)}</b> кг</span>
        </div>
        <div class="workout-actions">
          <button class="btn light" onClick={finish}><Icon name="check" size={18} /> Завершить</button>
          <button class="btn glass-btn" onClick={cancel}>Отменить</button>
        </div>
      </section>

      {w.items.map((it, i) => <ExerciseCard key={`${i}-${it.name}`} w={w} i={i} />)}

      <Card title={w.items.length ? "Следующее упражнение" : "Первое упражнение"}>
        <div class="search-box">
          <Icon name="search" size={18} />
          <input placeholder="Найти или ввести своё" value={name} autoComplete="off"
            onInput={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && addExercise(name)} />
        </div>
        <div class="chips">
          {name.trim() && !suggestions.some((s) => s.toLowerCase() === q) && (
            <button class="chip add" onClick={() => addExercise(name)}><Icon name="plus" size={14} /> {name.trim()}</button>
          )}
          {suggestions.map((n) => <button key={n} class="chip" onClick={() => addExercise(n)}>{n}</button>)}
        </div>
      </Card>
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
      <PageHead title="Зал" sub={`${all.length} ${plural(all.length, "тренировка", "тренировки", "тренировок")} в журнале`} />

      <button class="start-card" onClick={startWorkout}>
        <span class="start-play"><Icon name="play" size={26} /></span>
        <span class="grow">
          <b>Начать тренировку</b>
          <small>Подходы записываются в пару касаний</small>
        </span>
      </button>

      <div class="stat-row">
        <div class="stat"><b>{week}</b><small>на неделе</small></div>
        <div class="stat"><b>{month}</b><small>за месяц</small></div>
        <div class="stat"><b>{streak}<Icon name="flame" size={16} /></b><small>{plural(streak, "неделя", "недели", "недель")} подряд</small></div>
      </div>

      <Card title="Посещения" icon="today" action={
        <button class="icon-btn" aria-label="Поделиться" onClick={(e) => shareFrom(e.currentTarget, ".card")}><Icon name="share" size={19} /></button>}>
        <Heatmap levelOf={(d) => Math.min(3, (perDay[d] ?? 0) * 2)} color="var(--c-gym)" />
        <div class="heat-legend"><span>меньше</span><i class="l0" /><i class="l1" /><i class="l2" /><i class="l3" /><span>больше</span></div>
      </Card>

      <h2 class="section-title">История</h2>
      {all.length ? all.slice(0, 40).map((w) => {
        const d = new Date(w.start);
        const open = openId === w.id;
        return (
          <div key={w.id} class={`history card ${open ? "open" : ""}`}>
            <button class="history-head" onClick={() => setOpenId(open ? null : w.id)}>
              <span class="date-badge">
                <b>{d.getDate()}</b>
                <small>{d.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")}</small>
              </span>
              <span class="grow">
                <b>{w.items.map((i) => i.name).slice(0, 2).join(", ")}{w.items.length > 2 ? ` +${w.items.length - 2}` : ""}</b>
                <small>{duration((w.end ?? w.start) - w.start)} · {setCount(w)} {plural(setCount(w), "подход", "подхода", "подходов")} · {num(volumeOf(w), 0)} кг</small>
              </span>
              <span class={`chev ${open ? "up" : ""}`}><Icon name="chevron" size={18} /></span>
            </button>
            {open && (
              <div class="history-body">
                {w.items.map((it) => (
                  <div key={it.name} class="history-ex">
                    <b>{it.name}</b>
                    <div class="sets">
                      {it.sets.map((s, j) => <span key={j} class="set-chip static"><b>{num(s.w)}</b>×{s.r}</span>)}
                    </div>
                  </div>
                ))}
                <div class="row-actions">
                  <button class="text-btn" onClick={(e) => shareFrom(e.currentTarget, ".history")}><Icon name="share" size={16} /> Поделиться</button>
                  <button class="text-btn danger" onClick={() => remove(w.id)}><Icon name="trash" size={16} /> Удалить</button>
                </div>
              </div>
            )}
          </div>
        );
      }) : <Card><Empty icon="gym">Здесь появятся твои тренировки. Нажми «Начать» в зале — и записывай подходы между ними.</Empty></Card>}
    </>
  );
}

export function Gym() {
  const w = activeWorkout(data.value.workouts);
  return w ? <ActiveWorkout w={w} /> : <Overview />;
}
