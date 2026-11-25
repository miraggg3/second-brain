// Paywall: perks, plan selection, one clear call to action.

import { useState } from "preact/hooks";
import { data, isPremium } from "../store";
import { buy, FREE_HABITS, premiumStatusText, prices, type Plan } from "../premium";
import { closeOverlay } from "../nav";
import { Icon, type IconName } from "../ui";
import { haptic } from "../telegram";
import { t } from "../i18n";

const perks = (): [IconName, string, string][] => [
  ["palette", t("premium.perkThemes"), t("premium.perkThemesNote")],
  ["sparkle", t("premium.perkTrackers"), t("premium.perkTrackersNote")],
  ["flame", t("premium.perkHabits"), t("premium.perkHabitsNote", { n: FREE_HABITS })],
  ["trophy", t("premium.perkRecords"), t("premium.perkRecordsNote")],
  ["heart", t("premium.perkSupport"), t("premium.perkSupportNote")],
];

export function PremiumScreen() {
  const p = data.value.premium;
  const [plan, setPlan] = useState<Plan>("lifetime");
  const pr = prices.value;
  const monthsToPayOff = Math.ceil(pr.lifetime / pr.month);

  return (
    <div class="paywall">
      <button class="icon-btn round close-float" aria-label={t("common.close")} onClick={closeOverlay}><Icon name="close" size={20} /></button>

      <section class="paywall-hero">
        <span class="crown"><Icon name="crown" size={40} stroke={1.8} /></span>
        <h1>Second Brain<br />Premium</h1>
        <p>{isPremium.value ? premiumStatusText() : t("premium.subtitle")}</p>
      </section>

      <div class="card perks">
        {perks().map(([icon, title, note]) => (
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
              <span class="grow"><b>{t("premium.month")}</b><small>{t("premium.monthNote")}</small></span>
              <span class="price">{pr.month} <Icon name="sparkle" size={14} /></span>
            </button>
            <button class={`plan ${plan === "lifetime" ? "on" : ""}`} onClick={() => { haptic(); setPlan("lifetime"); }}>
              <span class="plan-tag">{t("premium.bestValue")}</span>
              <span class="radio" />
              <span class="grow"><b>{t("premium.lifetime")}</b><small>{t("premium.lifetimeNote", { n: monthsToPayOff })}</small></span>
              <span class="price">{pr.lifetime} <Icon name="sparkle" size={14} /></span>
            </button>
          </div>
          <button class="btn block big" onClick={() => buy(plan)}>
            {t("premium.subscribe", { n: plan === "month" ? pr.month : pr.lifetime })}
          </button>
        </>
      )}

      <button class="text-btn center" onClick={() => buy("tip")}>
        <Icon name="heart" size={16} /> {t("premium.tip", { n: pr.tip })}
      </button>

      <p class="footnote">
        {t("premium.footnote")}
      </p>
    </div>
  );
}
