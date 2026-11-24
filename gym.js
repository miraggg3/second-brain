// Gym tab: log a workout (exercises, sets with weight × reps), history,
// weekly stats and an attendance heatmap.

const DEFAULT_EXERCISES = [
  "Жим лёжа", "Приседания со штангой", "Становая тяга", "Жим стоя",
  "Тяга штанги в наклоне", "Подтягивания", "Отжимания на брусьях",
  "Жим ногами", "Тяга верхнего блока", "Сгибания на бицепс", "Французский жим",
  "Разведения гантелей", "Выпады", "Румынская тяга", "Планка",
];

let openWorkoutId = null; // expanded workout in the history list

// ---------- data helpers (also used by today.js / progress.js) ----------

function activeWorkout() {
  return S.workouts.find((w) => !w.end) || null;
}

function finishedWorkouts() {
  return S.workouts.filter((w) => w.end).sort((a, b) => b.start - a.start);
}

function workoutsSince(date) {
  const from = new Date(date).getTime();
  return S.workouts.filter((w) => w.end && w.start >= from);
}

// Weeks in a row with at least one workout. The current week only counts once it has one.
function gymWeekStreak() {
  const weeks = new Set(S.workouts.filter((w) => w.end).map((w) => startOfWeek(w.start).getTime()));
  const cursor = startOfWeek();
  if (!weeks.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 7);
  let n = 0;
  while (weeks.has(cursor.getTime())) {
    n++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return n;
}

function volumeOf(w) {
  return w.items.reduce((sum, it) => sum + it.sets.reduce((s, x) => s + x.w * x.r, 0), 0);
}

// Estimated one-rep max (Epley)
function e1rm(w, r) {
  return r <= 1 ? w : w * (1 + r / 30);
}

function exerciseNames() {
  const used = S.workouts.flatMap((w) => w.items.map((i) => i.name));
  return [...new Set([...used, ...DEFAULT_EXERCISES])];
}

function duration(ms) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? `${h} ч ${m % 60} мин` : `${m} мин`;
}

function clock(ms) {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

// live timer of the active workout
function tickTimers() {
  const w = activeWorkout();
  if (!w) return;
  document.querySelectorAll("[data-timer]").forEach((el) => (el.textContent = clock(Date.now() - w.start)));
}

// ---------- render ----------

renderers.gym = function () {
  const w = activeWorkout();
  $("screen-gym").innerHTML = w ? activeHtml(w) : overviewHtml();
};

function activeHtml(w) {
  const items = w.items.map((it, i) => {
    const last = it.sets[it.sets.length - 1] || previousSet(it.name) || { w: "", r: "" };
    return `
    <section class="card">
      <div class="card-h">
        <h2>${esc(it.name)}</h2>
        <button class="icon" data-act="ex-del" data-i="${i}" aria-label="Удалить упражнение">×</button>
      </div>
      ${it.sets.map((s, j) => `
        <div class="item set">
          <span class="hint">${j + 1}</span>
          <span class="grow"><b>${num(s.w)}</b> кг × <b>${s.r}</b></span>
          <button class="icon" data-act="set-del" data-i="${i}" data-j="${j}" aria-label="Удалить подход">×</button>
        </div>`).join("")}
      <div class="set-form">
        <input id="w-${i}" type="number" inputmode="decimal" step="0.5" min="0" placeholder="кг" value="${last.w}">
        <span>×</span>
        <input id="r-${i}" type="number" inputmode="numeric" step="1" min="1" placeholder="повт." value="${last.r}">
        <button class="small" data-act="set-add" data-i="${i}">+ подход</button>
      </div>
    </section>`;
  }).join("");

  return `
  <header class="top">
    <div>
      <h1>Тренировка</h1>
      <small class="hint">Объём: ${num(volumeOf(w), 0)} кг</small>
    </div>
    <span class="timer" data-timer>${clock(Date.now() - w.start)}</span>
  </header>
  ${items || `<p class="hint">Добавь первое упражнение 👇</p>`}
  <section class="card">
    <div class="set-form">
      <input id="ex-name" list="ex-names" placeholder="Упражнение, например «Жим лёжа»" autocomplete="off">
      <button class="small" data-act="ex-add">Добавить</button>
    </div>
    <datalist id="ex-names">${exerciseNames().map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
  </section>
  <div class="row">
    <button data-act="workout-finish">Завершить</button>
    <button class="danger" data-act="workout-cancel">Отменить</button>
  </div>`;
}

// last set of this exercise in a previous workout: pre-fills weight and reps
function previousSet(name) {
  for (const w of finishedWorkouts()) {
    const it = w.items.find((x) => x.name === name && x.sets.length);
    if (it) return it.sets[it.sets.length - 1];
  }
  return null;
}

function overviewHtml() {
  const all = finishedWorkouts();
  const week = workoutsSince(startOfWeek()).length;
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const month = workoutsSince(monthStart).length;
  const streak = gymWeekStreak();
  const perDay = {};
  for (const w of all) perDay[dayKey(w.start)] = (perDay[dayKey(w.start)] || 0) + 1;

  const history = all.slice(0, 30).map((w) => {
    const open = w.id === openWorkoutId;
    return `
    <div class="history ${open ? "open" : ""}">
      <button class="item plain" data-act="workout-open" data-id="${w.id}">
        <span class="grow">
          <b>${formatDate(w.start, { weekday: "short", day: "numeric", month: "short" })}</b>
          <small class="hint">${w.items.map((i) => esc(i.name)).join(", ") || "без упражнений"}</small>
        </span>
        <small class="hint">${duration(w.end - w.start)}</small>
      </button>
      ${open ? `
        <div class="details">
          ${w.items.map((it) => `<p><b>${esc(it.name)}</b><br><span class="hint">${it.sets.map((s) => `${num(s.w)}×${s.r}`).join(" · ")}</span></p>`).join("")}
          <p class="hint">Объём: ${num(volumeOf(w), 0)} кг</p>
          <button class="small danger" data-act="workout-del" data-id="${w.id}">Удалить тренировку</button>
        </div>` : ""}
    </div>`;
  }).join("");

  return `
  <header class="top">
    <h1>Зал</h1>
    ${premiumBadge()}
  </header>
  <button class="big" data-act="workout-start">▶ Начать тренировку</button>

  <div class="stats">
    <div><b>${week}</b><small>за неделю</small></div>
    <div><b>${month}</b><small>за месяц</small></div>
    <div><b>${streak}</b><small>${plural(streak, "неделя", "недели", "недель")} подряд</small></div>
    <div><b>${all.length}</b><small>всего</small></div>
  </div>

  <section class="card">
    <h2>Посещения</h2>
    ${heatmap((d) => Math.min(3, (perDay[d] || 0) * 2))}
  </section>

  <section class="card">
    <h2>История</h2>
    ${history || `<p class="hint">Тут появятся твои тренировки.</p>`}
  </section>`;
}

// ---------- actions ----------

function startWorkout() {
  S.workouts.push({ id: newId(), start: Date.now(), end: null, items: [] });
  save("workouts");
  haptic("medium");
}

actions["workout-start"] = () => {
  startWorkout();
  render();
};

actions["ex-add"] = async () => {
  const w = activeWorkout();
  const name = $("ex-name").value.trim();
  if (!w || !name) return;
  w.items.push({ name: name.slice(0, 60), sets: [] });
  await save("workouts");
  render();
};

actions["ex-del"] = async (el) => {
  const w = activeWorkout();
  const it = w && w.items[el.dataset.i];
  if (!it) return;
  if (it.sets.length && !(await confirmAsk(`Удалить «${it.name}» со всеми подходами?`))) return;
  w.items.splice(el.dataset.i, 1);
  await save("workouts");
  render();
};

actions["set-add"] = async (el) => {
  const w = activeWorkout();
  const i = el.dataset.i;
  if (!w || !w.items[i]) return;
  const weight = parseFloat($("w-" + i).value.replace(",", ".")) || 0;
  const reps = parseInt($("r-" + i).value, 10);
  if (!(reps > 0)) return toast("Укажи количество повторений");
  w.items[i].sets.push({ w: weight, r: reps });
  haptic("medium");
  await save("workouts");
  render();
};

actions["set-del"] = async (el) => {
  const w = activeWorkout();
  if (!w) return;
  w.items[el.dataset.i].sets.splice(el.dataset.j, 1);
  await save("workouts");
  render();
};

actions["workout-finish"] = async () => {
  const w = activeWorkout();
  if (!w) return;
  w.items = w.items.filter((it) => it.sets.length);
  if (!w.items.length) {
    if (!(await confirmAsk("Ни одного подхода не записано. Удалить тренировку?"))) return;
    S.workouts = S.workouts.filter((x) => x !== w);
  } else {
    w.end = Date.now();
    hapticOk();
    toast(`Тренировка сохранена 💪 ${duration(w.end - w.start)}`);
  }
  await save("workouts");
  render();
};

actions["workout-cancel"] = async () => {
  const w = activeWorkout();
  if (!w || !(await confirmAsk("Отменить тренировку? Записанные подходы удалятся."))) return;
  S.workouts = S.workouts.filter((x) => x !== w);
  await save("workouts");
  render();
};

actions["workout-open"] = (el) => {
  openWorkoutId = openWorkoutId === el.dataset.id ? null : el.dataset.id;
  render();
};

actions["workout-del"] = async (el) => {
  if (!(await confirmAsk("Удалить эту тренировку из истории?"))) return;
  S.workouts = S.workouts.filter((x) => x.id !== el.dataset.id);
  await save("workouts");
  render();
};
