// "Оформление": theme and card-style pickers with live previews.

import { data, isPremium, update } from "../store";
import { PALETTES, STYLES, THEME_ORDER, themeIsPremium, themeName } from "../themes";
import { paletteOf } from "../theme";
import type { CardStyle, ThemeId } from "../types";
import { closeOverlay, openOverlay } from "../nav";
import { Icon, PageHead, toast } from "../ui";
import { haptic } from "../telegram";

// Light/dark switch, free for everyone. "Авто" follows Telegram.
const MODES: { id: ThemeId; label: string }[] = [
  { id: "auto", label: "Авто" },
  { id: "light", label: "Светлая" },
  { id: "dark", label: "Тёмная" },
];

export function ModeSwitch() {
  const theme = data.value.settings.theme;
  return (
    <div class="segmented mode-switch" role="radiogroup" aria-label="Тема">
      {MODES.map((m) => (
        <button key={m.id} role="radio" aria-checked={theme === m.id} class={theme === m.id ? "on" : ""}
          onClick={() => { haptic(); update("settings", (x) => ({ ...x, theme: m.id })); }}>
          {m.label}
        </button>
      ))}
    </div>
  );
}

function ThemeSwatch({ id }: { id: ThemeId }) {
  const s = data.value.settings;
  const p = id === "auto" ? PALETTES.light : paletteOf(id);
  const dark = id === "auto" ? PALETTES.dark : null;
  const locked = themeIsPremium(id) && !isPremium.value;

  const pick = () => {
    if (locked) {
      toast("Эта тема — в Premium");
      openOverlay({ name: "premium" });
      return;
    }
    haptic();
    update("settings", (x) => ({ ...x, theme: id }));
  };

  return (
    <button class={`swatch ${s.theme === id ? "on" : ""}`} onClick={pick}>
      <span class="swatch-preview" style={{ background: dark ? `linear-gradient(90deg, ${p.bg} 50%, ${dark.bg} 50%)` : p.bg }}>
        <span class="sw-card" style={{ background: p.card }}>
          <i style={{ background: `linear-gradient(135deg, ${p.accent}, ${p.accent2})` }} />
          <em style={{ background: p.muted }} />
        </span>
        {locked && <span class="sw-lock"><Icon name="lock" size={14} /></span>}
        {s.theme === id && <span class="sw-check"><Icon name="check" size={14} stroke={3} /></span>}
      </span>
      <b>{themeName(id)}</b>
    </button>
  );
}

export function Appearance() {
  const style = data.value.settings.style;

  const pickStyle = (id: CardStyle, premium: boolean) => {
    if (premium && !isPremium.value) {
      toast("Этот стиль — в Premium");
      openOverlay({ name: "premium" });
      return;
    }
    haptic();
    update("settings", (x) => ({ ...x, style: id }));
  };

  return (
    <>
      <PageHead title="Оформление" sub="Профиль" right={
        <button class="icon-btn round" aria-label="Закрыть" onClick={closeOverlay}><Icon name="close" size={20} /></button>} />

      <h2 class="section-title">Светлая или тёмная</h2>
      <ModeSwitch />

      <h2 class="section-title">Цветные темы</h2>
      <div class="swatches">
        {THEME_ORDER.map((id) => <ThemeSwatch key={id} id={id} />)}
      </div>

      <h2 class="section-title">Стиль карточек</h2>
      <div class="styles">
        {STYLES.map((s) => (
          <button key={s.id} class={`style-opt style-${s.id} ${style === s.id ? "on" : ""}`} onClick={() => pickStyle(s.id, s.premium)}>
            <span class="style-demo"><i /><i /></span>
            <span class="grow">
              <b>{s.name} {s.premium && !isPremium.value && <span class="badge-pro">PRO</span>}</b>
              <small>{s.note}</small>
            </span>
            {style === s.id && <Icon name="check" size={20} stroke={2.5} />}
          </button>
        ))}
      </div>
      <p class="footnote">«Авто» и «Как в Telegram» следуют за светлой или тёмной темой твоего Telegram.</p>
    </>
  );
}
