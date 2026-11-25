// Clean pictures for sharing: one summary card per tracker, note or folder
// (title, big number or text, small chart, streak), drawn on purpose, not a
// screenshot of the screen. Two formats: square for chats, 9:16 for stories.
//
// Elements that can be shared carry data-share="<kind>[:<id>]"; specFor()
// turns that into what the card shows, using the app data. Every card has to
// look finished with any data: long names wrap, big values shrink to fit,
// empty history shows a friendly line instead of an empty chart.

import { render } from "preact";
import { data } from "./store";
import type { DayValues } from "./types";
import { MOODS } from "./screens/Today";
import { tagsOf, titleOf } from "./screens/Notes";
import { duration, finishedWorkouts, habitStreak, setCount, volumeOf, weekStreak, workoutsSince } from "./domain";
import { dayKey, daysAgo, num, startOfWeek } from "./utils";
import { locale, t, type Key } from "./i18n";

export type ShareFormat = "square" | "story";

export interface ShareSpec {
  emoji: string;
  color: string;           // CSS color of this tracker
  title: string;
  value?: string;
  unit?: string;
  sub?: string;
  series?: (number | null)[]; // oldest → newest
  chart?: "bars" | "line";    // bars: amounts per day, line: a level that changes (weight, mood)
  seriesLabel?: string;
  badge?: string;
  lines?: string[];
  more?: string;              // "и ещё 3", when lines were cut
  text?: string;              // note body
  tags?: string[];
  big?: boolean;              // one-line note: text in large type
  empty?: string;            // shown instead of the chart when there is no history yet
}

const BOT: string = (import.meta.env.VITE_BOT_USERNAME ?? "").replace(/^@/, "");

// ---------- data → card ----------

const days = (n: number, map: DayValues) => Array.from({ length: n }, (_, i) => map[dayKey(daysAgo(n - 1 - i))] ?? null);
const hasHistory = (s: (number | null)[]) => s.some((v) => v != null && v > 0);

function goalStreak(map: DayValues, goal: number): number {
  let n = 0;
  let i = (map[dayKey()] ?? 0) >= goal ? 0 : 1;
  while ((map[dayKey(daysAgo(i))] ?? 0) >= goal) {
    n++;
    i++;
  }
  return n;
}

const streakBadge = (n: number, what: Key = "share.streakRow") => (n > 1 ? t(what, { n }) : undefined);

function cut(lines: string[], max: number): { lines: string[]; more?: string } {
  if (lines.length <= max) return { lines };
  const rest = lines.length - (max - 1);
  return { lines: lines.slice(0, max - 1), more: t("share.more", { n: rest }) };
}

export function specFor(key: string): ShareSpec | null {
  const d = data.value;
  const [kind, id] = key.split(/:(.*)/s) as [string, string | undefined];
  const today = dayKey();

  if (kind === "day") {
    const done = d.habits.filter((h) => h.done[today]).length;
    const water = d.metrics.water[today] ?? 0;
    const sleep = d.metrics.sleep[today];
    const mood = d.metrics.mood[today];
    return {
      emoji: "☀️", color: "var(--accent)", title: t("share.myDay"),
      value: d.habits.length ? `${done}/${d.habits.length}` : num(water / 1000, 2),
      unit: d.habits.length ? t("share.habitsUnit", { n: d.habits.length }) : t("share.waterUnit"),
      lines: [
        t("share.lineWater", { v: num(water / 1000, 2), goal: num((d.settings.waterGoal || 2000) / 1000, 1) }),
        sleep != null ? t("share.lineSleep", { v: num(sleep) }) : t("share.lineSleepNone"),
        ...(mood ? [t("share.lineMood", { emoji: MOODS[mood - 1]!.emoji, mood: MOODS[mood - 1]!.label.toLowerCase() })] : []),
        ...(d.habits.length ? [t("share.lineHabits", { done, total: d.habits.length })] : []),
      ],
    };
  }

  if (kind === "metric") {
    const goal = d.settings.waterGoal || 2000;
    if (id === "water") {
      const w = d.metrics.water[today] ?? 0;
      return {
        emoji: "💧", color: "var(--c-water)", title: t("share.water"),
        value: num(w / 1000, 2), unit: t("unit.l"),
        sub: t("share.waterSub", { goal: num(goal / 1000, 1), pct: Math.round((w / goal) * 100) }),
        series: days(14, d.metrics.water), seriesLabel: t("days", { n: 14 }), empty: t("share.waterEmpty"),
        badge: streakBadge(goalStreak(d.metrics.water, goal), "share.streakGoal"),
      };
    }
    if (id === "sleep") {
      const week = days(7, d.metrics.sleep).filter((v): v is number => v != null);
      const avg = week.length ? week.reduce((a, b) => a + b, 0) / week.length : null;
      const now = d.metrics.sleep[today];
      return {
        emoji: "🌙", color: "var(--c-sleep)", title: t("share.sleep"),
        value: now != null ? num(now) : avg != null ? num(avg) : "0", unit: t("unit.h"),
        sub: avg != null ? t("share.sleepAvg", { v: num(avg) }) : t("common.today"),
        series: days(14, d.metrics.sleep), seriesLabel: t("days", { n: 14 }), empty: t("share.sleepEmpty"),
        badge: streakBadge(goalStreak(d.metrics.sleep, 7), "share.streakSleep"),
      };
    }
    if (id === "weight") {
      const series = days(30, d.metrics.weight);
      const known = series.filter((v): v is number => v != null);
      const change = known.length > 1 ? known[known.length - 1]! - known[0]! : null;
      return {
        emoji: "⚖️", color: "var(--c-weight)", title: t("share.weight"),
        value: known.length ? num(known[known.length - 1]!) : "—", unit: t("unit.kg"),
        sub: change != null
          ? t("share.weightChange", { v: `${change > 0 ? "+" : change < 0 ? "−" : "±"}${num(Math.abs(change))}` })
          : t("share.perMonth"),
        series, chart: "line", seriesLabel: t("days", { n: 30 }), empty: t("share.weightEmpty"),
      };
    }
    if (id === "mood") {
      const m = d.metrics.mood[today];
      const mood = m ? MOODS[m - 1] : null;
      const series = days(14, d.metrics.mood);
      const known = series.filter((v): v is number => v != null);
      const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
      return {
        emoji: mood?.emoji ?? "🙂", color: "var(--c-mood)", title: t("share.mood"),
        value: mood?.label ?? "—",
        sub: avg != null ? t("share.moodAvg", { mood: MOODS[Math.round(avg) - 1]!.label.toLowerCase() }) : undefined,
        series, chart: "line", seriesLabel: t("days", { n: 14 }), empty: t("share.moodEmpty"),
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
      value: String(streak), unit: t("share.daysInRow", { n: streak }),
      sub: count ? t("share.habitDone", { n: count }) : t("share.habitStart"),
      series: last14, seriesLabel: t("days", { n: 14 }), empty: t("share.habitEmpty"),
    };
  }

  if (kind === "habits") {
    const done = d.habits.filter((h) => h.done[today]).length;
    const top = [...d.habits].sort((a, b) => habitStreak(b) - habitStreak(a));
    return {
      emoji: "✅", color: "var(--accent)", title: t("share.habits"),
      value: `${done}/${d.habits.length}`, unit: t("common.today"),
      ...cut(top.map((h) => `${h.emoji || "✨"} ${h.name} · ${habitStreak(h)} 🔥`), 5),
    };
  }

  if (kind === "tracker") {
    const tr = d.trackers.find((x) => x.id === id);
    if (!tr) return null;
    const series = days(14, tr.values);
    const total = series.reduce<number>((s, v) => s + (v ?? 0), 0);
    return {
      emoji: "📈", color: "var(--accent)", title: tr.name,
      value: num(tr.values[today] ?? 0), unit: tr.unit,
      sub: total ? t("share.trackerSub", { v: num(total), unit: tr.unit }) : t("common.today"),
      series, seriesLabel: t("days", { n: 14 }), empty: t("share.trackerEmpty"),
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
      emoji: "🏋️", color: "var(--c-gym)", title: t("tab.gym"),
      value: String(streak), unit: t("share.weeksInRow", { n: streak }),
      sub: `${t("share.workoutsMonth", { n: month })} · ${t("share.onWeek", { n: week })}`,
      series: weeks, seriesLabel: t("weeks", { n: 12 }), empty: t("share.gymEmpty"),
    };
  }

  if (kind === "workout") {
    const w = d.workouts.find((x) => x.id === id);
    if (!w) return null;
    const sets = setCount(w);
    return {
      emoji: "🏋️", color: "var(--c-gym)",
      title: t("share.workoutTitle", { date: new Date(w.start).toLocaleDateString(locale.value, { day: "numeric", month: "long" }) }),
      value: num(volumeOf(w), 0), unit: t("unit.kg"),
      sub: t("share.workoutSub", { n: sets, dur: duration((w.end ?? w.start) - w.start) }),
      ...cut(w.items.map((it) => `${it.name} · ${it.sets.map((s) => (s.w ? `${num(s.w)}×${s.r}` : String(s.r))).join("  ")}`), 6),
    };
  }

  if (kind === "note") {
    const n = d.notes.find((x) => x.id === id);
    if (!n) return null;
    const folder = n.folder ? d.folders.find((f) => f.id === n.folder) : undefined;
    const noTags = (t: string) => t.replace(/#[\p{L}\p{N}_-]+/gu, "").replace(/[ \t]+$/gm, "").trim();
    const title = noTags(titleOf(n.text));
    const body = noTags(n.text.trim().split("\n").slice(1).join("\n"));
    return {
      emoji: "📝", color: "var(--accent)",
      // a one-line note: that line is the content, shown large
      title: body ? title || t("share.note") : t("share.note"),
      sub: folder ? `📁 ${folder.name}` : undefined,
      text: body || title, big: !body,
      tags: tagsOf(n.text).slice(0, 4),
    };
  }

  if (kind === "folder") {
    const f = d.folders.find((x) => x.id === id);
    if (!f) return null;
    const notes = d.notes.filter((n) => n.folder === f.id);
    return {
      emoji: "📁", color: "var(--accent)", title: f.name,
      value: String(notes.length), unit: t("share.notesUnit", { n: notes.length }),
      ...cut(notes.map((n) => `📝 ${titleOf(n.text)}`), 6),
      sub: notes.length ? undefined : t("share.folderEmpty"),
    };
  }

  return null;
}

// ---------- card ----------

function Bars({ series, height }: { series: (number | null)[]; height: number }) {
  const max = Math.max(1, ...series.map((v) => v ?? 0));
  const n = series.length;
  const gap = n > 20 ? 3 : 5;
  const w = (300 - gap * (n - 1)) / n;
  return (
    <svg class="sa-bars" viewBox={`0 0 300 ${height}`} width="100%" height={height} aria-hidden="true">
      {series.map((v, i) => {
        const h = v ? Math.max(6, (v / max) * height) : 6;
        return <rect key={i} x={i * (w + gap)} y={height - h} width={w} height={h} rx={Math.min(5, w / 2)}
          class={v ? (i === n - 1 ? "on last" : "on") : "off"} />;
      })}
    </svg>
  );
}

// A level over time: only days with a value, scaled between their min and max.
function Line({ series, height }: { series: (number | null)[]; height: number }) {
  const pts = series.map((v, i) => (v == null ? null : { i, v })).filter((p): p is { i: number; v: number } => !!p);
  const vals = pts.map((p) => p.v);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (max - min < 1e-9) { min -= 1; max += 1; }
  const pad = 8;
  const x = (i: number) => pad + (i * (300 - pad * 2)) / Math.max(1, series.length - 1);
  const y = (v: number) => pad + ((max - v) * (height - pad * 2)) / (max - min);
  const path = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1]!;
  return (
    <svg class="sa-line" viewBox={`0 0 300 ${height}`} width="100%" height={height} aria-hidden="true">
      <path d={`${path} L${x(last.i).toFixed(1)},${height} L${x(pts[0]!.i).toFixed(1)},${height} Z`} class="fill" />
      <path d={path} class="stroke" />
      {pts.map((p) => <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={p === last ? 6 : 3.5} class={p === last ? "dot last" : "dot"} />)}
    </svg>
  );
}

function Chart({ spec, story }: { spec: ShareSpec; story: boolean }) {
  const series = spec.series ?? [];
  const height = story ? 190 : spec.badge ? 46 : 70;
  const enough = spec.chart === "line" ? series.filter((v) => v != null).length >= 2 : hasHistory(series);
  if (!enough) return spec.empty ? <p class="sa-empty">{spec.empty}</p> : null;
  return (
    <div class="sa-chart">
      {spec.chart === "line" ? <Line series={series} height={height} /> : <Bars series={series} height={height} />}
      {spec.seriesLabel && <small>{spec.seriesLabel}</small>}
    </div>
  );
}

// big numbers shrink so long values ("Нормально", "12 345") always fit
function valueSize(spec: ShareSpec): string {
  const len = (spec.value ?? "").length;
  if (len <= 3) return "xl";
  if (len <= 5) return "l";
  if (len <= 8) return "m";
  return "s";
}

function ShareArt({ spec, format }: { spec: ShareSpec; format: ShareFormat }) {
  const story = format === "story";
  const isNote = spec.text != null;
  const date = new Date().toLocaleDateString(locale.value, { day: "numeric", month: "long" });
  return (
    <div class={`share-art ${format} ${isNote ? "sa-note" : ""}`} style={{ "--c": spec.color }}>
      {story && <p class="sa-date">{date}</p>}
      <div class="sa-card">
        <div class="sa-head">
          <span class="sa-emoji">{spec.emoji}</span>
          <b>{spec.title}</b>
        </div>
        {spec.value != null && (
          <div class={`sa-value ${valueSize(spec)}`}>
            {spec.value}{spec.unit && <small> {spec.unit}</small>}
          </div>
        )}
        {spec.sub && <p class="sa-sub">{spec.sub}</p>}
        {isNote && spec.text && <p class={`sa-text ${spec.big ? "big" : ""}`}>{spec.text}</p>}
        {spec.tags && spec.tags.length > 0 && (
          <div class="sa-tags">{spec.tags.map((t) => <span key={t}>#{t}</span>)}</div>
        )}
        {spec.series && <Chart spec={spec} story={story} />}
        {spec.lines && spec.lines.length > 0 && (
          <ul class="sa-lines">
            {spec.lines.map((l) => <li key={l}>{l}</li>)}
            {spec.more && <li class="sa-more">{spec.more}</li>}
          </ul>
        )}
        {spec.badge && <span class="sa-badge">{spec.badge}</span>}
      </div>
      <div class="sa-foot">
        <b>🧠 {t("share.app")}</b>
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
  await document.fonts?.ready;
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  return {
    el: host.firstElementChild as HTMLElement,
    done: () => {
      render(null, host);
      host.remove();
    },
  };
}
