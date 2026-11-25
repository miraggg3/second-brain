// Clean pictures for sharing: one summary card per tracker (title, big
// number, small chart, streak), drawn on purpose, not a screenshot of the
// screen. Two formats: square for chats, 9:16 for stories.
//
// Elements that can be shared carry data-share="<kind>[:<id>]"; specFor()
// turns that into what the card shows, using the app data.

import { render } from "preact";
import { data } from "./store";
import type { DayValues } from "./types";
import { MOODS } from "./screens/Today";
import { duration, finishedWorkouts, habitStreak, setCount, volumeOf, weekStreak, workoutsSince } from "./domain";
import { dayKey, daysAgo, num, plural, startOfWeek } from "./utils";

export type ShareFormat = "square" | "story";

export interface ShareSpec {
  emoji: string;
  color: string;           // CSS color of this tracker
  title: string;
  value: string;
  unit?: string;
  sub?: string;
  series?: (number | null)[]; // oldest → newest
  seriesLabel?: string;
  badge?: string;
  lines?: string[];
}

const BOT: string = (import.meta.env.VITE_BOT_USERNAME ?? "").replace(/^@/, "");

// ---------- data → card ----------

const days = (n: number, map: DayValues) => Array.from({ length: n }, (_, i) => map[dayKey(daysAgo(n - 1 - i))] ?? null);

function goalStreak(map: DayValues, goal: number): number {
  let n = 0;
  let i = (map[dayKey()] ?? 0) >= goal ? 0 : 1;
  while ((map[dayKey(daysAgo(i))] ?? 0) >= goal) {
    n++;
    i++;
  }
  return n;
}

const streakBadge = (n: number, what = "подряд") => (n > 1 ? `🔥 ${n} ${plural(n, "день", "дня", "дней")} ${what}` : undefined);

export function specFor(key: string): ShareSpec | null {
  const d = data.value;
  const [kind, id] = key.split(/:(.*)/s) as [string, string | undefined];
  const today = dayKey();

  if (kind === "day") {
    const done = d.habits.filter((h) => h.done[today]).length;
    const water = d.metrics.water[today] ?? 0;
    const sleep = d.metrics.sleep[today];
    return {
      emoji: "☀️", color: "var(--accent)", title: "Мой день",
      value: d.habits.length ? `${done}/${d.habits.length}` : num(water / 1000, 2),
      unit: d.habits.length ? "привычек" : "л воды",
      lines: [
        `💧 Вода: ${num(water / 1000, 2)} из ${num((d.settings.waterGoal || 2000) / 1000, 1)} л`,
        `🌙 Сон: ${sleep != null ? `${num(sleep)} ч` : "—"}`,
        ...(d.habits.length ? [`✅ Привычки: ${done} из ${d.habits.length}`] : []),
      ],
    };
  }

  if (kind === "metric") {
    const goal = d.settings.waterGoal || 2000;
    if (id === "water") {
      const w = d.metrics.water[today] ?? 0;
      return {
        emoji: "💧", color: "var(--c-water)", title: "Вода",
        value: num(w / 1000, 2), unit: "л",
        sub: `из ${num(goal / 1000, 1)} л · ${Math.round((w / goal) * 100)}%`,
        series: days(14, d.metrics.water), seriesLabel: "14 дней",
        badge: streakBadge(goalStreak(d.metrics.water, goal), "в цели"),
      };
    }
    if (id === "sleep") {
      const s = days(7, d.metrics.sleep).filter((v): v is number => v != null);
      const avg = s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
      return {
        emoji: "🌙", color: "var(--c-sleep)", title: "Сон",
        value: d.metrics.sleep[today] != null ? num(d.metrics.sleep[today]!) : avg != null ? num(avg) : "—", unit: "ч",
        sub: avg != null ? `в среднем за неделю ${num(avg)} ч` : undefined,
        series: days(14, d.metrics.sleep), seriesLabel: "14 дней",
        badge: streakBadge(goalStreak(d.metrics.sleep, 7), "сплю 7+ часов"),
      };
    }
    if (id === "weight") {
      const series = days(30, d.metrics.weight);
      const known = series.filter((v): v is number => v != null);
      const change = known.length > 1 ? known[known.length - 1]! - known[0]! : null;
      return {
        emoji: "⚖️", color: "var(--c-weight)", title: "Вес",
        value: known.length ? num(known[known.length - 1]!) : "—", unit: "кг",
        sub: change != null ? `${change > 0 ? "+" : change < 0 ? "−" : "±"}${num(Math.abs(change))} кг за месяц` : undefined,
        series, seriesLabel: "30 дней",
      };
    }
    if (id === "mood") {
      const m = d.metrics.mood[today];
      const mood = m ? MOODS[m - 1] : null;
      return {
        emoji: mood?.emoji ?? "🙂", color: "var(--c-mood)", title: "Настроение",
        value: mood?.label ?? "—", series: days(14, d.metrics.mood), seriesLabel: "14 дней",
      };
    }
  }

  if (kind === "habit") {
    const h = d.habits.find((x) => x.id === id);
    if (!h) return null;
    const streak = habitStreak(h);
    const last14 = Array.from({ length: 14 }, (_, i) => (h.done[dayKey(daysAgo(13 - i))] ? 1 : 0));
    const count = last14.filter(Boolean).length;
    return {
      emoji: h.emoji || "✨", color: "var(--accent)", title: h.name,
      value: String(streak), unit: `${plural(streak, "день", "дня", "дней")} подряд`,
      sub: `выполнено ${count} из 14 дней`,
      series: last14, seriesLabel: "14 дней",
    };
  }

  if (kind === "habits") {
    const done = d.habits.filter((h) => h.done[today]).length;
    const top = [...d.habits].sort((a, b) => habitStreak(b) - habitStreak(a)).slice(0, 4);
    return {
      emoji: "✅", color: "var(--accent)", title: "Привычки",
      value: `${done}/${d.habits.length}`, unit: "сегодня",
      lines: top.map((h) => `${h.emoji || "✨"} ${h.name}: ${habitStreak(h)} 🔥`),
    };
  }

  if (kind === "tracker") {
    const tr = d.trackers.find((x) => x.id === id);
    if (!tr) return null;
    const series = days(14, tr.values);
    const lastKnown = [...series].reverse().find((v) => v != null);
    return {
      emoji: "📈", color: "var(--accent)", title: tr.name,
      value: lastKnown != null ? num(lastKnown) : "—", unit: tr.unit,
      series, seriesLabel: "14 дней",
    };
  }

  if (kind === "gym") {
    const ws = d.workouts;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const streak = weekStreak(ws);
    const month = workoutsSince(ws, monthStart).length;
    const week = workoutsSince(ws, startOfWeek()).length;
    const weeks = Array.from({ length: 12 }, (_, i) => {
      const from = startOfWeek(daysAgo((11 - i) * 7)).getTime();
      const to = from + 7 * 86_400_000;
      return finishedWorkouts(ws).filter((w) => w.start >= from && w.start < to).length;
    });
    return {
      emoji: "🏋️", color: "var(--c-gym)", title: "Зал",
      value: String(streak), unit: `${plural(streak, "неделя", "недели", "недель")} подряд`,
      sub: `${month} ${plural(month, "тренировка", "тренировки", "тренировок")} за месяц · ${week} на неделе`,
      series: weeks, seriesLabel: "12 недель",
    };
  }

  if (kind === "workout") {
    const w = d.workouts.find((x) => x.id === id);
    if (!w) return null;
    const sets = setCount(w);
    return {
      emoji: "🏋️", color: "var(--c-gym)",
      title: `Тренировка ${new Date(w.start).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`,
      value: num(volumeOf(w), 0), unit: "кг",
      sub: `тоннаж · ${duration((w.end ?? w.start) - w.start)} · ${sets} ${plural(sets, "подход", "подхода", "подходов")}`,
      lines: w.items.slice(0, 5).map((it) => `${it.name} · ${it.sets.map((s) => `${num(s.w)}×${s.r}`).join(", ")}`),
    };
  }

  return null;
}

// ---------- card ----------

function Bars({ series, height }: { series: (number | null)[]; height: number }) {
  const max = Math.max(1, ...series.map((v) => v ?? 0));
  const n = series.length;
  const gap = 4;
  const w = (300 - gap * (n - 1)) / n;
  return (
    <svg class="sa-bars" viewBox={`0 0 300 ${height}`} width="100%" height={height} aria-hidden="true">
      {series.map((v, i) => {
        const h = v ? Math.max(4, (v / max) * height) : 4;
        return <rect key={i} x={i * (w + gap)} y={height - h} width={w} height={h} rx={Math.min(4, w / 2)}
          class={v ? (i === n - 1 ? "on last" : "on") : "off"} />;
      })}
    </svg>
  );
}

function ShareArt({ spec, format }: { spec: ShareSpec; format: ShareFormat }) {
  const story = format === "story";
  return (
    <div class={`share-art ${format}`} style={{ "--c": spec.color }}>
      <div class="sa-card">
        <div class="sa-head">
          <span class="sa-emoji">{spec.emoji}</span>
          <b>{spec.title}</b>
        </div>
        <div class="sa-value">
          {spec.value}{spec.unit && <small> {spec.unit}</small>}
        </div>
        {spec.sub && <p class="sa-sub">{spec.sub}</p>}
        {spec.series && spec.series.length > 1 && (
          <div class="sa-chart">
            <Bars series={spec.series} height={story ? 150 : 64} />
            {spec.seriesLabel && <small>{spec.seriesLabel}</small>}
          </div>
        )}
        {spec.lines && spec.lines.length > 0 && <ul class="sa-lines">{spec.lines.map((l) => <li key={l}>{l}</li>)}</ul>}
        {spec.badge && <span class="sa-badge">{spec.badge}</span>}
      </div>
      <div class="sa-foot">
        <b>🧠 Второй мозг</b>
        {BOT && <span>t.me/{BOT}</span>}
      </div>
    </div>
  );
}

// Renders the card off-screen and returns the root element; call the
// returned cleanup when the picture is taken.
export async function mountShareArt(spec: ShareSpec, format: ShareFormat): Promise<{ el: HTMLElement; done: () => void }> {
  const host = document.createElement("div");
  host.className = "share-art-host";
  document.body.append(host);
  render(<ShareArt spec={spec} format={format} />, host);
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  return {
    el: host.firstElementChild as HTMLElement,
    done: () => {
      render(null, host);
      host.remove();
    },
  };
}
