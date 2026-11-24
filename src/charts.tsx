// Smooth SVG charts, no libraries.

import { dayKey, daysAgo, num, startOfWeek } from "./utils";
import { Empty } from "./ui";

const W = 320;
const H = 140;
let gradSeq = 0;

export interface Point {
  label: string;
  value: number;
}

// Catmull-Rom spline through the points -> smooth cubic bezier path
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 3) return pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export function LineChart({ points, unit = "", digits = 1, color = "var(--accent)" }:
  { points: Point[]; unit?: string; digits?: number; color?: string }) {
  if (points.length < 2) return <Empty>Нужно хотя бы 2 записи, чтобы построить график</Empty>;
  const gid = `g${++gradSeq}`;
  const padX = 6, top = 26, bottom = 22;
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  const spread = max - min || 1;
  min -= spread * 0.15;
  max += spread * 0.15;
  const x = (i: number) => padX + (i * (W - 2 * padX)) / (points.length - 1);
  const y = (v: number) => top + ((max - v) * (H - top - bottom)) / (max - min);
  const pts = points.map((p, i) => [x(i), y(p.value)] as [number, number]);
  const line = smoothPath(pts);
  const last = pts[pts.length - 1]!;
  const first = points[0]!, lastP = points[points.length - 1]!;
  const delta = lastP.value - first.value;

  return (
    <div class="chart-box">
      <div class="chart-top">
        <b>{num(lastP.value, digits)}<small>{unit}</small></b>
        {delta !== 0 && <span class={`delta ${delta > 0 ? "up" : "down"}`}>{delta > 0 ? "+" : "−"}{num(Math.abs(delta), digits)}</span>}
      </div>
      <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" style={{ color }}>
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="currentColor" stop-opacity="0.28" />
            <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${last[0]},${H - bottom} L${pts[0]![0]},${H - bottom} Z`} fill={`url(#${gid})`} />
        <path class="line" d={line} />
        <circle cx={last[0]} cy={last[1]} r="6" class="dot-halo" />
        <circle cx={last[0]} cy={last[1]} r="3.5" class="dot" />
        <text class="axis" x={padX} y={H - 4}>{first.label}</text>
        <text class="axis" x={W - padX} y={H - 4} text-anchor="end">{lastP.label}</text>
      </svg>
    </div>
  );
}

export function BarChart({ points, unit = "", goal, digits = 1, color = "var(--accent)" }:
  { points: Point[]; unit?: string; goal?: number; digits?: number; color?: string }) {
  const filled = points.filter((p) => p.value > 0);
  if (!filled.length) return <Empty>Пока нет записей за этот период</Empty>;
  const avg = filled.reduce((s, p) => s + p.value, 0) / filled.length;
  const top = 10, bottom = 20;
  const max = Math.max(goal ?? 0, ...points.map((p) => p.value));
  const slot = W / points.length;
  const h = (v: number) => (v * (H - top - bottom)) / max;
  const base = H - bottom;

  return (
    <div class="chart-box">
      <div class="chart-top">
        <b>{num(avg, digits)}<small>{unit}</small></b>
        <span class="muted">в среднем</span>
      </div>
      <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" style={{ color }}>
        {goal ? <line class="goal" x1={0} x2={W} y1={base - h(goal)} y2={base - h(goal)} /> : null}
        {points.map((p, i) => {
          const bw = Math.min(14, slot * 0.56);
          const bx = i * slot + (slot - bw) / 2;
          const bh = Math.max(p.value > 0 ? 4 : 0, h(p.value));
          return (
            <g key={i}>
              <rect class="bar-bg" x={bx} y={top} width={bw} height={base - top} rx={bw / 2} />
              {p.value > 0 && <rect class="bar" x={bx} y={base - bh} width={bw} height={bh} rx={bw / 2} />}
              {(i % 2 === points.length % 2 || points.length <= 8) && (
                <text class="axis" x={bx + bw / 2} y={H - 4} text-anchor="middle">{p.label}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Activity grid, weeks as columns. levelOf(dayKey) -> 0..3
export function Heatmap({ levelOf, weeks = 17, color = "var(--accent)" }:
  { levelOf: (day: string) => number; weeks?: number; color?: string }) {
  const start = startOfWeek(daysAgo((weeks - 1) * 7));
  const today = dayKey();
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKey(d);
    cells.push(<i key={key} class={key > today ? "future" : `l${levelOf(key)}`} title={key} />);
  }
  return (
    <div class="heatmap" style={{ "--weeks": weeks, color }}>
      {cells}
    </div>
  );
}
