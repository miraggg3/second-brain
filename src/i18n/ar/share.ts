import type { Entry } from "..";
import type ru from "../ru/share";

export default {
  "share.app": "الدماغ الثاني",
  "share.streakRow": {
    zero: "🔥 {n} يوم متتالٍ", one: "🔥 يوم واحد متتالٍ", two: "🔥 يومان متتاليان",
    few: "🔥 {n} أيام متتالية", many: "🔥 {n} يومًا متتاليًا", other: "🔥 {n} يوم متتالٍ",
  },
  "share.streakGoal": {
    zero: "🔥 {n} يوم ضمن الهدف", one: "🔥 يوم واحد ضمن الهدف", two: "🔥 يومان ضمن الهدف",
    few: "🔥 {n} أيام ضمن الهدف", many: "🔥 {n} يومًا ضمن الهدف", other: "🔥 {n} يوم ضمن الهدف",
  },
  "share.streakSleep": {
    zero: "🔥 {n} يوم بنوم 7 ساعات فأكثر", one: "🔥 يوم واحد بنوم 7 ساعات فأكثر", two: "🔥 يومان بنوم 7 ساعات فأكثر",
    few: "🔥 {n} أيام بنوم 7 ساعات فأكثر", many: "🔥 {n} يومًا بنوم 7 ساعات فأكثر", other: "🔥 {n} يوم بنوم 7 ساعات فأكثر",
  },
  "share.more": {
    zero: "و{n} أخرى", one: "وواحد آخر", two: "واثنان آخران",
    few: "و{n} أخرى", many: "و{n} أخرى", other: "و{n} أخرى",
  },
  "share.myDay": "يومي",
  "share.habitsUnit": { zero: "عادة", one: "عادة", two: "عادتان", few: "عادات", many: "عادةً", other: "عادة" },
  "share.waterUnit": "لتر ماء",
  "share.lineWater": "💧 الماء: {v} من {goal} لتر",
  "share.lineSleep": "🌙 النوم: {v} ساعة",
  "share.lineSleepNone": "🌙 النوم: لم يُسجَّل",
  "share.lineMood": "{emoji} المزاج: {mood}",
  "share.lineHabits": "✅ العادات: {done} من {total}",
  "share.water": "الماء",
  "share.waterSub": "من {goal} لتر · {pct}% من الهدف",
  "share.waterEmpty": "اليوم الأول، وسيظهر المخطط لاحقًا",
  "share.sleep": "النوم",
  "share.sleepAvg": "متوسط الأسبوع {v} ساعة",
  "share.sleepEmpty": "سجّل نومك بضعة أيام وسيظهر المخطط",
  "share.weight": "الوزن",
  "share.weightChange": "{v} كغ خلال الشهر",
  "share.perMonth": "خلال الشهر",
  "share.weightEmpty": "سجّل وزنك مرة أخرى ليظهر الخط",
  "share.mood": "المزاج",
  "share.moodAvg": "متوسط أسبوعين: {mood}",
  "share.moodEmpty": "سجّل مزاجك ليظهر الخط",
  "share.daysInRow": {
    zero: "يوم على التوالي", one: "يوم على التوالي", two: "يومان على التوالي",
    few: "أيام على التوالي", many: "يومًا على التوالي", other: "يوم على التوالي",
  },
  "share.habitDone": {
    zero: "أنجزتُها في {n} من 14 يومًا", one: "أنجزتُها في {n} من 14 يومًا", two: "أنجزتُها في {n} من 14 يومًا",
    few: "أنجزتُها في {n} من 14 يومًا", many: "أنجزتُها في {n} من 14 يومًا", other: "أنجزتُها في {n} من 14 يومًا",
  },
  "share.habitStart": "أبدأ من اليوم",
  "share.habitEmpty": "عادة جديدة، والسلسلة قادمة 💪",
  "share.habits": "العادات",
  "share.trackerSub": "{v} {unit} خلال 14 يومًا",
  "share.trackerEmpty": "بدأتُ العدّ للتو",
  "share.weeksInRow": {
    zero: "أسبوع على التوالي", one: "أسبوع على التوالي", two: "أسبوعان على التوالي",
    few: "أسابيع على التوالي", many: "أسبوعًا على التوالي", other: "أسبوع على التوالي",
  },
  "share.workoutsMonth": {
    zero: "{n} تمرين هذا الشهر", one: "تمرين واحد هذا الشهر", two: "تمرينان هذا الشهر",
    few: "{n} تمارين هذا الشهر", many: "{n} تمرينًا هذا الشهر", other: "{n} تمرين هذا الشهر",
  },
  "share.onWeek": {
    zero: "{n} هذا الأسبوع", one: "{n} هذا الأسبوع", two: "{n} هذا الأسبوع",
    few: "{n} هذا الأسبوع", many: "{n} هذا الأسبوع", other: "{n} هذا الأسبوع",
  },
  "share.gymEmpty": "التمرين الأول قادم",
  "share.workoutTitle": "تمرين {date}",
  "share.workoutSub": {
    zero: "الحجم الكلي · {dur} · {n} مجموعة", one: "الحجم الكلي · {dur} · مجموعة واحدة",
    two: "الحجم الكلي · {dur} · مجموعتان", few: "الحجم الكلي · {dur} · {n} مجموعات",
    many: "الحجم الكلي · {dur} · {n} مجموعةً", other: "الحجم الكلي · {dur} · {n} مجموعة",
  },
  "share.note": "ملاحظة",
  "share.notesUnit": { zero: "ملاحظة", one: "ملاحظة", two: "ملاحظتان", few: "ملاحظات", many: "ملاحظةً", other: "ملاحظة" },
  "share.folderEmpty": "فارغ حاليًا، وسأملؤه قريبًا",
} satisfies Record<keyof typeof ru, Entry>;
