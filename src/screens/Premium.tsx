// Premium: plans drawn as tear-off tickets ("абонементы").

import { data, isPremium, update } from "../store";
import { buy, FREE_HABITS, premiumStatusText, prices, type Plan } from "../premium";
import { ACCENTS } from "../theme";
import { closeOverlay } from "../nav";
import { Icon, Section, toast } from "../ui";
import { haptic } from "../telegram";

const PERKS = [
  ["∞", `Безлимит привычек (бесплатно — ${FREE_HABITS})`],
  ["#", "Свои трекеры: шаги, страницы, отжимания — что угодно"],
  ["↑", "Рекорды, 1ПМ и графики силы по каждому упражнению"],
  ["◐", "Цвет чернил: 6 акцентов оформления"],
  ["♥", "Ты поддерживаешь независимый проект"],
];

function Ticket({ plan, title, note, best }: { plan: Plan; title: string; note: string; best?: boolean }) {
  return (
    <button class={`ticket ${best ? "best" : ""}`} onClick={() => buy(plan)}>
      <span class="ticket-main">
        {best && <span class="ticket-flag mono">выгодно</span>}
        <b>{title}</b>
        <span class="sub">{note}</span>
      </span>
      <span class="ticket-stub mono">
        <b>{prices.value[plan]}</b>
        <span>★ stars</span>
      </span>
    </button>
  );
}

export function PremiumScreen() {
  const p = data.value.premium;
  const accent = data.value.settings.accent;

  const pickAccent = (color: string | null) => {
    if (color && !isPremium.value) return toast("Цвета — в Premium ★");
    haptic();
    update("settings", (s) => ({ ...s, accent: color }));
  };

  return (
    <>
      <header class="head">
        <div class="head-title">
          <span class="idx">★</span>
          <h1>Абонемент</h1>
          <p class="mono sub">{premiumStatusText()}</p>
        </div>
        <div class="head-actions">
          <button class="corner" aria-label="Закрыть" onClick={closeOverlay}><Icon name="close" /></button>
        </div>
      </header>

      <Section label="Что внутри">
        <ul class="perks">
          {PERKS.map(([mark, text]) => <li key={text}><span class="mono">{mark}</span>{text}</li>)}
        </ul>
      </Section>

      {!p.lifetime && (
        <>
          <Ticket plan="month" title="Месяц" note="подписка, продлевается сама раз в 30 дней" />
          <Ticket plan="lifetime" title="Навсегда" note="один платёж, без подписки" best />
        </>
      )}
      <Ticket plan="tip" title="Сказать спасибо" note="донат автору, ничего не открывает" />

      <Section label={isPremium.value ? "Цвет чернил" : "Цвет чернил ★"}>
        <div class="inks">
          {ACCENTS.map((a) => (
            <button key={a.color} class={`ink ${accent === a.color ? "on" : ""}`} style={{ background: a.color }}
              aria-label={a.name} title={a.name} onClick={() => pickAccent(a.color)} />
          ))}
          <button class={`ink reset ${!accent ? "on" : ""}`} aria-label="По умолчанию" onClick={() => pickAccent(null)}>↺</button>
        </div>
      </Section>

      <p class="fine">
        Оплата — Telegram Stars. Подписку можно отменить: Telegram → Настройки → Мои звёзды.
        Вопросы по оплате — команда /paysupport в чате с ботом.
        Покупка не даёт нам доступа к твоим записям: они по-прежнему только на твоём устройстве.
      </p>
    </>
  );
}
