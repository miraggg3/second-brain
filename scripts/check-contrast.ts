// Checks every theme palette for readable color pairs (WCAG contrast ratio).
// Run: npm run contrast   (Node 22.18+ runs this TypeScript file directly)
//
// Thresholds:
//   4.5  body text and secondary text
//   3.0  accent / category colors used as bold text, icons and lines;
//        text on the accent; white text on category colors (bold UI labels)

import { PALETTES, type Palette } from "../src/themes.ts";

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

interface Check { what: string; ratio: number; min: number }

function checks(p: Palette): Check[] {
  const out: Check[] = [
    { what: "text / bg", ratio: contrast(p.text, p.bg), min: 4.5 },
    { what: "text / card", ratio: contrast(p.text, p.card), min: 4.5 },
    { what: "muted / card", ratio: contrast(p.muted, p.card), min: 4.5 },
    { what: "muted / bg", ratio: contrast(p.muted, p.bg), min: 4.5 },
    { what: "accent / card", ratio: contrast(p.accent, p.card), min: 3 },
    { what: "onAccent / accent", ratio: contrast(p.onAccent, p.accent), min: 4.5 },
    { what: "onAccent / accent2", ratio: contrast(p.onAccent, p.accent2), min: 3 },
  ];
  for (const [k, c] of Object.entries(p.cats)) {
    out.push({ what: `${k} / card`, ratio: contrast(c, p.card), min: 3 });
    out.push({ what: `white / ${k}`, ratio: contrast("#FFFFFF", c), min: 3 });
  }
  return out;
}

let failed = 0;
for (const [id, p] of Object.entries(PALETTES)) {
  const bad = checks(p).filter((c) => c.ratio < c.min);
  failed += bad.length;
  const line = bad.length
    ? bad.map((c) => `${c.what} ${c.ratio.toFixed(2)} < ${c.min}`).join("; ")
    : "ok";
  console.log(`${id.padEnd(9)} ${line}`);
}
if (failed) {
  console.error(`\n${failed} pair(s) below the threshold`);
  process.exit(1);
}
