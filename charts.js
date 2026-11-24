// Tiny SVG charts, no libraries. Every function returns an HTML string.

const CHART_W = 320;
const CHART_H = 140;

// points: [{ label, value }] in time order
function lineChart(points, { unit = "", digits = 1 } = {}) {
  if (points.length < 2) return `<p class="hint">Нужно хотя бы 2 записи, чтобы построить график</p>`;
  const pad = 10, top = 16, bottom = 22;
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const x = (i) => pad + (i * (CHART_W - 2 * pad)) / (points.length - 1);
  const y = (v) => top + ((max - v) * (CHART_H - top - bottom)) / (max - min);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${CHART_H - bottom} L${x(0).toFixed(1)},${CHART_H - bottom} Z`;
  const last = points[points.length - 1];
  const lx = x(points.length - 1), ly = y(last.value);
  return `
  <svg class="chart" viewBox="0 0 ${CHART_W} ${CHART_H}" role="img">
    <line class="grid" x1="${pad}" x2="${CHART_W - pad}" y1="${top}" y2="${top}"/>
    <line class="grid" x1="${pad}" x2="${CHART_W - pad}" y1="${CHART_H - bottom}" y2="${CHART_H - bottom}"/>
    <path class="area" d="${area}"/>
    <path class="line" d="${line}"/>
    <circle class="dot" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4"/>
    <text class="axis" x="${pad}" y="${top - 4}">${num(max, digits)}${esc(unit)}</text>
    <text class="axis" x="${pad}" y="${CHART_H - bottom + 14}">${esc(points[0].label)}</text>
    <text class="axis" x="${CHART_W - pad}" y="${CHART_H - bottom + 14}" text-anchor="end">${esc(last.label)}</text>
    <text class="value" x="${Math.min(lx, CHART_W - pad)}" y="${Math.max(ly - 8, 12)}" text-anchor="end">${num(last.value, digits)}${esc(unit)}</text>
  </svg>`;
}

// points: [{ label, value }]; value 0 draws an empty slot. goal draws a dashed line.
function barChart(points, { unit = "", goal = null, digits = 1 } = {}) {
  if (!points.some((p) => p.value > 0)) return `<p class="hint">Пока нет записей за этот период</p>`;
  const pad = 6, top = 16, bottom = 20;
  const max = Math.max(goal || 0, ...points.map((p) => p.value));
  const slot = (CHART_W - 2 * pad) / points.length;
  const h = (v) => (v * (CHART_H - top - bottom)) / max;
  const bars = points.map((p, i) => {
    const bh = h(p.value);
    const bx = pad + i * slot + slot * 0.15;
    return `<rect class="bar" x="${bx.toFixed(1)}" y="${(CHART_H - bottom - bh).toFixed(1)}"
      width="${(slot * 0.7).toFixed(1)}" height="${bh.toFixed(1)}" rx="3"/>
      <text class="axis" x="${(bx + slot * 0.35).toFixed(1)}" y="${CHART_H - 6}" text-anchor="middle">${esc(p.label)}</text>`;
  }).join("");
  const goalLine = goal
    ? `<line class="goal" x1="${pad}" x2="${CHART_W - pad}" y1="${CHART_H - bottom - h(goal)}" y2="${CHART_H - bottom - h(goal)}"/>`
    : "";
  return `
  <svg class="chart" viewBox="0 0 ${CHART_W} ${CHART_H}" role="img">
    ${bars}${goalLine}
    <text class="axis" x="${pad}" y="${top - 4}">${num(max, digits)}${esc(unit)}</text>
  </svg>`;
}

// GitHub-style activity grid. levelOf(dayKey) -> 0..3
function heatmap(levelOf, weeks = 15) {
  const start = startOfWeek(daysAgo((weeks - 1) * 7));
  const today = dayKey();
  let cells = "";
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKey(d);
    const cls = key > today ? "future" : "l" + levelOf(key);
    cells += `<i class="${cls}" title="${key}"></i>`;
  }
  return `<div class="heatmap" style="--weeks:${weeks}">${cells}</div>`;
}

// Short label for a day: "24.11"
function shortDay(d) {
  return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}
