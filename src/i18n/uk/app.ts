import type { Entry } from "..";
import type ru from "../ru/app";

export default {
  "app.name": "Другий мозок",
  "app.onlyInTelegram": "Цей застосунок працює всередині Telegram.",
  "app.openViaBot": "Відкрий його через бота.",
  "app.openInTelegram": "Відкрити в Telegram",
  "app.findBot": "Знайди бота в Telegram і натисни «Відкрити».",
  "app.weight": "Вага",
  "app.reps": "Повторення",
  "app.less": "Менше",
  "app.more": "Більше",
} satisfies Record<keyof typeof ru, Entry>;
