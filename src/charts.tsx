// Ink-on-paper SVG charts, no libraries.

import { dayKey, daysAgo, num, startOfWeek } from "./utils";
import { Empty } from "./ui";

const W = 320;
const H = 150;

export interface Point {
  label: string;
  value: number;
}

export function LineChart({ points, unit = "", digits = 1 }: { points: Point[]; unit?: string; digits?: number }) {
  if (points.length < 2) return <Empty>Нужно хотя бы 2 записи, чтобы построить график</Empty>;
  const padX = 12, top = 22, bottom = 24;
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const x = (i: number) => padX + (i * (W - 2 * padX)) / (points.length - 1);
  const y = (v: number) => top + ((max - v) * (H - top - bottom)) / (max - min);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const lx = x(points.length - 1), ly = y(last.value);
  const showMarks = points.length <= 40;

  return (
    <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img">
      {[0, 0.5, 1].map((t) => {
        const gy = top + t * (H - top - bottom);
        return <line key={t} class="grid" x1={padX} x2={W - padX} y1={gy} y2={gy} />;
      })}
      <path class="ink" d={line} />
      {showMarks && points.slice(0, -1).map((p, i) => (
        <rect key={i} class="mark" x={x(i) - 2.5} y={y(p.value) - 2.5} width={5} height={5} />
      ))}
      <rect class="mark hot" x={lx - 4} y={ly - 4} width={8} height={8} />
      <text class="axis" x={padX} y={top - 8}>{num(max, digits)}{unit}</text>
      <text class="axis" x={padX} y={H - 6}>{points[0].label}</text>
      <text class="axis" x={W - padX} y={H - 6} text-anchor="end">{last.label}</text>
      <text class="val" x={W - padX} y={top - 8} text-anchor="end">
        {num(last.value, digits)}{unit}
      </text>
    </svg>
  );
}

export function BarChart({ points, unit = "", goal, digits = 1 }:
  { points: Point[]; unit?: string; goal?: number; digits?: number }) {
  if (!points.some((p) => p.value > 0)) return <Empty>Пока нет записей за этот период</Empty>;
  const padX = 6, top = 20, bottom = 20;
  const max = Math.max(goal ?? 0, ...points.map((p) => p.value));
  const slot = (W - 2 * padX) / points.length;
  const h = (v: number) => (v * (H - top - bottom)) / max;
  const base = H - bottom;

  return (
    <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img">
      <line class="grid" x1={padX} x2={W - padX} y1={base} y2={base} />
      {points.map((p, i) => {
        const bx = padX + i * slot + slot * 0.18;
        const bh = h(p.value);
        return (
          <g key={i}>
            <rect class={`bar ${goal && p.value >= goal ? "hit" : ""}`} x={bx} y={base - bh} width={slot * 0.64} height={bh} />
            <text class="axis" x={bx + slot * 0.32} y={H - 5} text-anchor="middle">{p.label}</text>
          </g>
        );
      })}
      {goal ? <line class="goal" x1={padX} x2={W - padX} y1={base - h(goal)} y2={base - h(goal)} /> : null}
      <text class="axis" x={padX} y={top - 7}>{num(max, digits)}{unit}</text>
    </svg>
  );
}

// Activity grid, weeks as columns. levelOf(dayKey) -> 0..3
export function Heatmap({ levelOf, weeks = 16 }: { levelOf: (day: string) => number; weeks?: number }) {
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
    <div class="heatmap" style={{ "--weeks": weeks }}>
      {cells}
    </div>
  );
}
