import type { Entry } from "..";
import type ru from "../ru/progress";

export default {
  "progress.title": "التقدّم",
  "progress.sub": "كيف تتغيّر",
  "progress.segBody": "الجسم",
  "progress.segHabits": "العادات",
  "progress.weight": "وزن الجسم",
  "progress.sleep14": "النوم · 14 يومًا",
  "progress.water14": "الماء · 14 يومًا",
  "progress.mood30": "المزاج · 30 يومًا",
  "progress.tracker14": "{name} · 14 يومًا",
  "progress.habitsEmpty": "أضِف عادات من تبويب «اليوم» وستظهر الإحصاءات هنا.",
  "progress.allHabits": "كل العادات",
  "progress.doneOf30": {
    zero: "{n} من 30 يومًا", one: "{n} من 30 يومًا", two: "{n} من 30 يومًا",
    few: "{n} من 30 يومًا", many: "{n} من 30 يومًا", other: "{n} من 30 يومًا",
  },
  "progress.streak": "سلسلة {n}",
  "progress.lockedTitle": "الأرقام القياسية وتطوّر القوة",
  "progress.lockedText": "أرقامك القياسية، والحد الأقصى المقدَّر لتكرار واحد، ورسوم بيانية لكل تمرين.",
  "progress.lockedCta": "افتحها مع Premium",
  "progress.gymEmpty": "أنهِ أول تمرين لك وستظهر أرقامك القياسية هنا.",
  "progress.statRecord": "الرقم القياسي، كغ",
  "progress.stat1rm": "1RM، كغ",
  "progress.statWorkouts": { zero: "تمرين", one: "تمرين", two: "تمرينان", few: "تمارين", many: "تمرينًا", other: "تمرين" },
  "progress.oneRm": "الحد الأقصى المقدَّر (1RM)",
  "progress.volume": "الحجم في كل تمرين",
  "progress.chartNeed2": "يلزم تسجيلان على الأقل لرسم المخطط",
  "progress.chartEmpty": "لا توجد تسجيلات لهذه الفترة بعد",
  "progress.avg": "في المتوسط",
} satisfies Record<keyof typeof ru, Entry>;
