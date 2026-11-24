// Second Brain bot server. No dependencies, Node 20.6+.
//
// - serves the Mini App files (index.html, *.js, *.css from the repo root)
// - POST /api/me       -> premium status of the user (checked via Telegram initData)
// - POST /api/invoice  -> Telegram Stars invoice link for a plan
// - bot long polling: /start, /paysupport, /terms, /refund (admin),
//   pre-checkout checks and successful payments
//
// Run: cp .env.example .env, fill BOT_TOKEN and WEBAPP_URL, then `npm start`.

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(__dirname, "data", "db.json");

const { BOT_TOKEN = "", WEBAPP_URL = "", PORT = "3000", ADMIN_ID = "" } = process.env;

const DAY = 24 * 60 * 60 * 1000;

// Prices in Telegram Stars (XTR). Change here, the app picks them up from /api/me.
const PLANS = {
  month: {
    amount: 99,
    title: "Second Brain Premium · месяц",
    description: "Безлимит привычек, свои трекеры, рекорды в зале и темы. Продлевается каждые 30 дней, отменить можно в любой момент.",
    period: 30 * 24 * 60 * 60, // Stars subscriptions must be exactly 30 days
  },
  lifetime: {
    amount: 499,
    title: "Second Brain Premium · навсегда",
    description: "Все функции Premium навсегда, одним платежом.",
  },
  tip: {
    amount: 50,
    title: "Поддержать Second Brain",
    description: "Спасибо, что помогаешь развивать проект 💛",
  },
};

// ---------- tiny JSON database ----------

let db = { users: {} };
try {
  db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch {
  /* first start */
}

function saveDb() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function userRecord(id) {
  return (db.users[id] ||= { until: 0, lifetime: false, payments: [] });
}

function premiumOf(id) {
  const u = db.users[id];
  return {
    until: u ? u.until : 0,
    lifetime: !!(u && u.lifetime),
    prices: Object.fromEntries(Object.entries(PLANS).map(([k, p]) => [k, p.amount])),
  };
}

// ---------- Telegram Bot API ----------

async function tgApi(method, params = {}) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export function verifyInitData(initData, token = BOT_TOKEN, maxAgeMs = DAY) {
  if (!initData || typeof initData !== "string") return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const calc = crypto.createHmac("sha256", secret).update(dataCheck).digest("hex");
  if (calc.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
  const authDate = Number(params.get("auth_date")) * 1000;
  if (!authDate || Date.now() - authDate > maxAgeMs) return null;
  try {
    const user = JSON.parse(params.get("user"));
    return user && user.id ? user : null;
  } catch {
    return null;
  }
}

// ---------- HTTP ----------

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", ...CORS });
  res.end(JSON.stringify(obj));
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 100_000) throw new Error("body too large");
  }
  return JSON.parse(body || "{}");
}

// Only top-level files of the repo root with a known extension (no server/, no dotfiles).
function serveStatic(pathname, res) {
  const name = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const ext = path.extname(name);
  if (/[\\/]/.test(name) || name.startsWith(".") || !MIME[ext]) {
    res.writeHead(404).end("Not found");
    return;
  }
  fs.readFile(path.join(ROOT, name), (err, data) => {
    if (err) return res.writeHead(404).end("Not found");
    res.writeHead(200, { "Content-Type": MIME[ext], "Cache-Control": "no-cache" });
    res.end(data);
  });
}

async function handleApi(req, res, pathname) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS).end();
    return;
  }
  if (req.method !== "POST") return sendJson(res, 405, { error: "method not allowed" });
  if (!BOT_TOKEN) return sendJson(res, 503, { error: "BOT_TOKEN is not configured" });

  const body = await readJson(req);
  const user = verifyInitData(body.initData);
  if (!user) return sendJson(res, 401, { error: "bad initData" });

  if (pathname === "/api/me") return sendJson(res, 200, premiumOf(user.id));

  if (pathname === "/api/invoice") {
    const plan = PLANS[body.plan];
    if (!plan) return sendJson(res, 400, { error: "unknown plan" });
    if (body.plan !== "tip" && db.users[user.id] && db.users[user.id].lifetime) {
      return sendJson(res, 409, { error: "already" });
    }
    const params = {
      title: plan.title,
      description: plan.description,
      payload: `${body.plan}:${user.id}`,
      currency: "XTR", // Telegram Stars: no provider token needed
      prices: [{ label: plan.title, amount: plan.amount }],
    };
    if (plan.period) params.subscription_period = plan.period;
    const link = await tgApi("createInvoiceLink", params);
    return sendJson(res, 200, { link });
  }

  return sendJson(res, 404, { error: "not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, "http://localhost");
    if (pathname.startsWith("/api/")) await handleApi(req, res, pathname);
    else serveStatic(pathname, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: "server error" });
  }
});

// ---------- bot ----------

const TEXTS = {
  start:
    "Привет! Это твой второй мозг 🧠\n\n" +
    "• Заметки с тегами и экспортом в Obsidian\n" +
    "• Трекер зала: подходы, веса, рекорды\n" +
    "• Привычки, вода, сон, вес, настроение\n\n" +
    "Все данные хранятся только на твоём устройстве. Жми кнопку ниже 👇",
  paysupport:
    "Вопросы по оплате Telegram Stars: опиши проблему ответом на это сообщение, " +
    "укажи дату платежа и что купил. Мы ответим в течение 48 часов. " +
    "Если Premium не включился — открой приложение заново, статус обновится.",
  terms:
    "Условия: Premium открывает дополнительные функции приложения. " +
    "Подписка продлевается каждые 30 дней, отменить можно в Telegram → Настройки → Мои звёзды. " +
    "Возврат возможен по запросу через /paysupport, если функции не работали. " +
    "Данные хранятся на устройстве пользователя, мы их не получаем.",
};

function openButton() {
  return WEBAPP_URL
    ? { reply_markup: { inline_keyboard: [[{ text: "🧠 Открыть", web_app: { url: WEBAPP_URL } }]] } }
    : {};
}

async function onPreCheckout(q) {
  const [planId, uid] = String(q.invoice_payload).split(":");
  const plan = PLANS[planId];
  const ok = !!plan && q.currency === "XTR" && q.total_amount === plan.amount && String(q.from.id) === uid;
  await tgApi("answerPreCheckoutQuery", ok
    ? { pre_checkout_query_id: q.id, ok: true }
    : { pre_checkout_query_id: q.id, ok: false, error_message: "Счёт устарел. Открой оплату в приложении заново." });
}

async function onPaid(m) {
  const p = m.successful_payment;
  const [planId] = String(p.invoice_payload).split(":");
  const u = userRecord(m.from.id);
  u.payments.push({
    plan: planId,
    amount: p.total_amount,
    chargeId: p.telegram_payment_charge_id,
    recurring: !!p.is_recurring,
    date: Date.now(),
  });
  if (planId === "month") {
    u.until = p.subscription_expiration_date
      ? p.subscription_expiration_date * 1000
      : Math.max(u.until, Date.now()) + 30 * DAY;
  }
  if (planId === "lifetime") u.lifetime = true;
  saveDb();
  console.log(`payment: user ${m.from.id} ${planId} ${p.total_amount}⭐`);

  const text = planId === "tip"
    ? "Спасибо за поддержку! 💛"
    : p.is_recurring && !p.is_first_recurring
      ? "Подписка Premium продлена ⭐ Спасибо!"
      : "Premium активирован ⭐ Открой приложение, всё уже работает.";
  await tgApi("sendMessage", { chat_id: m.chat.id, text, ...openButton() });
}

// /refund <user_id> <charge_id> — only for ADMIN_ID
async function onRefund(m, args) {
  const [uid, chargeId] = args;
  if (!uid || !chargeId) {
    return tgApi("sendMessage", { chat_id: m.chat.id, text: "Формат: /refund <user_id> <charge_id>" });
  }
  await tgApi("refundStarPayment", { user_id: Number(uid), telegram_payment_charge_id: chargeId });
  const u = userRecord(uid);
  const pay = u.payments.find((x) => x.chargeId === chargeId);
  if (pay) {
    pay.refunded = true;
    if (pay.plan === "lifetime") u.lifetime = false;
    if (pay.plan === "month") {
      u.until = 0;
      await tgApi("editUserStarSubscription", {
        user_id: Number(uid), telegram_payment_charge_id: chargeId, is_canceled: true,
      }).catch((e) => console.warn(e.message));
    }
  }
  saveDb();
  await tgApi("sendMessage", { chat_id: m.chat.id, text: "Возврат выполнен ✅" });
}

async function onUpdate(u) {
  if (u.pre_checkout_query) return onPreCheckout(u.pre_checkout_query);
  const m = u.message;
  if (!m) return;
  if (m.successful_payment) return onPaid(m);

  const [cmd, ...args] = (m.text || "").trim().split(/\s+/);
  const name = cmd.split("@")[0];
  if (name === "/start") return tgApi("sendMessage", { chat_id: m.chat.id, text: TEXTS.start, ...openButton() });
  if (name === "/paysupport") return tgApi("sendMessage", { chat_id: m.chat.id, text: TEXTS.paysupport });
  if (name === "/terms") return tgApi("sendMessage", { chat_id: m.chat.id, text: TEXTS.terms });
  if (name === "/refund" && ADMIN_ID && String(m.from.id) === ADMIN_ID) return onRefund(m, args);
}

async function setupBot() {
  await tgApi("deleteWebhook");
  await tgApi("setMyCommands", {
    commands: [
      { command: "start", description: "Открыть второй мозг" },
      { command: "paysupport", description: "Помощь с оплатой" },
      { command: "terms", description: "Условия" },
    ],
  });
  if (WEBAPP_URL) {
    await tgApi("setChatMenuButton", {
      menu_button: { type: "web_app", text: "Открыть", web_app: { url: WEBAPP_URL } },
    });
  }
}

async function poll() {
  let offset = 0;
  for (;;) {
    try {
      const updates = await tgApi("getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["message", "pre_checkout_query"],
      });
      for (const u of updates) {
        offset = u.update_id + 1;
        await onUpdate(u).catch((e) => console.error("update failed:", e.message));
      }
    } catch (e) {
      console.error("polling:", e.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// ---------- start ----------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(Number(PORT), () => console.log(`Mini App: http://localhost:${PORT}`));
  if (!BOT_TOKEN) {
    console.warn("BOT_TOKEN is not set: running without the bot and payments (only static files).");
  } else {
    setupBot()
      .then(() => console.log("Bot is running"))
      .catch((e) => console.error("Bot setup failed:", e.message));
    poll();
  }
}
