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
import { t } from "../i18n";

type Seg = "body" | "habits" | "gym";
const seg = signal<Seg>("body");

const insight = (key: string) => openOverlay({ name: "insight", key });

// "more" arrow in a card header: the whole card opens its details
const More = () => <span class="more-link">{t("insight.details")}<Icon name="chevron" size={16} /></span>;

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
      <Card share="metric:weight" title={t("progress.weight")} icon="scale" class="tap" onClick={() => insight("metric:weight")} action={<More />}><LineChart points={weights} unit={` ${t("unit.kg")}`} color="var(--c-weight)" /></Card>
      <Card share="metric:sleep" title={t("progress.sleep14")} icon="moon" class="tap" onClick={() => insight("metric:sleep")} action={<More />}><BarChart points={series(m.sleep, days14)} unit={` ${t("unit.h")}`} goal={8} color="var(--c-sleep)" /></Card>
      <Card share="metric:water" title={t("progress.water14")} icon="drop" class="tap" onClick={() => insight("metric:water")} action={<More />}>
        <BarChart points={series(m.water, days14).map((p) => ({ ...p, value: p.value / 1000 }))} unit={` ${t("unit.l")}`}
          goal={d.settings.waterGoal / 1000} color="var(--c-water)" />
      </Card>
      <Card share="metric:mood" title={t("progress.mood30")} icon="smile" class="tap" onClick={() => insight("metric:mood")} action={<More />}><LineChart points={moods} digits={1} color="var(--c-mood)" summary="avg" /></Card>
      {isPremium.value && d.trackers.map((tr) => (
        <Card key={tr.id} share={`tracker:${tr.id}`} title={t("progress.tracker14", { name: tr.name })} icon="sparkle" class="tap" onClick={() => insight(`tracker:${tr.id}`)} action={<More />}>
          <BarChart points={series(tr.values, days14)} unit={` ${tr.unit}`} />
        </Card>
      ))}
    </>
  );
}

function Habits() {
  const d = data.value;
  if (!d.habits.length) return <Card><Empty icon="flame">{t("progress.habitsEmpty")}</Empty></Card>;
  const days30 = lastDays(30);
  const level = (day: string) => {
    const share = d.habits.filter((h) => h.done[day]).length / d.habits.length;
    return share === 0 ? 0 : share < 0.5 ? 1 : share < 1 ? 2 : 3;
  };
  return (
    <>
      <Card share="habits" title={t("progress.allHabits")} icon="today">
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
          <div ref={ref} class="card habit-stat tap" data-share={`habit:${h.id}`} onClick={() => insight(`habit:${h.id}`)}>
            <Ring value={done / 30} color="var(--accent)" size={58} stroke={6}>
              <b class="small">{Math.round((done / 30) * 100)}%</b>
            </Ring>
            <div class="grow">
              <b>{h.emoji} {h.name}</b>
              <small class="muted">{t("progress.doneOf30", { n: done })} · {t("progress.streak", { n: streak })} <Icon name="flame" size={12} /></small>
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
        <b>{t("progress.lockedTitle")}</b>
        <p class="muted">{t("progress.lockedText")}</p>
        <span class="pill-btn">{t("progress.lockedCta")}</span>
      </button>
    );
  }
  if (!names.length) return <Card><Empty icon="trophy">{t("progress.gymEmpty")}</Empty></Card>;

  const name = picked && names.includes(picked) ? picked : names[0]!;
  const h = exerciseHistory(ws, name);
  return (
    <>
      <div class="chips scroll">
        {names.map((n) => <button key={n} class={`chip ${n === name ? "on" : ""}`} onClick={() => setPicked(n)}>{n}</button>)}
      </div>
      <div class="stat-row">
        <div class="stat"><b>{num(Math.max(...h.map((x) => x.maxW)))}</b><small>{t("progress.statRecord")}</small></div>
        <div class="stat"><b>{num(Math.max(...h.map((x) => x.best1rm)))}</b><small>{t("progress.stat1rm")}</small></div>
        <div class="stat"><b>{h.length}</b><small>{t("progress.statWorkouts", { n: h.length })}</small></div>
      </div>
      <Card share="gym" title={t("progress.oneRm")} icon="trophy" class="tap" onClick={() => insight(`exercise:${name}`)} action={<More />}>
        <LineChart points={h.map((x) => ({ label: shortDay(x.date), value: x.best1rm }))} unit={` ${t("unit.kg")}`} color="var(--c-gym)" />
      </Card>
      <Card share="gym" title={t("progress.volume")} icon="gym" class="tap" onClick={() => insight(`exercise:${name}`)} action={<More />}>
        <LineChart points={h.map((x) => ({ label: shortDay(x.date), value: x.volume }))} unit={` ${t("unit.kg")}`} digits={0} color="var(--c-gym)" />
      </Card>
    </>
  );
}

export function Progress() {
  return (
    <>
      <PageHead title={t("progress.title")} sub={t("progress.sub")} />
      <Segmented value={seg.value} onChange={(v) => (seg.value = v)}
        options={[{ id: "body", label: t("progress.segBody") }, { id: "habits", label: t("progress.segHabits") }, { id: "gym", label: t("tab.gym") }]} />
      {seg.value === "body" && <Body />}
      {seg.value === "habits" && <Habits />}
      {seg.value === "gym" && <Gym />}
    </>
  );
}
