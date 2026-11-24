// Core: app state, helpers, navigation and shared UI (sheet, toast, confirm).
// Feature files (today.js, gym.js, notes.js, progress.js, premium.js) register
// their screen renderers in `renderers` and their buttons in `actions`.

const tg = window.Telegram ? window.Telegram.WebApp : null;
const inTelegram = !!(tg && tg.initData); // false when opened in a normal browser

// ---------- state ----------

// Every top-level key is stored separately in DeviceStorage / localStorage.
const DEFAULTS = {
  notes: [],      // [{ id, text, created, updated }]
  workouts: [],   // [{ id, start, end|null, items: [{ name, sets: [{ w, r }] }] }]
  habits: [],     // [{ id, name, emoji, created, done: { "2026-11-24": true } }]
  metrics: { water: {}, sleep: {}, mood: {}, weight: {} }, // { kind: { day: number } }
  trackers: [],   // premium: [{ id, name, unit, step, values: { day: number } }]
  settings: { accent: null, waterGoal: 2000 },
  premium: { until: 0, lifetime: false }, // cached copy of the server answer
};

const S = JSON.parse(JSON.stringify(DEFAULTS));

async function loadAll() {
  for (const key of Object.keys(DEFAULTS)) {
    const value = await loadKey(key, DEFAULTS[key]);
    const def = DEFAULTS[key];
    // plain objects: merge so new sub-keys added in updates get their defaults
    S[key] = !Array.isArray(def) && typeof def === "object" ? { ...def, ...value } : value;
  }
}

function save(key) {
  return saveKey(key, S[key]).catch((e) => {
    console.error(e);
    toast("Не удалось сохранить");
  });
}

// ---------- helpers ----------

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Local calendar day as "YYYY-MM-DD"
function dayKey(d = new Date()) {
  const x = new Date(d);
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${x.getFullYear()}-${mm}-${dd}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

// Monday 00:00 of the week containing `d`
function startOfWeek(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function formatDate(ms, opts = { dateStyle: "short", timeStyle: "short" }) {
  return new Date(ms).toLocaleString("ru-RU", opts);
}

function num(v, digits = 1) {
  return Number(v.toFixed(digits)).toLocaleString("ru-RU");
}

// "1 тренировка / 2 тренировки / 5 тренировок"
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

function haptic(type = "light") {
  if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred(type);
}

function hapticOk() {
  if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
}

// ---------- actions (event delegation) ----------
// <button data-act="habit-toggle" data-id="..."> calls actions["habit-toggle"](el)

const actions = {};
const changes = {};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (el && actions[el.dataset.act]) actions[el.dataset.act](el, e);
});

document.addEventListener("change", (e) => {
  const el = e.target.closest("[data-change]");
  if (el && changes[el.dataset.change]) changes[el.dataset.change](el, e);
});

// ---------- navigation ----------

const renderers = {}; // tab name -> function that redraws that screen
let currentTab = "today";
let currentOverlay = null;

function hideAllScreens() {
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = true));
}

function showTab(name) {
  currentTab = name;
  currentOverlay = null;
  hideAllScreens();
  $("screen-" + name).hidden = false;
  $("tabbar").hidden = false;
  document.querySelectorAll("#tabbar button").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === name));
  if (tg && tg.BackButton) tg.BackButton.hide();
  render();
  window.scrollTo(0, 0);
}

function render() {
  if (renderers[currentTab]) renderers[currentTab]();
}

function openOverlay(name) {
  currentOverlay = name;
  hideAllScreens();
  $("tabbar").hidden = true;
  $("screen-" + name).hidden = false;
  if (renderers[name]) renderers[name]();
  if (tg && tg.BackButton) tg.BackButton.show();
  window.scrollTo(0, 0);
}

function closeOverlay() {
  showTab(currentTab);
}

actions.tab = (el) => {
  haptic();
  showTab(el.dataset.tab);
};

// ---------- toast ----------

let toastTimer = null;
function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2500);
}

// ---------- confirm ----------

function confirmAsk(text) {
  return new Promise((resolve) => {
    if (inTelegram && tg.isVersionAtLeast && tg.isVersionAtLeast("6.2")) {
      tg.showConfirm(text, (ok) => resolve(ok));
    } else {
      resolve(window.confirm(text));
    }
  });
}

// ---------- bottom sheet form ----------
// ask({ title, fields: [{ name, label, type, value, placeholder, step }] })
// resolves to { name: value } or null when cancelled.

let sheetResolve = null;

function ask({ title, fields, ok = "Сохранить" }) {
  $("sheet-title").textContent = title;
  $("sheet-ok").textContent = ok;
  $("sheet-fields").innerHTML = fields.map((f) => `
    <label>${esc(f.label || "")}
      <input name="${esc(f.name)}" type="${f.type || "text"}" value="${esc(f.value ?? "")}"
        placeholder="${esc(f.placeholder || "")}" ${f.step ? `step="${f.step}"` : ""}
        ${f.type === "number" ? 'inputmode="decimal"' : ""} autocomplete="off">
    </label>`).join("");
  $("sheet").hidden = false;
  const first = $("sheet-fields").querySelector("input");
  if (first) setTimeout(() => first.focus(), 50);
  return new Promise((resolve) => (sheetResolve = resolve));
}

function closeSheet(result) {
  $("sheet").hidden = true;
  if (sheetResolve) sheetResolve(result);
  sheetResolve = null;
}

function sheetOpen() {
  return !$("sheet").hidden;
}

$("sheet-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const values = {};
  for (const input of $("sheet-fields").querySelectorAll("input")) values[input.name] = input.value.trim();
  closeSheet(values);
});
$("sheet-cancel").onclick = () => closeSheet(null);
$("sheet").addEventListener("click", (e) => {
  if (e.target.id === "sheet") closeSheet(null);
});
