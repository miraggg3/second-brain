import type { ComponentChildren } from "preact";
import { openOverlay } from "../nav";
import { isPremium } from "../store";
import { Icon } from "../ui";

// Page header: index stamp, big title, and the two corner buttons (Premium, Data).
export function Header({ idx, title, sub, extra }:
  { idx: string; title: string; sub?: string; extra?: ComponentChildren }) {
  return (
    <header class="head">
      <div class="head-title">
        <span class="idx">{idx}</span>
        <h1>{title}</h1>
        {sub && <p class="mono sub">{sub}</p>}
      </div>
      <div class="head-actions">
        {extra}
        <button
          class={`corner ${isPremium.value ? "gold" : ""}`}
          aria-label="Premium"
          onClick={() => openOverlay({ name: "premium" })}
        >
          <Icon name="star" />
        </button>
        <button class="corner" aria-label="Мои данные" onClick={() => openOverlay({ name: "data" })}>
          <Icon name="data" />
        </button>
      </div>
    </header>
  );
}
