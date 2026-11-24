// "Прогресс": charts for body, habits, and premium gym analytics.

import { useState } from "preact/hooks";
import { data, isPremium } from "../store";
import type { DayValues } from "../types";
import { exerciseHistory, finishedWorkouts } from "../domain";
import { dayKey, lastDays, num, shortDay } from "../utils";
import { BarChart, Heatmap, LineChart, type Point } from "../charts";
import { Empty, Icon, Section } from "../ui";
import { openOverlay } from "../nav";
import { Header } from "./Header";

const series = (map: DayValues, days: Date[]): Point[] =>
  days.map((d) => ({ label: String(d.getDate()), value: map[dayKey(d)] ?? 0 }));

function Records() {
  const ws = data.value.workouts;
  const names = [...new Set(finishedWorkouts(ws).flatMap((w) => w.items.map((i) => i.name)))];
  const [picked, setPicked] = useState<string | null>(null);

  if (!isPremium.value) {
    return (
      <Section num="★" label="Рекорды в зале" class="locked" onClick={() => openOverlay({ name: "premium" })}>
        <div class="lock-row">
          <Icon name="lock" size={28} />
          <p>Личные рекорды, расчётный максимум на 1 повтор и график роста силы по каждому упражнению. Открывается в Premium.</p>
        </div>
      </Section>
    );
  }
  if (!names.length) {
    return <Section num="★" label="Рекорды в зале"><Empty>Заверши первую тренировку — и здесь появятся рекорды.</Empty></Section>;
  }

  const name = picked && names.includes(picked) ? picked : names[0];
  const h = exerciseHistory(ws, name);
  return (
    <Section num="★" label="Рекорды в зале">
      <div class="tags">
        {names.map((n) => <button key={n} class={`tag ${n === name ? "on" : ""}`} onClick={() => setPicked(n)}>{n}</button>)}
      </div>
      <div class="ledger inner">
        <div><b>{num(Math.max(...h.map((x) => x.maxW)))}</b><span>макс, кг</span></div>
        <div><b>{num(Math.max(...h.map((x) => x.best1rm)))}</b><span>1ПМ, кг</span></div>
        <div><b>{h.length}</b><span>раз</span></div>
      </div>
      <p class="chart-cap mono">расчётный 1ПМ (Эпли)</p>
      <LineChart points={h.map((x) => ({ label: shortDay(x.date), value: x.best1rm }))} unit=" кг" />
      <p class="chart-cap mono">объём за тренировку</p>
      <LineChart points={h.map((x) => ({ label: shortDay(x.date), value: x.volume }))} unit=" кг" digits={0} />
    </Section>
  );
}

export function Progress() {
  const d = data.value;
  const m = d.metrics;
  const days14 = lastDays(14);
  const days30 = lastDays(30);
  const weights = Object.keys(m.weight).sort().slice(-60).map((k) => ({ label: shortDay(k), value: m.weight[k] }));
  const moods = days30.filter((x) => m.mood[dayKey(x)]).map((x) => ({ label: shortDay(x), value: m.mood[dayKey(x)] }));

  const habitLevel = (day: string) => {
    if (!d.habits.length) return 0;
    const share = d.habits.filter((h) => h.done[day]).length / d.habits.length;
    return share === 0 ? 0 : share < 0.5 ? 1 : share < 1 ? 2 : 3;
  };

  return (
    <>
      <Header idx="04" title="Прогресс" sub="последние недели в цифрах" />

      <Section num="A" label="Вес тела">
        <LineChart points={weights} unit=" кг" />
      </Section>

      <Records />

      <Section num="B" label="Привычки, 30 дней">
        {d.habits.length ? (
          <>
            {d.habits.map((h) => {
              const done = days30.filter((x) => h.done[dayKey(x)]).length;
              const pct = Math.round((done / 30) * 100);
              return (
                <div key={h.id} class="meter">
                  <span class="grow">{h.emoji} {h.name}</span>
                  <span class="mono">{pct}%</span>
                  <div class="meter-bar"><i style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
            <Heatmap levelOf={habitLevel} />
          </>
        ) : <Empty>Добавь привычки во вкладке «День».</Empty>}
      </Section>

      <Section num="C" label="Сон, 14 дней">
        <BarChart points={series(m.sleep, days14)} unit=" ч" goal={8} />
      </Section>

      <Section num="D" label="Вода, 14 дней">
        <BarChart points={series(m.water, days14)} unit=" мл" goal={d.settings.waterGoal} digits={0} />
      </Section>

      <Section num="E" label="Настроение, 30 дней">
        <LineChart points={moods} digits={0} />
      </Section>

      {isPremium.value && d.trackers.map((t, i) => (
        <Section key={t.id} num={String(i + 1)} label={`${t.name}, 14 дней`}>
          <BarChart points={series(t.values, days14)} unit={` ${t.unit}`} />
        </Section>
      ))}
    </>
  );
}
