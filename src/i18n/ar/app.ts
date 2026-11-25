import type { Entry } from "..";
import type ru from "../ru/app";

export default {
  "app.name": "الدماغ الثاني",
  "app.onlyInTelegram": "يعمل هذا التطبيق داخل Telegram.",
  "app.openViaBot": "افتحه عبر البوت.",
  "app.openInTelegram": "افتح في Telegram",
  "app.findBot": "ابحث عن البوت في Telegram واضغط «فتح».",
  "app.weight": "الوزن",
  "app.reps": "التكرارات",
  "app.less": "أقل",
  "app.more": "أكثر",
} satisfies Record<keyof typeof ru, Entry>;
