// "Профиль": the user's own zone — avatar and name from Telegram, stats,
// achievements and all settings.

import { data, isPremium, update } from "../store";
import { ModeSwitch } from "./Appearance";
import { finishedWorkouts, habitStreak } from "../domain";
import { dayKey, daysAgo, formatDate, num, parseNum } from "../utils";
import { lang, LANGS, setLanguage, t, type Lang } from "../i18n";
import { signal } from "@preact/signals";
import { createPortal } from "preact/compat";
import { haptic } from "../telegram";
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
    { id: "w1", icon: "gym", title: t("profile.achFirstStep"), note: t("profile.workoutsN", { n: 1 }), done: workouts >= 1, color: "var(--c-gym)" },
    { id: "w10", icon: "gym", title: t("profile.achHooked"), note: t("profile.workoutsN", { n: 10 }), done: workouts >= 10, color: "var(--c-gym)" },
    { id: "w50", icon: "trophy", title: t("profile.achIron"), note: t("profile.workoutsN", { n: 50 }), done: workouts >= 50, color: "var(--c-gym)" },
    { id: "s7", icon: "flame", title: t("profile.achWillWeek"), note: t("profile.habitRowN", { n: 7 }), done: streak >= 7, color: "var(--c-mood)" },
    { id: "s30", icon: "flame", title: t("profile.achNoMiss"), note: t("profile.habitRowN", { n: 30 }), done: streak >= 30, color: "var(--c-mood)" },
    { id: "n10", icon: "notes", title: t("profile.achThinker"), note: t("profile.notesN", { n: 10 }), done: d.notes.length >= 10, color: "var(--accent)" },
    { id: "h2o", icon: "drop", title: t("profile.achFish"), note: t("profile.waterDaysN", { n: 7 }), done: waterDays >= 7, color: "var(--c-water)" },
    { id: "zz", icon: "moon", title: t("profile.achSleepy"), note: t("profile.sleepLogsN", { n: 14 }), done: Object.keys(d.metrics.sleep).length >= 14, color: "var(--c-sleep)" },
  ];
}

export function Profile() {
  const d = data.value;
  const name = tgUser ? `${tgUser.first_name} ${tgUser.last_name ?? ""}`.trim() : t("common.guest");
  const days = Math.max(1, Math.ceil((Date.now() - (d.settings.joined || Date.now())) / DAY));
  const workouts = finishedWorkouts(d.workouts).length;
  const bestNow = Math.max(0, ...d.habits.map(habitStreak));
  const list = achievements();
  const earned = list.filter((a) => a.done).length;

  const setWaterGoal = async () => {
    const v = await ask({
      title: t("profile.waterGoal"),
      fields: [{ name: "v", label: t("profile.perDay"), type: "number", step: "0.25", value: d.settings.waterGoal / 1000, suffix: t("unit.l") }],
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
        <div><b>{num(days, 0)}</b><small>{t("profile.daysWithUs", { n: days })}</small></div>
        <div><b>{workouts}</b><small>{t("profile.workouts", { n: workouts })}</small></div>
        <div><b>{d.notes.length}</b><small>{t("profile.notes", { n: d.notes.length })}</small></div>
        <div><b>{bestNow}</b><small>{t("profile.bestStreak")}</small></div>
      </div>

      <div class="section-row">
        <h2 class="section-title with-ico"><Icon name="trophy" size={20} />{t("profile.achievements")}</h2>
        <span class="muted small">{t("profile.earnedOf", { earned, total: list.length })}</span>
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

      <h2 class="section-title with-ico"><Icon name="gear" size={20} />{t("common.settings")}</h2>
      <ModeSwitch />
      <div class="card list">
        <LanguageRow />
        <Row icon="palette" color="linear-gradient(135deg,#F0528C,#9B5CF6)" title={t("profile.appearance")}
          sub={`${themeName(d.settings.theme)} · ${STYLES.find((s) => s.id === d.settings.style)?.name ?? ""}`}
          onClick={() => openOverlay({ name: "appearance" })} />
        <Row icon="transfer" color="linear-gradient(135deg,#22C6D6,#3B82F6)" title={t("profile.dataTransfer")}
          sub={d.settings.lastBackup ? t("profile.backupFrom", { date: formatDate(d.settings.lastBackup, { day: "numeric", month: "short" }) }) : t("profile.noBackups")}
          onClick={() => openOverlay({ name: "data" })} />
        <Row icon="drop" color="var(--c-water)" title={t("profile.waterGoal")} sub={t("profile.waterPerDay", { v: num(d.settings.waterGoal / 1000, 2) })} onClick={setWaterGoal} />
        <Row icon="crown" color="var(--grad-gold)" title="Premium" sub={premiumStatusText()}
          onClick={() => openOverlay({ name: "premium" })} />
      </div>

      <p class="footnote">
        <Icon name="shield" size={14} /> {t("profile.footnote")}
      </p>
      <LanguageSheet />
    </>
  );
}

// ---------- language ----------
// Readable without knowing the current language: a globe icon, the word
// "Language" in English next to the local one, and every language written in
// itself with its flag.

const languageOpen = signal(false);

function LanguageRow() {
  const cur = LANGS.find((l) => l.id === lang.value)!;
  const title = lang.value === "en" ? t("common.language") : `${t("common.language")} · Language`;
  return (
    <Row icon="globe" color="linear-gradient(135deg,#10B981,#3B82F6)" title={title}
      sub={`${cur.flag} ${cur.name}`} onClick={() => (languageOpen.value = true)} />
  );
}

async function chooseLanguage(id: Lang) {
  haptic();
  languageOpen.value = false;
  if (id === lang.value) return;
  await setLanguage(id);
  update("settings", (s) => ({ ...s, lang: id }));
}

function LanguageSheet() {
  if (!languageOpen.value) return null;
  const close = () => (languageOpen.value = false);
  return createPortal(
    <div class="sheet-bg" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="sheet picker">
        <div class="sheet-grip" />
        <h3 class="with-ico"><Icon name="globe" size={22} />{lang.value === "en" ? "Language" : `${t("common.language")} · Language`}</h3>
        <div class="picker-list">
          {LANGS.map((l) => (
            <button key={l.id} class={`picker-item lang-item ${l.id === lang.value ? "on" : ""}`} onClick={() => chooseLanguage(l.id)}
              dir={l.rtl ? "rtl" : "ltr"} lang={l.id}>
              <span class="lang-flag">{l.flag}</span>
              <span class="grow"><b>{l.name}</b><small class="muted">{l.english}</small></span>
              {l.id === lang.value && <Icon name="check" size={20} stroke={2.5} />}
            </button>
          ))}
        </div>
        <button class="btn block ghost" onClick={close}>{t("common.done")}</button>
      </div>
    </div>,
    document.body,
  );
}
