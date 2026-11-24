// Paywall: perks, plan selection, one clear call to action.

import { useState } from "preact/hooks";
import { data, isPremium } from "../store";
import { buy, FREE_HABITS, premiumStatusText, prices, type Plan } from "../premium";
import { closeOverlay } from "../nav";
import { Icon, type IconName } from "../ui";
import { haptic } from "../telegram";

const PERKS: [IconName, string, string][] = [
  ["palette", "Все темы и стиль «Стекло»", "Океан, Лес, Сакура, Мята, Неон"],
  ["sparkle", "Свои трекеры", "Шаги, страницы, отжимания — что угодно"],
  ["flame", "Безлимит привычек", `Бесплатно — ${FREE_HABITS}`],
  ["trophy", "Рекорды в зале", "1ПМ и графики силы по упражнениям"],
  ["heart", "Поддержка проекта", "Ты помогаешь делать приложение лучше"],
];

export function PremiumScreen() {
  const p = data.value.premium;
  const [plan, setPlan] = useState<Plan>("lifetime");
  const pr = prices.value;
  const monthsToPayOff = Math.ceil(pr.lifetime / pr.month);

  return (
    <div class="paywall">
      <button class="icon-btn round close-float" aria-label="Закрыть" onClick={closeOverlay}><Icon name="close" size={20} /></button>

      <section class="paywall-hero">
        <span class="crown"><Icon name="crown" size={40} stroke={1.8} /></span>
        <h1>Second Brain<br />Premium</h1>
        <p>{isPremium.value ? premiumStatusText() : "Больше возможностей для твоего второго мозга"}</p>
      </section>

      <div class="card perks">
        {PERKS.map(([icon, title, note]) => (
          <div key={title} class="perk">
            <span class="perk-ico"><Icon name={icon} size={19} /></span>
            <span><b>{title}</b><small>{note}</small></span>
          </div>
        ))}
      </div>

      {!p.lifetime && (
        <>
          <div class="plans">
            <button class={`plan ${plan === "month" ? "on" : ""}`} onClick={() => { haptic(); setPlan("month"); }}>
              <span class="radio" />
              <span class="grow"><b>Месяц</b><small>подписка, отмена в любой момент</small></span>
              <span class="price">{pr.month} <Icon name="sparkle" size={14} /></span>
            </button>
            <button class={`plan ${plan === "lifetime" ? "on" : ""}`} onClick={() => { haptic(); setPlan("lifetime"); }}>
              <span class="plan-tag">Выгоднее</span>
              <span class="radio" />
              <span class="grow"><b>Навсегда</b><small>один платёж — окупается за {monthsToPayOff} мес.</small></span>
              <span class="price">{pr.lifetime} <Icon name="sparkle" size={14} /></span>
            </button>
          </div>
          <button class="btn block big" onClick={() => buy(plan)}>
            Оформить за {plan === "month" ? pr.month : pr.lifetime} ⭐
          </button>
        </>
      )}

      <button class="text-btn center" onClick={() => buy("tip")}>
        <Icon name="heart" size={16} /> Просто поддержать автора · {pr.tip} ⭐
      </button>

      <p class="footnote">
        Оплата через Telegram Stars. Подписку можно отменить: Telegram → Настройки → Мои звёзды.
        Вопросы по оплате — /paysupport в чате с ботом. Покупка не даёт доступа к твоим записям.
      </p>
    </div>
  );
}
