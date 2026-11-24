// "Профиль": the user's own zone — avatar and name from Telegram, stats,
// achievements and all settings.

import { data, isPremium, update } from "../store";
import { finishedWorkouts, habitStreak } from "../domain";
import { dayKey, daysAgo, formatDate, num, parseNum, plural } from "../utils";
import { ask, Avatar, Icon, Row, type IconName } from "../ui";
import { tgUser } from "../telegram";
import { openOverlay } from "../nav";
import { premiumStatusText } from "../premium";
import { themeName } from "../themes";
import { STYLES } from "../themes";

const DAY = 86_400_000;

interface Achievement { id: string; icon: IconName; title: string; note: string; done: boolean; color: string }

function bestHabitStreak(): number {
  // longest run of consecutive done days in any habit
  let best = 0;
  for (const h of data.value.habits) {
    const days = Object.keys(h.done).sort();
    let run = 0;
    let prev: number | null = null;
    for (const k of days) {
      const t = new Date(`${k}T12:00:00`).getTime();
      run = prev !== null && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1;
      prev = t;
      best = Math.max(best, run);
    }
  }
  return best;
}

function achievements(): Achievement[] {
  const d = data.value;
  const workouts = finishedWorkouts(d.workouts).length;
  const streak = bestHabitStreak();
  const goal = d.settings.waterGoal || 2000;
  let waterDays = 0;
  for (let i = 0; i < 7; i++) if ((d.metrics.water[dayKey(daysAgo(i))] ?? 0) >= goal) waterDays++;
  return [
    { id: "w1", icon: "gym", title: "Первый шаг", note: "1 тренировка", done: workouts >= 1, color: "var(--c-gym)" },
    { id: "w10", icon: "gym", title: "Втянулся", note: "10 тренировок", done: workouts >= 10, color: "var(--c-gym)" },
    { id: "w50", icon: "trophy", title: "Железный", note: "50 тренировок", done: workouts >= 50, color: "var(--c-gym)" },
    { id: "s7", icon: "flame", title: "Неделя силы воли", note: "привычка 7 дней подряд", done: streak >= 7, color: "var(--c-mood)" },
    { id: "s30", icon: "flame", title: "Месяц без пропусков", note: "привычка 30 дней подряд", done: streak >= 30, color: "var(--c-mood)" },
    { id: "n10", icon: "notes", title: "Мыслитель", note: "10 заметок", done: d.notes.length >= 10, color: "var(--accent)" },
    { id: "h2o", icon: "drop", title: "Как рыба в воде", note: "норма воды 7 дней", done: waterDays >= 7, color: "var(--c-water)" },
    { id: "zz", icon: "moon", title: "Соня", note: "внеси сон 14 раз", done: Object.keys(d.metrics.sleep).length >= 14, color: "var(--c-sleep)" },
  ];
}

export function Profile() {
  const d = data.value;
  const name = tgUser ? `${tgUser.first_name} ${tgUser.last_name ?? ""}`.trim() : "Гость";
  const days = Math.max(1, Math.ceil((Date.now() - (d.settings.joined || Date.now())) / DAY));
  const workouts = finishedWorkouts(d.workouts).length;
  const bestNow = Math.max(0, ...d.habits.map(habitStreak));
  const list = achievements();
  const earned = list.filter((a) => a.done).length;

  const setWaterGoal = async () => {
    const v = await ask({
      title: "Цель по воде",
      fields: [{ name: "v", label: "В день", type: "number", step: "0.25", value: d.settings.waterGoal / 1000, suffix: "л" }],
    });
    const n = v ? parseNum(v.v) : null;
    if (n && n > 0 && n <= 10) update("settings", (s) => ({ ...s, waterGoal: Math.round(n * 1000) }));
  };

  return (
    <>
      <section class="profile-hero">
        <Avatar name={name} photo={tgUser?.photo_url} seed={tgUser?.id ?? 0} size={96} ring={isPremium.value} />
        <h1>{name}</h1>
        {tgUser?.username && <p class="muted">@{tgUser.username}</p>}
        <button class={`status-pill ${isPremium.value ? "pro" : ""}`} onClick={() => openOverlay({ name: "premium" })}>
          <Icon name={isPremium.value ? "crown" : "sparkle"} size={15} />
          {premiumStatusText()}
        </button>
      </section>

      <div class="profile-stats">
        <div><b>{num(days, 0)}</b><small>{plural(days, "день", "дня", "дней")} с нами</small></div>
        <div><b>{workouts}</b><small>{plural(workouts, "тренировка", "тренировки", "тренировок")}</small></div>
        <div><b>{d.notes.length}</b><small>{plural(d.notes.length, "заметка", "заметки", "заметок")}</small></div>
        <div><b>{bestNow}</b><small>лучшая серия</small></div>
      </div>

      <div class="section-row">
        <h2 class="section-title">Достижения</h2>
        <span class="muted small">{earned} из {list.length}</span>
      </div>
      <div class="achievements">
        {list.map((a) => (
          <div key={a.id} class={`achievement ${a.done ? "done" : ""}`} style={{ "--ach": a.color }}>
            <span class="ach-ico"><Icon name={a.done ? a.icon : "lock"} size={22} /></span>
            <b>{a.title}</b>
            <small>{a.note}</small>
          </div>
        ))}
      </div>

      <h2 class="section-title">Настройки</h2>
      <div class="card list">
        <Row icon="palette" color="linear-gradient(135deg,#F0528C,#9B5CF6)" title="Оформление"
          sub={`${themeName(d.settings.theme)} · ${STYLES.find((s) => s.id === d.settings.style)?.name ?? ""}`}
          onClick={() => openOverlay({ name: "appearance" })} />
        <Row icon="transfer" color="linear-gradient(135deg,#22C6D6,#3B82F6)" title="Перенос данных"
          sub={d.settings.lastBackup ? `копия от ${formatDate(d.settings.lastBackup, { day: "numeric", month: "short" })}` : "копий ещё не было"}
          onClick={() => openOverlay({ name: "data" })} />
        <Row icon="drop" color="var(--c-water)" title="Цель по воде" sub={`${num(d.settings.waterGoal / 1000, 2)} л в день`} onClick={setWaterGoal} />
        <Row icon="crown" color="linear-gradient(135deg,#F59E0B,#EF4444)" title="Premium" sub={premiumStatusText()}
          onClick={() => openOverlay({ name: "premium" })} />
      </div>

      <p class="footnote">
        <Icon name="shield" size={14} /> Все записи хранятся только на этом устройстве.
        Удалишь Telegram — удалятся и они. Делай копии в «Перенос данных».
      </p>
    </>
  );
}
