// Shown instead of the app when the page is opened outside Telegram
// (normal browser). The app needs Telegram: user, storage and payments
// come from it, and the server only answers requests signed by Telegram.

import { t } from "../i18n";

const BOT: string = (import.meta.env.VITE_BOT_USERNAME ?? "").replace(/^@/, "");

export function OpenInTelegram() {
  // ?startapp opens the bot's main Mini App directly
  const link = BOT ? `https://t.me/${BOT}?startapp` : "";
  return (
    <main class="open-in-tg">
      <div class="open-in-tg-icon" aria-hidden="true">🧠</div>
      <h1>{t("app.name")}</h1>
      <p>{t("app.onlyInTelegram")}<br />{t("app.openViaBot")}</p>
      {link
        ? <a class="btn big" href={link}>{t("app.openInTelegram")}</a>
        : <p class="muted small">{t("app.findBot")}</p>}
    </main>
  );
}
