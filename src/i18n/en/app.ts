import type { Entry } from "..";
import type ru from "../ru/app";

export default {
  "app.name": "Second Brain",
  "app.onlyInTelegram": "This app works inside Telegram.",
  "app.openViaBot": "Open it through the bot.",
  "app.openInTelegram": "Open in Telegram",
  "app.findBot": "Find the bot in Telegram and tap “Open”.",
  "app.weight": "Weight",
  "app.reps": "Reps",
  "app.less": "Less",
  "app.more": "More",
} satisfies Record<keyof typeof ru, Entry>;
