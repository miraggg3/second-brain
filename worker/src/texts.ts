// Bot texts in the app's four languages. The language comes from the Mini
// App (the one the user picked there) or from Telegram's language_code.
// Screen names ("Profile → Data transfer") match the app's own translations.

export type Lang = "ru" | "en" | "uk" | "ar";
export const LANGS: Lang[] = ["ru", "en", "uk", "ar"];

export const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as string[]).includes(v);

// Telegram's language → ours (Belarusian/Kazakh users usually read Russian)
export function langOf(code: unknown, preferred?: unknown): Lang {
  if (isLang(preferred)) return preferred;
  const c = String(code ?? "").toLowerCase().split("-")[0];
  if (c === "uk" || c === "ar") return c;
  if (["ru", "be", "kk", "ky", "uz", "tg"].includes(c)) return "ru";
  return c ? "en" : "ru";
}

interface Texts {
  open: string;
  start: string;
  paysupport: string;
  terms: string;
  planMonthTitle: string;
  planMonthDescription: string;
  planLifetimeTitle: string;
  planLifetimeDescription: string;
  planTipTitle: string;
  planTipDescription: string;
  invoiceExpired: string;
  thanksTip: string;
  thanksRenewed: string;
  thanksActivated: string;
  shareTitle: string;
  linkExpired: string;
  cmdStart: string;
  cmdPaysupport: string;
  cmdTerms: string;
  shortDescription: string; // bot profile, up to 120 characters
  description: string;      // shown before /start, up to 512 characters
  reminderText: string;     // {habit} = emoji + name
  reminderDone: string;
  reminderDoneText: string;
  reminderMarked: string;
  reminderGone: string;
}

const T: Record<Lang, Texts> = {
  ru: {
    reminderText: "⏰ Напоминание: {habit}\nОтметь, когда сделаешь 💪",
    reminderDone: "✅ Выполнено",
    reminderDoneText: "✅ {habit} — отмечено. Так держать!",
    reminderMarked: "Отмечено ✅",
    reminderGone: "Это напоминание уже выключено",
    open: "🧠 Открыть",
    start:
      "Привет! Это твой второй мозг 🧠\n\n" +
      "• Заметки с папками, тегами и экспортом в Obsidian\n" +
      "• Журнал зала: подходы, веса, рекорды\n" +
      "• Привычки, вода, сон, вес, настроение\n\n" +
      "Все записи хранятся только на твоём устройстве. Перенести на другое: Профиль → Перенос данных.",
    paysupport:
      "Вопросы по оплате Telegram Stars: опиши проблему ответом на это сообщение — дату платежа и что купил. " +
      "Ответим в течение 48 часов. Если Premium не включился, закрой и снова открой приложение.",
    terms:
      "Premium открывает дополнительные функции приложения. Подписка продлевается каждые 30 дней, " +
      "отменить: Telegram → Настройки → Мои звёзды. Возврат — по запросу через /paysupport. " +
      "Записи хранятся на устройстве пользователя, сервер их не хранит.",
    planMonthTitle: "Second Brain Premium · месяц",
    planMonthDescription: "Все темы, свои трекеры, безлимит привычек, рекорды в зале. Продлевается каждые 30 дней, отменить можно в любой момент.",
    planLifetimeTitle: "Second Brain Premium · навсегда",
    planLifetimeDescription: "Все функции Premium навсегда, одним платежом.",
    planTipTitle: "Поддержать Second Brain",
    planTipDescription: "Спасибо, что помогаешь развивать проект 💛",
    invoiceExpired: "Счёт устарел. Открой оплату в приложении заново.",
    thanksTip: "Спасибо за поддержку! 💛",
    thanksRenewed: "Подписка Premium продлена ⭐ Спасибо!",
    thanksActivated: "Premium активирован ⭐ Открой приложение — всё уже работает.",
    shareTitle: "Поделиться",
    linkExpired: "Ссылка устарела",
    cmdStart: "Открыть второй мозг",
    cmdPaysupport: "Помощь с оплатой",
    cmdTerms: "Условия",
    shortDescription: "Заметки, привычки, зал и здоровье в одном месте. Данные только на твоём устройстве.",
    description:
      "Второй мозг: заметки с папками, журнал тренировок с рекордами, привычки, вода, сон, вес и настроение. " +
      "Все записи хранятся только на твоём устройстве. Нажми «Старт», чтобы начать.",
  },
  en: {
    reminderText: "⏰ Reminder: {habit}\nMark it when it's done 💪",
    reminderDone: "✅ Done",
    reminderDoneText: "✅ {habit} — done. Keep it up!",
    reminderMarked: "Marked ✅",
    reminderGone: "This reminder is turned off",
    open: "🧠 Open",
    start:
      "Hi! This is your second brain 🧠\n\n" +
      "• Notes with folders, tags and Obsidian export\n" +
      "• Gym log: sets, weights, personal records\n" +
      "• Habits, water, sleep, weight, mood\n\n" +
      "Everything is stored only on your device. To move it to another one: Profile → Data transfer.",
    paysupport:
      "Questions about Telegram Stars payments: reply to this message with the payment date and what you bought. " +
      "We answer within 48 hours. If Premium didn't turn on, close the app and open it again.",
    terms:
      "Premium unlocks extra features of the app. The subscription renews every 30 days; " +
      "cancel it in Telegram → Settings → My Stars. Refunds on request via /paysupport. " +
      "Your records stay on your device; the server doesn't store them.",
    planMonthTitle: "Second Brain Premium · monthly",
    planMonthDescription: "All themes, custom trackers, unlimited habits, gym records. Renews every 30 days, cancel anytime.",
    planLifetimeTitle: "Second Brain Premium · lifetime",
    planLifetimeDescription: "Every Premium feature forever, with one payment.",
    planTipTitle: "Support Second Brain",
    planTipDescription: "Thank you for helping the project grow 💛",
    invoiceExpired: "This invoice has expired. Open the payment in the app again.",
    thanksTip: "Thank you for your support! 💛",
    thanksRenewed: "Premium renewed ⭐ Thank you!",
    thanksActivated: "Premium is on ⭐ Open the app, everything already works.",
    shareTitle: "Share",
    linkExpired: "This link has expired",
    cmdStart: "Open Second Brain",
    cmdPaysupport: "Payment help",
    cmdTerms: "Terms",
    shortDescription: "Notes, habits, gym and health in one place. Your data stays on your device.",
    description:
      "Second Brain: notes with folders, a workout log with records, habits, water, sleep, weight and mood. " +
      "Everything is stored only on your device. Tap Start to begin.",
  },
  uk: {
    reminderText: "⏰ Нагадування: {habit}\nПозначай, коли зробиш 💪",
    reminderDone: "✅ Виконано",
    reminderDoneText: "✅ {habit} — позначено. Так тримати!",
    reminderMarked: "Позначено ✅",
    reminderGone: "Це нагадування вже вимкнено",
    open: "🧠 Відкрити",
    start:
      "Привіт! Це твій другий мозок 🧠\n\n" +
      "• Нотатки з папками, тегами та експортом в Obsidian\n" +
      "• Журнал залу: підходи, ваги, рекорди\n" +
      "• Звички, вода, сон, вага, настрій\n\n" +
      "Усі записи зберігаються лише на твоєму пристрої. Перенести на інший: Профіль → Перенесення даних.",
    paysupport:
      "Питання щодо оплати Telegram Stars: опиши проблему у відповідь на це повідомлення — дату платежу і що купив. " +
      "Відповімо протягом 48 годин. Якщо Premium не увімкнувся, закрий і знову відкрий застосунок.",
    terms:
      "Premium відкриває додаткові функції застосунку. Підписка поновлюється кожні 30 днів, " +
      "скасувати: Telegram → Налаштування → Мої зірки. Повернення — на запит через /paysupport. " +
      "Записи зберігаються на пристрої користувача, сервер їх не зберігає.",
    planMonthTitle: "Second Brain Premium · місяць",
    planMonthDescription: "Усі теми, власні трекери, безліміт звичок, рекорди в залі. Поновлюється кожні 30 днів, скасувати можна будь-коли.",
    planLifetimeTitle: "Second Brain Premium · назавжди",
    planLifetimeDescription: "Усі функції Premium назавжди, одним платежем.",
    planTipTitle: "Підтримати Second Brain",
    planTipDescription: "Дякуємо, що допомагаєш розвивати проєкт 💛",
    invoiceExpired: "Рахунок застарів. Відкрий оплату в застосунку знову.",
    thanksTip: "Дякуємо за підтримку! 💛",
    thanksRenewed: "Підписку Premium поновлено ⭐ Дякуємо!",
    thanksActivated: "Premium увімкнено ⭐ Відкрий застосунок — усе вже працює.",
    shareTitle: "Поділитися",
    linkExpired: "Посилання застаріло",
    cmdStart: "Відкрити другий мозок",
    cmdPaysupport: "Допомога з оплатою",
    cmdTerms: "Умови",
    shortDescription: "Нотатки, звички, зал і здоровʼя в одному місці. Дані лише на твоєму пристрої.",
    description:
      "Другий мозок: нотатки з папками, журнал тренувань із рекордами, звички, вода, сон, вага й настрій. " +
      "Усі записи зберігаються лише на твоєму пристрої. Натисни «Старт», щоб почати.",
  },
  ar: {
    reminderText: "⏰ تذكير: {habit}\nضع علامة عندما تُنجزها 💪",
    reminderDone: "✅ تم",
    reminderDoneText: "✅ {habit} — تم التسجيل. واصل التقدّم!",
    reminderMarked: "تم التسجيل ✅",
    reminderGone: "هذا التذكير متوقّف",
    open: "🧠 فتح",
    start:
      "مرحبًا! هذا دماغك الثاني 🧠\n\n" +
      "• ملاحظات مع مجلدات ووسوم وتصدير إلى Obsidian\n" +
      "• سجلّ الصالة: المجموعات والأوزان والأرقام القياسية\n" +
      "• العادات والماء والنوم والوزن والمزاج\n\n" +
      "تُحفظ جميع سجلّاتك على جهازك فقط. لنقلها إلى جهاز آخر: حسابي ← نقل البيانات.",
    paysupport:
      "أسئلة حول الدفع عبر Telegram Stars: صِف المشكلة بالرد على هذه الرسالة مع تاريخ الدفع وما اشتريته. " +
      "نردّ خلال 48 ساعة. إذا لم يُفعَّل Premium فأغلق التطبيق وافتحه من جديد.",
    terms:
      "يفتح Premium ميزات إضافية في التطبيق. يتجدّد الاشتراك كل 30 يومًا، " +
      "ويمكن إلغاؤه من Telegram ← الإعدادات ← نجومي. الاسترداد عند الطلب عبر /paysupport. " +
      "تُحفظ السجلّات على جهاز المستخدم ولا يخزّنها الخادم.",
    planMonthTitle: "Second Brain Premium · شهري",
    planMonthDescription: "كل السمات، ومتتبّعات خاصة بك، وعادات بلا حدود، وأرقامك القياسية في الصالة. يتجدّد كل 30 يومًا ويمكن إلغاؤه في أي وقت.",
    planLifetimeTitle: "Second Brain Premium · للأبد",
    planLifetimeDescription: "جميع ميزات Premium إلى الأبد بدفعة واحدة.",
    planTipTitle: "ادعم Second Brain",
    planTipDescription: "شكرًا لمساعدتك في تطوير المشروع 💛",
    invoiceExpired: "انتهت صلاحية الفاتورة. افتح الدفع في التطبيق من جديد.",
    thanksTip: "شكرًا لدعمك! 💛",
    thanksRenewed: "تم تجديد Premium ⭐ شكرًا لك!",
    thanksActivated: "تم تفعيل Premium ⭐ افتح التطبيق، كل شيء يعمل الآن.",
    shareTitle: "مشاركة",
    linkExpired: "انتهت صلاحية الرابط",
    cmdStart: "فتح الدماغ الثاني",
    cmdPaysupport: "المساعدة في الدفع",
    cmdTerms: "الشروط",
    shortDescription: "الملاحظات والعادات والصالة والصحة في مكان واحد. بياناتك على جهازك فقط.",
    description:
      "الدماغ الثاني: ملاحظات مع مجلدات، وسجلّ تمارين مع الأرقام القياسية، وعادات، وماء، ونوم، ووزن، ومزاج. " +
      "تُحفظ جميع السجلّات على جهازك فقط. اضغط «ابدأ» للبدء.",
  },
};

export const texts = (lang: Lang): Texts => T[lang];
