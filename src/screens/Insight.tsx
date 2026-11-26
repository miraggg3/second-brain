// Details behind any chart in "Прогресс": pick a period, see average / min /
// max (and what matters for this tracker), tap the chart for a day's value,
// and scroll the day-by-day list of what was recorded.
//
// key: "metric:weight|sleep|water|mood", "tracker:<id>", "habit:<id>", "exercise:<name>"

import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { data } from "../store";
import type { DayValues } from "../types";
import { exerciseHistory, finishedWorkouts, habitStreak, setVolume } from "../domain";
import { dayKey, fromDayKey, lastDays, num, shortDay } from "../utils";
import { BarChart, LineChart, type Point } from "../charts";
import { Card, Empty, Icon, PageHead, Segmented, type IconName } from "../ui";
import { closeOverlay } from "../nav";
import { locale, t } from "../i18n";
import { MOODS } from "./Today";
import { FEELINGS, feelingLabel } from "../feelings";

type Range = "7" | "30" | "90" | "365";

const longDay = (d: Date | string) =>
  (typeof d === "string" ? fromDayKey(d) : d).toLocaleDateString(locale.value, { weekday: "short", day: "numeric", month: "long" });

interface Stat { value: string; label: string }
interface Row { day: string; title: string; value: string; note?: string }

interface View {
  title: string;
  icon: IconName;
  color: string;
  chart: "bar" | "line" | "none";
  points: Point[];
  unit: string;
  digits: number;
  goal?: number;
  summary?: "last" | "avg";
  stats: Stat[];
  rows: Row[];
  extra?: ComponentChildren;
}

const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function metricView(kind: "weight" | "sleep" | "water" | "mood", days: Date[]): View {
  const d = data.value;
  const map: DayValues = d.metrics[kind];
  const keys = days.map((x) => dayKey(x));
  const recorded = keys.filter((k) => map[k] != null);
  const vals = recorded.map((k) => map[k]!);
  const water = kind === "water";
  const scale = (v: number) => (water ? v / 1000 : v);
  const unit = kind === "weight" ? t("unit.kg") : kind === "sleep" ? t("unit.h") : water ? t("unit.l") : "";
  const fmt = (v: number) => kind === "mood"
    ? `${MOODS[Math.round(v) - 1]?.emoji ?? ""} ${MOODS[Math.round(v) - 1]?.label ?? ""}`
    : `${num(scale(v), water ? 2 : 1)} ${unit}`;

  const stats: Stat[] = vals.length ? [
    { value: kind === "mood" ? `${MOODS[Math.round(avgOf(vals)) - 1]?.emoji ?? ""} ${num(avgOf(vals))}` : num(scale(avgOf(vals)), water ? 2 : 1), label: t("insight.avg") },
    { value: kind === "mood" ? MOODS[Math.min(...vals) - 1]?.emoji ?? "" : num(scale(Math.min(...vals)), water ? 2 : 1), label: t("insight.min") },
    { value: kind === "mood" ? MOODS[Math.max(...vals) - 1]?.emoji ?? "" : num(scale(Math.max(...vals)), water ? 2 : 1), label: t("insight.max") },
  ] : [];
  if (water && vals.length) {
    const goal = d.settings.waterGoal || 2000;
    const n = vals.filter((v) => v >= goal).length;
    stats.push({ value: String(n), label: t("insight.goalDays", { n }) });
  } else if (kind === "sleep" && vals.length) {
    const n = vals.filter((v) => v >= 7).length;
    stats.push({ value: String(n), label: t("insight.nights7", { n }) });
  } else if (kind === "weight" && vals.length > 1) {
    const ch = vals[vals.length - 1]! - vals[0]!;
    stats.push({ value: `${ch > 0 ? "+" : ch < 0 ? "−" : ""}${num(Math.abs(ch))}`, label: t("insight.change") });
  } else if (vals.length) {
    stats.push({ value: String(vals.length), label: t("insight.records", { n: vals.length }) });
  }

  const feelingsOf = (k: string) => (d.feelings[k] ?? []).map((id) => FEELINGS.find((f) => f.id === id)?.emoji ?? "").join(" ");
  const rows: Row[] = [...recorded].reverse().map((k) => ({
    day: k, title: longDay(k), value: fmt(map[k]!),
    note: kind === "mood" ? feelingsOf(k) || undefined : undefined,
  }));

  let extra: ComponentChildren;
  if (kind === "mood") {
    const counts = new Map<string, number>();
    for (const k of keys) for (const id of d.feelings[k] ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (top.length) {
      extra = (
        <Card title={t("insight.topFeelings")} icon="heart">
          <div class="feel-stats">
            {top.map(([id, n]) => (
              <span key={id} class="feel-stat">
                <span class="feel-emoji">{FEELINGS.find((f) => f.id === id)?.emoji}</span>
                <span class="grow">{feelingLabel(id)}</span>
                <b>{n}</b>
              </span>
            ))}
          </div>
        </Card>
      );
    }
  }

  const line = kind === "weight" || kind === "mood";
  return {
    title: t(`today.${kind}` as const),
    icon: kind === "weight" ? "scale" : kind === "sleep" ? "moon" : water ? "drop" : "smile",
    color: `var(--c-${kind})`,
    chart: line ? "line" : "bar",
    points: line
      ? recorded.map((k) => ({ label: shortDay(k), full: longDay(k), value: map[k]!, text: fmt(map[k]!) }))
      : days.map((x) => {
        const v = map[dayKey(x)] ?? 0;
        return { label: String(x.getDate()), full: longDay(x), value: scale(v), text: v ? fmt(v) : "—" };
      }),
    unit: ` ${unit}`,
    digits: water ? 2 : 1,
    goal: water ? (d.settings.waterGoal || 2000) / 1000 : kind === "sleep" ? 8 : undefined,
    summary: kind === "mood" ? "avg" : "last",
    stats,
    rows,
    extra,
  };
}

function trackerView(id: string, days: Date[]): View | null {
  const tr = data.value.trackers.find((x) => x.id === id);
  if (!tr) return null;
  const keys = days.map((x) => dayKey(x));
  const recorded = keys.filter((k) => tr.values[k] != null);
  const vals = recorded.map((k) => tr.values[k]!);
  const unit = tr.unit;
  return {
    title: tr.name, icon: "sparkle", color: "var(--accent)", chart: "bar",
    points: days.map((x) => ({ label: String(x.getDate()), full: longDay(x), value: tr.values[dayKey(x)] ?? 0 })),
    unit: unit ? ` ${unit}` : "", digits: 1,
    stats: vals.length ? [
      { value: num(vals.reduce((a, b) => a + b, 0)), label: t("insight.total") },
      { value: num(avgOf(vals)), label: t("insight.avg") },
      { value: num(Math.max(...vals)), label: t("insight.max") },
      { value: String(vals.length), label: t("insight.records", { n: vals.length }) },
    ] : [],
    rows: [...recorded].reverse().map((k) => ({ day: k, title: longDay(k), value: `${num(tr.values[k]!)} ${unit}` })),
  };
}

function habitView(id: string, days: Date[]): View | null {
  const h = data.value.habits.find((x) => x.id === id);
  if (!h) return null;
  const keys = days.map((x) => dayKey(x));
  const done = keys.filter((k) => h.done[k]).length;
  // longest run inside the period
  let best = 0, run = 0;
  for (const k of keys) { run = h.done[k] ? run + 1 : 0; best = Math.max(best, run); }
  return {
    title: `${h.emoji} ${h.name}`, icon: "flame", color: "var(--accent)", chart: "bar",
    points: days.map((x) => ({ label: String(x.getDate()), full: longDay(x), value: h.done[dayKey(x)] ? 1 : 0, text: h.done[dayKey(x)] ? `✅ ${t("insight.done")}` : `— ${t("insight.missed")}` })),
    unit: "", digits: 0,
    stats: [
      { value: `${Math.round((done / keys.length) * 100)}%`, label: t("insight.percent") },
      { value: String(done), label: t("insight.doneDays", { n: done }) },
      { value: String(habitStreak(h)), label: t("insight.streakNow") },
      { value: String(best), label: t("insight.bestStreak") },
    ],
    rows: [...keys].reverse().map((k) => ({ day: k, title: longDay(k), value: h.done[k] ? `✅ ${t("insight.done")}` : `— ${t("insight.missed")}` })),
  };
}

function exerciseView(name: string, days: Date[]): View | null {
  const from = days[0]!.getTime() - 12 * 3600_000;
  const ws = data.value.workouts;
  const hist = exerciseHistory(ws, name).filter((x) => x.date >= from);
  const sessions = finishedWorkouts(ws)
    .filter((w) => w.start >= from)
    .map((w) => ({ w, it: w.items.find((i) => i.name === name) }))
    .filter((x) => x.it && x.it.sets.length);
  const kg = t("unit.kg");
  return {
    title: name, icon: "trophy", color: "var(--c-gym)", chart: "line",
    points: hist.map((x) => ({ label: shortDay(x.date), full: longDay(new Date(x.date)), value: x.best1rm })),
    unit: ` ${kg}`, digits: 1,
    stats: hist.length ? [
      { value: num(Math.max(...hist.map((x) => x.best1rm))), label: t("insight.best1rm") },
      { value: num(Math.max(...hist.map((x) => x.maxW))), label: t("insight.maxWeight") },
      { value: String(hist.length), label: t("insight.workouts", { n: hist.length }) },
      { value: num(hist.reduce((s, x) => s + x.volume, 0), 0), label: t("insight.volume") },
    ] : [],
    rows: sessions.map(({ w, it }) => ({
      day: dayKey(w.start), title: longDay(new Date(w.start)),
      value: `${num(setVolume(it!.sets), 0)} ${kg}`,
      note: it!.sets.map((s) => `${num(s.w)}×${s.r}`).join("  "),
    })),
  };
}

export function Insight({ insightKey }: { insightKey: string }) {
  const [kind, id = ""] = insightKey.split(/:(.*)/s) as [string, string?];
  const [range, setRange] = useState<Range>(kind === "metric" && id === "weight" ? "90" : "30");
  const days = lastDays(Number(range));

  let v: View | null = null;
  if (kind === "metric" && (id === "weight" || id === "sleep" || id === "water" || id === "mood")) v = metricView(id, days);
  else if (kind === "tracker") v = trackerView(id, days);
  else if (kind === "habit") v = habitView(id, days);
  else if (kind === "exercise") v = exerciseView(id, days);

  return (
    <>
      <PageHead title={v?.title ?? ""} sub={t("tab.progress")} right={
        <button class="icon-btn round" aria-label={t("common.close")} onClick={closeOverlay}><Icon name="close" size={20} /></button>} />
      {!v ? <Card><Empty icon="progress">{t("insight.noData")}</Empty></Card> : (
        <>
          <Segmented value={range} onChange={setRange} options={[
            { id: "7", label: t("insight.range7") },
            { id: "30", label: t("insight.range30") },
            { id: "90", label: t("insight.range90") },
            { id: "365", label: t("insight.range365") },
          ]} />

          {v.stats.length > 0 && (
            <div class={`stat-row ${v.stats.length === 4 ? "four" : ""}`}>
              {v.stats.map((s) => <div key={s.label} class="stat"><b>{s.value}</b><small>{s.label}</small></div>)}
            </div>
          )}

          <Card icon={v.icon} title={v.title}>
            {v.chart === "line"
              ? <LineChart key={range} points={v.points} unit={v.unit} digits={v.digits} color={v.color} summary={v.summary} interactive />
              : <BarChart key={range} points={v.points} unit={v.unit} digits={v.digits} color={v.color} goal={v.goal} interactive />}
          </Card>

          {v.extra}

          <h2 class="section-title">{t("insight.byDay")}</h2>
          {v.rows.length ? (
            <div class="card list day-list">
              {v.rows.slice(0, 120).map((r) => (
                <div key={r.day + r.value} class="day-row">
                  <span class="grow">
                    <b>{r.title}</b>
                    {r.note && <small>{r.note}</small>}
                  </span>
                  <span class="day-value">{r.value}</span>
                </div>
              ))}
            </div>
          ) : <Card><Empty icon="today">{t("insight.noData")}</Empty></Card>}
        </>
      )}
    </>
  );
}
