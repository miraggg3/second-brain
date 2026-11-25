// "Зал": start a workout, log sets with steppers, history and stats.

import { useEffect, useState } from "preact/hooks";
import { data, set, update } from "../store";
import type { Workout } from "../types";
import {
  activeWorkout, clock, duration, exerciseNames, finishedWorkouts, previousSet, setCount, volumeOf,
  weekStreak, workoutsSince,
} from "../domain";
import { dayKey, newId, num, startOfWeek } from "../utils";
import { locale, t } from "../i18n";
import { Heatmap } from "../charts";
import { Card, Empty, Icon, PageHead, Stepper, toast } from "../ui";
import { confirmAsk, haptic, hapticOk } from "../telegram";
import { shareImageItem } from "../share";
import { useHold } from "../gestures";

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
    if (it.sets.length && !(await confirmAsk(t("gym.removeExerciseConfirm", { name: it.name })))) return;
    editActive((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }));
  };

  return (
    <Card title={it.name} action={<button class="icon-btn" aria-label={t("gym.removeExercise")} onClick={removeExercise}><Icon name="close" size={18} /></button>}>
      {it.sets.length > 0 && (
        <div class="sets">
          {it.sets.map((s, j) => (
            <button key={j} class="set-chip" onClick={() => removeSet(j)} title={t("gym.tapToDelete")}>
              <small>{j + 1}</small>
              <b>{num(s.w)}</b>×{s.r}
            </button>
          ))}
        </div>
      )}
      <div class="set-controls">
        <Stepper value={kg} step={2.5} unit={t("unit.kg")} onChange={setKg} />
        <Stepper value={reps} step={1} min={1} unit={t("gym.repsUnit")} onChange={setReps} digits={0} />
      </div>
      <button class="btn block" onClick={addSet}><Icon name="plus" size={18} /> {t("gym.setN", { n: it.sets.length + 1 })}</button>
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
      if (!(await confirmAsk(t("gym.noSetsConfirm")))) return;
      update("workouts", (ws) => ws.filter((x) => x.id !== w.id));
      return;
    }
    const end = Date.now();
    editActive((x) => ({ ...x, items, end }));
    hapticOk();
    toast(t("gym.finishedToast", { time: duration(end - w.start), volume: num(volumeOf({ ...w, items }), 0) }));
  };

  const cancel = async () => {
    if (!(await confirmAsk(t("gym.cancelConfirm")))) return;
    update("workouts", (ws) => ws.filter((x) => x.id !== w.id));
  };

  return (
    <>
      <section class="workout-hero">
        <p class="eyebrow light"><span class="live-dot" /> {t("gym.inProgress")}</p>
        <div class="workout-clock">{clock(Date.now() - w.start)}</div>
        <div class="workout-meta">
          <span><b>{w.items.length}</b> {t("gym.exercisesWord", { n: w.items.length })}</span>
          <span><b>{setCount(w)}</b> {t("gym.setsWord", { n: setCount(w) })}</span>
          <span><b>{num(volumeOf(w), 0)}</b> {t("unit.kg")}</span>
        </div>
        <div class="workout-actions">
          <button class="btn light" onClick={finish}><Icon name="check" size={18} /> {t("gym.finish")}</button>
          <button class="btn glass-btn" onClick={cancel}>{t("gym.cancelWorkout")}</button>
        </div>
      </section>

      {w.items.map((it, i) => <ExerciseCard key={`${i}-${it.name}`} w={w} i={i} />)}

      <Card title={w.items.length ? t("gym.nextExercise") : t("gym.firstExercise")}>
        <div class="search-box">
          <Icon name="search" size={18} />
          <input placeholder={t("gym.searchPlaceholder")} value={name} autoComplete="off"
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
    if (!(await confirmAsk(t("gym.deleteFromHistoryConfirm")))) return;
    set("workouts", ws.filter((x) => x.id !== id));
  };

  return (
    <>
      <PageHead title={t("tab.gym")} sub={t("gym.inLog", { n: all.length })} />

      <button class="start-card" onClick={startWorkout}>
        <span class="start-play"><Icon name="play" size={26} /></span>
        <span class="grow">
          <b>{t("gym.startWorkout")}</b>
          <small>{t("gym.startHint")}</small>
        </span>
      </button>

      <StatRow week={week} month={month} streak={streak} />

      <Card share="gym" title={t("gym.visits")} icon="today">
        <Heatmap levelOf={(d) => Math.min(3, (perDay[d] ?? 0) * 2)} color="var(--c-gym)" />
        <div class="heat-legend"><span>{t("gym.less")}</span><i class="l0" /><i class="l1" /><i class="l2" /><i class="l3" /><span>{t("gym.more")}</span></div>
      </Card>

      <h2 class="section-title">{t("gym.history")}</h2>
      {all.length ? all.slice(0, 40).map((w) => (
        <HistoryItem key={w.id} w={w} open={openId === w.id} onToggle={() => setOpenId(openId === w.id ? null : w.id)} onRemove={() => remove(w.id)} />
      )) : <Card><Empty icon="gym">{t("gym.empty")}</Empty></Card>}
    </>
  );
}

function StatRow({ week, month, streak }: { week: number; month: number; streak: number }) {
  const ref = useHold<HTMLDivElement>({ menu: () => [shareImageItem("gym")] });
  return (
    <div ref={ref} class="stat-row" data-share="gym">
      <div class="stat"><b>{week}</b><small>{t("gym.thisWeek")}</small></div>
      <div class="stat"><b>{month}</b><small>{t("gym.thisMonth")}</small></div>
      <div class="stat"><b>{streak}<Icon name="flame" size={16} /></b><small>{t("gym.weeksInRow", { n: streak })}</small></div>
    </div>
  );
}

// a past workout: tap to expand, hold for "share" / "delete"
function HistoryItem({ w, open, onToggle, onRemove }: { w: Workout; open: boolean; onToggle: () => void; onRemove: () => void }) {
  const d = new Date(w.start);
  const ref = useHold<HTMLDivElement>({
    menu: () => [
      shareImageItem(`workout:${w.id}`),
      { label: t("gym.deleteWorkout"), icon: "trash", danger: true, run: onRemove },
    ],
  });
  return (
    <div ref={ref} class={`history card ${open ? "open" : ""}`} data-share={`workout:${w.id}`}>
      <button class="history-head" onClick={onToggle}>
        <span class="date-badge">
          <b>{d.getDate()}</b>
          <small>{d.toLocaleDateString(locale.value, { month: "short" }).replace(".", "")}</small>
        </span>
        <span class="grow">
          <b>{w.items.map((i) => i.name).slice(0, 2).join(", ")}{w.items.length > 2 ? ` +${w.items.length - 2}` : ""}</b>
          <small>{duration((w.end ?? w.start) - w.start)} · {t("gym.sets", { n: setCount(w) })} · {num(volumeOf(w), 0)} {t("unit.kg")}</small>
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
          <p class="muted small">{t("gym.holdHint")}</p>
        </div>
      )}
    </div>
  );
}

export function Gym() {
  const w = activeWorkout(data.value.workouts);
  return w ? <ActiveWorkout w={w} /> : <Overview />;
}
