// Premium for Telegram Stars. The bot server (server/server.js) creates the
// invoice and remembers who paid; here we only show plans and open the invoice.

const API_BASE = (document.querySelector('meta[name="api-base"]') || {}).content || "";

// Shown until the server answers with its real prices
let PRICES = { month: 99, lifetime: 499, tip: 50 };

const ACCENTS = ["#2a83f6", "#8b5cf6", "#ec4899", "#f97316", "#10b981", "#eab308", "#ef4444", "#14b8a6"];

function isPremium() {
  return !!(S.premium.lifetime || S.premium.until > Date.now());
}

function premiumBadge() {
  return isPremium()
    ? `<button class="badge on" data-act="open-premium">⭐ Premium</button>`
    : `<button class="badge" data-act="open-premium">⭐ Premium</button>`;
}

// Returns true if premium is active, otherwise opens the paywall.
function requirePremium(reason) {
  if (isPremium()) return true;
  toast(reason || "Это функция Premium ⭐");
  openOverlay("premium");
  return false;
}

function applyTheme() {
  const root = document.documentElement.style;
  if (isPremium() && S.settings.accent) root.setProperty("--accent", S.settings.accent);
  else root.removeProperty("--accent");
}

async function api(path, body = {}) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: tg.initData, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function refreshPremium() {
  if (!inTelegram) return;
  try {
    const p = await api("/api/me");
    if (p.prices) PRICES = p.prices;
    S.premium = { until: p.until || 0, lifetime: !!p.lifetime };
    await save("premium");
    applyTheme();
    if (currentOverlay === "premium") renderers.premium();
    else render();
  } catch (e) {
    console.warn("Premium status not refreshed:", e.message);
  }
}

async function buy(plan) {
  if (!inTelegram) return toast("Оплата работает только внутри Telegram");
  if (!tg.isVersionAtLeast("6.1")) return toast("Обнови Telegram, чтобы оплатить");
  try {
    const { link } = await api("/api/invoice", { plan });
    tg.openInvoice(link, async (status) => {
      if (status === "paid") {
        hapticOk();
        toast(plan === "tip" ? "Спасибо за поддержку! 💛" : "Premium активирован ⭐");
        // the bot gets the payment a moment later; ask twice to be safe
        await refreshPremium();
        setTimeout(refreshPremium, 3000);
      } else if (status === "failed") {
        toast("Платёж не прошёл");
      }
    });
  } catch (e) {
    toast(e.message === "already" ? "У тебя уже Premium навсегда ⭐" : "Сервер недоступен, попробуй позже");
  }
}

renderers.premium = function () {
  const p = S.premium;
  const status = p.lifetime
    ? "Premium навсегда активен. Спасибо! 💛"
    : p.until > Date.now()
      ? `Premium активен до ${formatDate(p.until, { dateStyle: "long" })}`
      : "Сейчас бесплатная версия";

  $("screen-premium").innerHTML = `
  <div class="hero">
    <div class="star">⭐</div>
    <h1>Second Brain Premium</h1>
    <p class="hint">${status}</p>
  </div>

  <section class="card">
    <div class="item"><span>♾️</span><span class="grow">Безлимит привычек <small class="hint">(бесплатно ${FREE_HABITS})</small></span></div>
    <div class="item"><span>📊</span><span class="grow">Свои трекеры: шаги, страницы, отжимания, что угодно</span></div>
    <div class="item"><span>🏆</span><span class="grow">Рекорды и графики силы по каждому упражнению</span></div>
    <div class="item"><span>🎨</span><span class="grow">Цветовые темы оформления</span></div>
    <div class="item"><span>💛</span><span class="grow">Поддержка разработки новых функций</span></div>
  </section>

  ${p.lifetime ? "" : `
  <button class="plan" data-act="buy" data-plan="month">
    <span class="grow"><b>Месяц</b><small>подписка, продлевается автоматически</small></span>
    <b>${PRICES.month} ⭐</b>
  </button>
  <button class="plan best" data-act="buy" data-plan="lifetime">
    <span class="grow"><b>Навсегда</b><small>один платёж, без подписки</small></span>
    <b>${PRICES.lifetime} ⭐</b>
  </button>`}
  <button class="plan" data-act="buy" data-plan="tip">
    <span class="grow"><b>Поддержать автора</b><small>просто сказать спасибо</small></span>
    <b>${PRICES.tip} ⭐</b>
  </button>

  <section class="card">
    <h2>🎨 Тема ${isPremium() ? "" : "<small>⭐</small>"}</h2>
    <div class="accents">
      ${ACCENTS.map((c) => `<button class="accent-dot ${S.settings.accent === c ? "active" : ""}" style="background:${c}" data-act="accent" data-c="${c}" aria-label="${c}"></button>`).join("")}
      <button class="accent-dot reset" data-act="accent" data-c="" aria-label="Тема Telegram">↺</button>
    </div>
  </section>

  <p class="hint small">Оплата через Telegram Stars. Подписку можно отменить в настройках Telegram → Мои звёзды.
  Вопросы по оплате: команда /paysupport в боте. Данные хранятся только на твоём устройстве.</p>

  <button class="secondary" data-act="close-premium">Назад</button>`;
};

actions["open-premium"] = () => openOverlay("premium");
actions["close-premium"] = () => closeOverlay();
actions.buy = (el) => buy(el.dataset.plan);

actions.accent = async (el) => {
  if (el.dataset.c && !isPremium()) return toast("Темы доступны в Premium ⭐");
  S.settings.accent = el.dataset.c || null;
  await save("settings");
  applyTheme();
  haptic();
  renderers.premium();
};
