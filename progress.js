// "Progress" tab: charts for body weight, sleep, water, mood, habits,
// and premium analytics (exercise records + custom trackers).

let selectedExercise = null;

function lastDays(n) {
  return Array.from({ length: n }, (_, i) => daysAgo(n - 1 - i));
}

function seriesOf(map, days) {
  return days.map((d) => ({ label: String(d.getDate()), value: map[dayKey(d)] || 0 }));
}

// Best result per workout for one exercise, oldest first
function exerciseHistory(name) {
  return finishedWorkouts().slice().reverse()
    .map((w) => {
      const it = w.items.find((x) => x.name === name);
      if (!it || !it.sets.length) return null;
      return {
        date: w.start,
        best1rm: Math.max(...it.sets.map((s) => e1rm(s.w, s.r))),
        maxW: Math.max(...it.sets.map((s) => s.w)),
        volume: it.sets.reduce((sum, s) => sum + s.w * s.r, 0),
      };
    })
    .filter(Boolean);
}

function exerciseSection() {
  const names = [...new Set(finishedWorkouts().flatMap((w) => w.items.map((i) => i.name)))];
  if (!isPremium()) {
    return `
    <section class="card locked" data-act="open-premium">
      <h2>🏆 Рекорды в зале <small>⭐</small></h2>
      <p class="hint">Личные рекорды, расчётный максимум на 1 повтор и график роста по каждому упражнению.</p>
      <button class="small">Открыть Premium</button>
    </section>`;
  }
  if (!names.length) {
    return `<section class="card"><h2>🏆 Рекорды в зале</h2><p class="hint">Заверши первую тренировку, и здесь появятся рекорды.</p></section>`;
  }
  if (!names.includes(selectedExercise)) selectedExercise = names[0];
  const h = exerciseHistory(selectedExercise);
  const pr = Math.max(...h.map((x) => x.maxW));
  const best = Math.max(...h.map((x) => x.best1rm));
  return `
  <section class="card">
    <h2>🏆 Рекорды в зале</h2>
    <div class="chips">
      ${names.map((n) => `<button class="chip ${n === selectedExercise ? "active" : ""}" data-act="pick-ex" data-name="${esc(n)}">${esc(n)}</button>`).join("")}
    </div>
    <div class="stats three">
      <div><b>${num(pr)}</b><small>макс. вес, кг</small></div>
      <div><b>${num(best)}</b><small>1ПМ (расчёт), кг</small></div>
      <div><b>${h.length}</b><small>тренировок</small></div>
    </div>
    <h3>Расчётный 1ПМ</h3>
    ${lineChart(h.map((x) => ({ label: shortDay(x.date), value: x.best1rm })), { unit: " кг" })}
    <h3>Объём за тренировку</h3>
    ${lineChart(h.map((x) => ({ label: shortDay(x.date), value: x.volume })), { unit: " кг", digits: 0 })}
  </section>`;
}

renderers.progress = function () {
  const days14 = lastDays(14);
  const m = S.metrics;
  const weights = Object.keys(m.weight).sort().map((d) => ({ label: shortDay(d), value: m.weight[d] }));
  const moods = days14.filter((d) => m.mood[dayKey(d)]).map((d) => ({ label: shortDay(d), value: m.mood[dayKey(d)] }));

  const habits = S.habits.map((h) => {
    const done = lastDays(30).filter((d) => h.done[dayKey(d)]).length;
    return `
    <div class="item">
      <span class="grow">${esc(h.emoji || "")} ${esc(h.name)}</span>
      <b>${Math.round((done / 30) * 100)}%</b>
    </div>
    <div class="progress"><i style="width:${(done / 30) * 100}%"></i></div>`;
  }).join("");

  const allHabitsLevel = (d) => {
    if (!S.habits.length) return 0;
    const share = S.habits.filter((h) => h.done[d]).length / S.habits.length;
    return share === 0 ? 0 : share < 0.5 ? 1 : share < 1 ? 2 : 3;
  };

  const trackers = isPremium() ? S.trackers.map((t) => `
    <section class="card">
      <h2>${esc(t.name)}</h2>
      ${barChart(seriesOf(t.values, days14), { unit: " " + t.unit })}
    </section>`).join("") : "";

  $("screen-progress").innerHTML = `
  <header class="top">
    <h1>Прогресс</h1>
    ${premiumBadge()}
  </header>

  <section class="card">
    <h2>⚖️ Вес тела</h2>
    ${lineChart(weights.slice(-60), { unit: " кг" })}
  </section>

  ${exerciseSection()}

  <section class="card">
    <h2>✅ Привычки за 30 дней</h2>
    ${habits || `<p class="hint">Добавь привычки на вкладке «Сегодня».</p>`}
    ${S.habits.length ? heatmap(allHabitsLevel) : ""}
  </section>

  <section class="card">
    <h2>😴 Сон, 14 дней</h2>
    ${barChart(seriesOf(m.sleep, days14), { unit: " ч", goal: 8 })}
  </section>

  <section class="card">
    <h2>💧 Вода, 14 дней</h2>
    ${barChart(seriesOf(m.water, days14), { unit: " мл", goal: S.settings.waterGoal, digits: 0 })}
  </section>

  <section class="card">
    <h2>🙂 Настроение</h2>
    ${lineChart(moods, { digits: 0 })}
  </section>

  ${trackers}`;
};

actions["pick-ex"] = (el) => {
  selectedExercise = el.dataset.name;
  render();
};
