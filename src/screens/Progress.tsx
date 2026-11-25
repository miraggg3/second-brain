// "Прогресс": body, habits and gym analytics in three segments.

import { useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { data, isPremium } from "../store";
import type { DayValues, Habit } from "../types";
import { useHold } from "../gestures";
import { shareImageItem } from "../share";
import { exerciseHistory, finishedWorkouts, habitStreak } from "../domain";
import { dayKey, lastDays, num, shortDay } from "../utils";
import { BarChart, Heatmap, LineChart, type Point } from "../charts";
import { Card, Empty, Icon, PageHead, Ring, Segmented } from "../ui";
import { openOverlay } from "../nav";

type Seg = "body" | "habits" | "gym";
const seg = signal<Seg>("body");

const series = (map: DayValues, days: Date[]): Point[] =>
  days.map((d) => ({ label: String(d.getDate()), value: map[dayKey(d)] ?? 0 }));

function Body() {
  const d = data.value;
  const m = d.metrics;
  const days14 = lastDays(14);
  const weights = Object.keys(m.weight).sort().slice(-60).map((k) => ({ label: shortDay(k), value: m.weight[k]! }));
  const moods = lastDays(30).filter((x) => m.mood[dayKey(x)]).map((x) => ({ label: shortDay(x), value: m.mood[dayKey(x)]! }));
  return (
    <>
      <Card share="metric:weight" title="Вес тела" icon="scale"><LineChart points={weights} unit=" кг" color="var(--c-weight)" /></Card>
      <Card share="metric:sleep" title="Сон · 14 дней" icon="moon"><BarChart points={series(m.sleep, days14)} unit=" ч" goal={8} color="var(--c-sleep)" /></Card>
      <Card share="metric:water" title="Вода · 14 дней" icon="drop">
        <BarChart points={series(m.water, days14).map((p) => ({ ...p, value: p.value / 1000 }))} unit=" л"
          goal={d.settings.waterGoal / 1000} color="var(--c-water)" />
      </Card>
      <Card share="metric:mood" title="Настроение · 30 дней" icon="smile"><LineChart points={moods} digits={1} color="var(--c-mood)" /></Card>
      {isPremium.value && d.trackers.map((t) => (
        <Card key={t.id} share={`tracker:${t.id}`} title={`${t.name} · 14 дней`} icon="sparkle">
          <BarChart points={series(t.values, days14)} unit={` ${t.unit}`} />
        </Card>
      ))}
    </>
  );
}

function Habits() {
  const d = data.value;
  if (!d.habits.length) return <Card><Empty icon="flame">Добавь привычки на вкладке «Сегодня» — здесь появится статистика.</Empty></Card>;
  const days30 = lastDays(30);
  const level = (day: string) => {
    const share = d.habits.filter((h) => h.done[day]).length / d.habits.length;
    return share === 0 ? 0 : share < 0.5 ? 1 : share < 1 ? 2 : 3;
  };
  return (
    <>
      <Card share="habits" title="Все привычки" icon="today">
        <Heatmap levelOf={level} />
      </Card>
      {d.habits.map((h) => <HabitStat key={h.id} h={h} days30={days30} />)}
    </>
  );
}

function HabitStat({ h, days30 }: { h: Habit; days30: Date[] }) {
  const done = days30.filter((x) => h.done[dayKey(x)]).length;
  const streak = habitStreak(h);
  const ref = useHold<HTMLDivElement>({ menu: () => [shareImageItem(`habit:${h.id}`)] });
  return (
          <div ref={ref} class="card habit-stat" data-share={`habit:${h.id}`}>
            <Ring value={done / 30} color="var(--accent)" size={58} stroke={6}>
              <b class="small">{Math.round((done / 30) * 100)}%</b>
            </Ring>
            <div class="grow">
              <b>{h.emoji} {h.name}</b>
              <small class="muted">{done} из 30 дней · серия {streak} <Icon name="flame" size={12} /></small>
              <div class="mini-days">
                {days30.slice(-14).map((x) => <i key={dayKey(x)} class={h.done[dayKey(x)] ? "on" : ""} />)}
              </div>
            </div>
          </div>
  );
}

function Gym() {
  const ws = data.value.workouts;
  const names = [...new Set(finishedWorkouts(ws).flatMap((w) => w.items.map((i) => i.name)))];
  const [picked, setPicked] = useState<string | null>(null);

  if (!isPremium.value) {
    return (
      <button class="card locked" onClick={() => openOverlay({ name: "premium" })}>
        <span class="locked-ico"><Icon name="trophy" size={30} /></span>
        <b>Рекорды и рост силы</b>
        <p class="muted">Личные рекорды, расчётный максимум на 1 повтор и графики по каждому упражнению.</p>
        <span class="pill-btn">Открыть с Premium</span>
      </button>
    );
  }
  if (!names.length) return <Card><Empty icon="trophy">Заверши первую тренировку — и здесь появятся рекорды.</Empty></Card>;

  const name = picked && names.includes(picked) ? picked : names[0]!;
  const h = exerciseHistory(ws, name);
  return (
    <>
      <div class="chips scroll">
        {names.map((n) => <button key={n} class={`chip ${n === name ? "on" : ""}`} onClick={() => setPicked(n)}>{n}</button>)}
      </div>
      <div class="stat-row">
        <div class="stat"><b>{num(Math.max(...h.map((x) => x.maxW)))}</b><small>рекорд, кг</small></div>
        <div class="stat"><b>{num(Math.max(...h.map((x) => x.best1rm)))}</b><small>1ПМ, кг</small></div>
        <div class="stat"><b>{h.length}</b><small>тренировок</small></div>
      </div>
      <Card share="gym" title="Расчётный максимум (1ПМ)" icon="trophy">
        <LineChart points={h.map((x) => ({ label: shortDay(x.date), value: x.best1rm }))} unit=" кг" color="var(--c-gym)" />
      </Card>
      <Card share="gym" title="Объём за тренировку" icon="gym">
        <LineChart points={h.map((x) => ({ label: shortDay(x.date), value: x.volume }))} unit=" кг" digits={0} color="var(--c-gym)" />
      </Card>
    </>
  );
}

export function Progress() {
  return (
    <>
      <PageHead title="Прогресс" sub="Как меняешься ты" />
      <Segmented value={seg.value} onChange={(v) => (seg.value = v)}
        options={[{ id: "body", label: "Тело" }, { id: "habits", label: "Привычки" }, { id: "gym", label: "Зал" }]} />
      {seg.value === "body" && <Body />}
      {seg.value === "habits" && <Habits />}
      {seg.value === "gym" && <Gym />}
    </>
  );
}
