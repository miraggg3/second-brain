// "Today" tab: habits, daily metrics (water, sleep, weight, mood),
// premium custom trackers and a gym summary.

const FREE_HABITS = 3;
const MOODS = ["😫", "😕", "😐", "🙂", "🤩"];

// Days in a row the habit was done, counting back from today
// (today not done yet does not break the streak).
function habitStreak(h) {
  let n = 0;
  let i = h.done[dayKey()] ? 0 : 1;
  while (h.done[dayKey(daysAgo(i))]) { n++; i++; }
  return n;
}

function lastValue(map) {
  const days = Object.keys(map).sort();
  return days.length ? map[days[days.length - 1]] : null;
}

function habitRow(h) {
  const done = !!h.done[dayKey()];
  const streak = habitStreak(h);
  return `
  <div class="item habit ${done ? "done" : ""}">
    <button class="check" data-act="habit-toggle" data-id="${h.id}" aria-label="Отметить">${done ? "✓" : ""}</button>
    <span class="grow">${esc(h.emoji || "")} ${esc(h.name)}</span>
    ${streak ? `<small class="streak">🔥 ${streak}</small>` : ""}
    <button class="icon" data-act="habit-del" data-id="${h.id}" aria-label="Удалить">×</button>
  </div>`;
}

function trackerRow(t) {
  const v = t.values[dayKey()] || 0;
  return `
  <div class="item">
    <span class="grow">${esc(t.name)}</span>
    <button class="pill" data-act="tracker-set" data-id="${t.id}">${num(v)} ${esc(t.unit)}</button>
    <button class="pill accent" data-act="tracker-add" data-id="${t.id}">+${num(t.step)}</button>
    <button class="icon" data-act="tracker-del" data-id="${t.id}" aria-label="Удалить">×</button>
  </div>`;
}

renderers.today = function () {
  const t = dayKey();
  const m = S.metrics;
  const water = m.water[t] || 0;
  const goal = S.settings.waterGoal || 2000;
  const mood = m.mood[t] || 0;
  const active = activeWorkout();
  const week = workoutsSince(startOfWeek()).length;
  const streak = gymWeekStreak();
  const lastWeight = lastValue(m.weight);

  $("screen-today").innerHTML = `
  <header class="top">
    <div>
      <h1>Сегодня</h1>
      <small class="hint">${new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}</small>
    </div>
    ${premiumBadge()}
  </header>

  <section class="card gym-card">
    <div class="grow">
      <h2>🏋️ Зал</h2>
      <small class="hint">${week} ${plural(week, "тренировка", "тренировки", "тренировок")} на этой неделе${streak ? ` · серия ${streak} ${plural(streak, "неделя", "недели", "недель")} 🔥` : ""}</small>
    </div>
    <button class="small" data-act="go-gym">${active ? "Продолжить" : "Начать"}</button>
  </section>

  <section class="card">
    <div class="card-h">
      <h2>Привычки</h2>
      <button class="link" data-act="habit-add">+ Добавить</button>
    </div>
    ${S.habits.length ? S.habits.map(habitRow).join("")
      : `<p class="hint">Добавь первую привычку: «Читать 20 минут», «Без сахара», «Растяжка»…</p>`}
  </section>

  <section class="card">
    <h2>Показатели</h2>
    <div class="item">
      <span class="grow">💧 Вода <b>${water} / ${goal} мл</b></span>
      <button class="pill" data-act="water" data-v="-250">−250</button>
      <button class="pill accent" data-act="water" data-v="250">+250</button>
    </div>
    <div class="progress"><i style="width:${Math.min(100, (water / goal) * 100)}%"></i></div>
    <label class="item">
      <span class="grow">😴 Сон, часов</span>
      <input class="mini" type="number" inputmode="decimal" step="0.5" min="0" max="24"
        data-change="metric" data-metric="sleep" value="${m.sleep[t] ?? ""}" placeholder="8">
    </label>
    <label class="item">
      <span class="grow">⚖️ Вес, кг</span>
      <input class="mini" type="number" inputmode="decimal" step="0.1" min="0"
        data-change="metric" data-metric="weight" value="${m.weight[t] ?? ""}" placeholder="${lastWeight ?? "70"}">
    </label>
    <div class="item">
      <span class="grow">Настроение</span>
      <div class="moods">
        ${MOODS.map((e, i) => `<button class="mood ${mood === i + 1 ? "active" : ""}" data-act="mood" data-v="${i + 1}">${e}</button>`).join("")}
      </div>
    </div>
  </section>

  <section class="card">
    <div class="card-h">
      <h2>Свои трекеры ${isPremium() ? "" : "<small>⭐</small>"}</h2>
      <button class="link" data-act="tracker-new">+ Добавить</button>
    </div>
    ${S.trackers.length ? S.trackers.map(trackerRow).join("")
      : `<p class="hint">Считай что угодно: страницы, отжимания, шаги, чашки кофе, часы учёбы.${isPremium() ? "" : " Доступно в Premium."}</p>`}
  </section>`;
};

// ---------- habits ----------

actions["habit-add"] = async () => {
  if (S.habits.length >= FREE_HABITS && !requirePremium(`Бесплатно можно вести ${FREE_HABITS} привычки`)) return;
  const v = await ask({
    title: "Новая привычка",
    fields: [
      { name: "name", label: "Название", placeholder: "Читать 20 минут" },
      { name: "emoji", label: "Эмодзи (необязательно)", placeholder: "📚" },
    ],
  });
  if (!v || !v.name) return;
  S.habits.push({ id: newId(), name: v.name.slice(0, 60), emoji: v.emoji.slice(0, 4), created: Date.now(), done: {} });
  await save("habits");
  render();
};

actions["habit-toggle"] = async (el) => {
  const h = S.habits.find((x) => x.id === el.dataset.id);
  if (!h) return;
  const t = dayKey();
  if (h.done[t]) delete h.done[t];
  else { h.done[t] = true; hapticOk(); }
  await save("habits");
  render();
};

actions["habit-del"] = async (el) => {
  const h = S.habits.find((x) => x.id === el.dataset.id);
  if (!h || !(await confirmAsk(`Удалить привычку «${h.name}» и её историю?`))) return;
  S.habits = S.habits.filter((x) => x !== h);
  await save("habits");
  render();
};

// ---------- metrics ----------

actions.water = async (el) => {
  const t = dayKey();
  const v = Math.max(0, (S.metrics.water[t] || 0) + Number(el.dataset.v));
  if (v) S.metrics.water[t] = v;
  else delete S.metrics.water[t];
  haptic();
  await save("metrics");
  render();
};

actions.mood = async (el) => {
  const t = dayKey();
  const v = Number(el.dataset.v);
  if (S.metrics.mood[t] === v) delete S.metrics.mood[t];
  else S.metrics.mood[t] = v;
  haptic();
  await save("metrics");
  render();
};

changes.metric = async (el) => {
  const kind = el.dataset.metric;
  const v = parseFloat(String(el.value).replace(",", "."));
  if (Number.isFinite(v) && v > 0) S.metrics[kind][dayKey()] = v;
  else delete S.metrics[kind][dayKey()];
  await save("metrics");
  haptic();
};

// ---------- custom trackers (premium) ----------

actions["tracker-new"] = async () => {
  if (!requirePremium("Свои трекеры доступны в Premium")) return;
  const v = await ask({
    title: "Новый трекер",
    fields: [
      { name: "name", label: "Что считаем", placeholder: "Отжимания" },
      { name: "unit", label: "Единица", placeholder: "раз" },
      { name: "step", label: "Шаг кнопки «+»", type: "number", value: "1", step: "any" },
    ],
  });
  if (!v || !v.name) return;
  const step = parseFloat(v.step.replace(",", ".")) || 1;
  S.trackers.push({ id: newId(), name: v.name.slice(0, 40), unit: v.unit.slice(0, 12), step, values: {} });
  await save("trackers");
  render();
};

actions["tracker-add"] = async (el) => {
  const tr = S.trackers.find((x) => x.id === el.dataset.id);
  if (!tr) return;
  const t = dayKey();
  tr.values[t] = (tr.values[t] || 0) + tr.step;
  haptic();
  await save("trackers");
  render();
};

actions["tracker-set"] = async (el) => {
  const tr = S.trackers.find((x) => x.id === el.dataset.id);
  if (!tr) return;
  const t = dayKey();
  const v = await ask({
    title: tr.name,
    fields: [{ name: "value", label: `Значение за сегодня, ${tr.unit}`, type: "number", step: "any", value: tr.values[t] || "" }],
  });
  if (!v) return;
  const n = parseFloat(v.value.replace(",", "."));
  if (Number.isFinite(n) && n > 0) tr.values[t] = n;
  else delete tr.values[t];
  await save("trackers");
  render();
};

actions["tracker-del"] = async (el) => {
  const tr = S.trackers.find((x) => x.id === el.dataset.id);
  if (!tr || !(await confirmAsk(`Удалить трекер «${tr.name}» и его историю?`))) return;
  S.trackers = S.trackers.filter((x) => x !== tr);
  await save("trackers");
  render();
};

actions["go-gym"] = () => {
  if (!activeWorkout()) startWorkout();
  showTab("gym");
};
