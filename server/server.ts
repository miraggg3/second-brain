// Second Brain bot server. TypeScript, no runtime dependencies:
// Node 22.18+ runs this .ts file directly (type stripping).
//
// - serves the built Mini App from ../dist
// - POST /api/me         -> premium status (user checked via Telegram initData)
// - POST /api/invoice    -> Telegram Stars invoice link
// - POST /api/send-file  -> bot sends a backup file to the user's own chat.
//                           The file is relayed, never stored on the server.
// - bot long polling: /start, /paysupport, /terms, /refund (admin), payments
//
// The server never sees notes or trackers unless the user sends a backup to the chat.

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "..", "dist");
const DATA_FILE = path.join(__dirname, "data", "db.json");

const BOT_TOKEN = process.env.BOT_TOKEN ?? "";
const WEBAPP_URL = process.env.WEBAPP_URL ?? "";
const PORT = Number(process.env.PORT ?? 3000);
const ADMIN_ID = process.env.ADMIN_ID ?? "";

const DAY = 24 * 60 * 60 * 1000;
const MAX_FILE = 15 * 1024 * 1024; // decoded size of a file sent to the chat

// ---------- plans (prices in Telegram Stars) ----------

type PlanId = "month" | "lifetime" | "tip";

interface Plan {
  amount: number;
  title: string;
  description: string;
  period?: number; // seconds; Stars subscriptions must be exactly 30 days
}

const PLANS: Record<PlanId, Plan> = {
  month: {
    amount: 99,
    title: "Second Brain Premium · месяц",
    description: "Безлимит привычек, свои трекеры, рекорды в зале и цвета. Продлевается каждые 30 дней, отменить можно в любой момент.",
    period: 30 * 24 * 60 * 60,
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

const isPlan = (v: unknown): v is PlanId => typeof v === "string" && Object.hasOwn(PLANS, v);

// ---------- tiny JSON database (only payments) ----------

interface Payment {
  plan: string;
  amount: number;
  chargeId: string;
  recurring: boolean;
  date: number;
  refunded?: boolean;
}

interface UserRecord {
  until: number;
  lifetime: boolean;
  payments: Payment[];
}

let db: { users: Record<string, UserRecord> } = { users: {} };
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

function userRecord(id: number | string): UserRecord {
  return (db.users[id] ??= { until: 0, lifetime: false, payments: [] });
}

function premiumOf(id: number) {
  const u = db.users[id];
  return {
    until: u?.until ?? 0,
    lifetime: !!u?.lifetime,
    prices: Object.fromEntries(Object.entries(PLANS).map(([k, p]) => [k, p.amount])),
  };
}

// ---------- Telegram Bot API ----------

interface TgUser { id: number; first_name?: string }

class TgError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

async function call<T = unknown>(method: string, body: BodyInit, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, { method: "POST", headers, body });
  const data = (await res.json()) as { ok: boolean; result: T; description?: string; error_code?: number };
  if (!data.ok) throw new TgError(`${method}: ${data.description}`, data.error_code ?? 0);
  return data.result;
}

function tgApi<T = unknown>(method: string, params: object = {}): Promise<T> {
  return call<T>(method, JSON.stringify(params), { "Content-Type": "application/json" });
}

function sendDocument(chatId: number, file: Buffer, filename: string, caption: string) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("caption", caption);
  form.append("document", new Blob([new Uint8Array(file)]), filename);
  return call("sendDocument", form);
}

// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export function verifyInitData(initData: unknown, token = BOT_TOKEN, maxAgeMs = DAY): TgUser | null {
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
    const user = JSON.parse(params.get("user") ?? "null") as TgUser | null;
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

// ---------- HTTP ----------

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Res = http.ServerResponse;

function sendJson(res: Res, code: number, obj: unknown) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", ...CORS });
  res.end(JSON.stringify(obj));
}

async function readJson(req: http.IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error("too big");
    chunks.push(chunk as Buffer);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}

function serveStatic(pathname: string, res: Res) {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname === "/" ? "/index.html" : pathname).slice(1);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const file = path.resolve(DIST, rel);
  const ext = path.extname(file);
  if (!file.startsWith(DIST + path.sep) || !MIME[ext]) {
    res.writeHead(404).end("Not found");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end(fs.existsSync(DIST) ? "Not found" : "Run `npm run build` first");
      return;
    }
    // hashed build assets can be cached forever, index.html never
    const cache = rel.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache";
    res.writeHead(200, { "Content-Type": MIME[ext], "Cache-Control": cache });
    res.end(data);
  });
}

const FILE_NAME_RE = /^[\p{L}\p{N} ._-]{1,80}\.(json|zip)$/u;
const lastSend = new Map<number, number>();

async function handleApi(req: http.IncomingMessage, res: Res, pathname: string) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS).end();
    return;
  }
  if (req.method !== "POST") return sendJson(res, 405, { error: "method not allowed" });
  if (!BOT_TOKEN) return sendJson(res, 503, { error: "BOT_TOKEN is not configured" });

  const limit = pathname === "/api/send-file" ? Math.ceil(MAX_FILE * 1.4) + 10_000 : 20_000;
  let body: Record<string, unknown>;
  try {
    body = await readJson(req, limit);
  } catch (e) {
    return sendJson(res, (e as Error).message === "too big" ? 413 : 400, { error: (e as Error).message === "too big" ? "too big" : "bad json" });
  }
  const user = verifyInitData(body.initData);
  if (!user) return sendJson(res, 401, { error: "bad initData" });

  if (pathname === "/api/me") return sendJson(res, 200, premiumOf(user.id));

  if (pathname === "/api/invoice") {
    const planId = body.plan;
    if (!isPlan(planId)) return sendJson(res, 400, { error: "unknown plan" });
    if (planId !== "tip" && db.users[user.id]?.lifetime) return sendJson(res, 409, { error: "already" });
    const plan = PLANS[planId];
    const params: Record<string, unknown> = {
      title: plan.title,
      description: plan.description,
      payload: `${planId}:${user.id}`,
      currency: "XTR", // Telegram Stars: no provider token needed
      prices: [{ label: plan.title, amount: plan.amount }],
    };
    if (plan.period) params.subscription_period = plan.period;
    const link = await tgApi<string>("createInvoiceLink", params);
    return sendJson(res, 200, { link });
  }

  if (pathname === "/api/send-file") {
    const { filename, content, caption } = body;
    if (typeof filename !== "string" || !FILE_NAME_RE.test(filename) || typeof content !== "string") {
      return sendJson(res, 400, { error: "bad file" });
    }
    const now = Date.now();
    if (now - (lastSend.get(user.id) ?? 0) < 5000) return sendJson(res, 429, { error: "slow down" });
    lastSend.set(user.id, now);
    const file = Buffer.from(content, "base64");
    if (!file.length) return sendJson(res, 400, { error: "empty" });
    if (file.length > MAX_FILE) return sendJson(res, 413, { error: "too big" });
    try {
      await sendDocument(user.id, file, filename, String(caption ?? "").slice(0, 900));
    } catch (e) {
      // 403: the user has not started the bot (or blocked it)
      if (e instanceof TgError && e.code === 403) return sendJson(res, 403, { error: "chat" });
      throw e;
    }
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: "not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
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
    "• Журнал зала: подходы, веса, рекорды\n" +
    "• Привычки, вода, сон, вес, настроение\n\n" +
    "Все записи хранятся только на твоём устройстве. " +
    "Чтобы перенести их на другое устройство — «Мои данные» → «Отправить файл в чат».",
  paysupport:
    "Вопросы по оплате Telegram Stars: опиши проблему ответом на это сообщение — " +
    "дату платежа и что купил. Ответим в течение 48 часов. " +
    "Если Premium не включился, закрой и снова открой приложение: статус обновится.",
  terms:
    "Условия: Premium открывает дополнительные функции приложения. " +
    "Подписка продлевается каждые 30 дней, отменить: Telegram → Настройки → Мои звёзды. " +
    "Возврат — по запросу через /paysupport, если функции не работали. " +
    "Записи пользователя хранятся на его устройстве, сервер их не получает и не хранит.",
};

function openButton() {
  return WEBAPP_URL
    ? { reply_markup: { inline_keyboard: [[{ text: "🧠 Открыть", web_app: { url: WEBAPP_URL } }]] } }
    : {};
}

interface PreCheckoutQuery { id: string; from: TgUser; currency: string; total_amount: number; invoice_payload: string }
interface SuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  subscription_expiration_date?: number;
  is_recurring?: boolean;
  is_first_recurring?: boolean;
}
interface Message { chat: { id: number }; from?: TgUser; text?: string; successful_payment?: SuccessfulPayment }
interface Update { update_id: number; message?: Message; pre_checkout_query?: PreCheckoutQuery }

async function onPreCheckout(q: PreCheckoutQuery) {
  const [planId, uid] = q.invoice_payload.split(":");
  const ok = isPlan(planId) && q.currency === "XTR" && q.total_amount === PLANS[planId].amount && String(q.from.id) === uid;
  await tgApi("answerPreCheckoutQuery", ok
    ? { pre_checkout_query_id: q.id, ok: true }
    : { pre_checkout_query_id: q.id, ok: false, error_message: "Счёт устарел. Открой оплату в приложении заново." });
}

async function onPaid(m: Message, p: SuccessfulPayment) {
  if (!m.from) return;
  const [planId] = p.invoice_payload.split(":");
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
      : "Premium активирован ⭐ Открой приложение — всё уже работает.";
  await tgApi("sendMessage", { chat_id: m.chat.id, text, ...openButton() });
}

// /refund <user_id> <charge_id> — only for ADMIN_ID
async function onRefund(m: Message, args: string[]) {
  const [uid, chargeId] = args;
  if (!uid || !chargeId) {
    await tgApi("sendMessage", { chat_id: m.chat.id, text: "Формат: /refund <user_id> <charge_id>" });
    return;
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
      }).catch((e: Error) => console.warn(e.message));
    }
  }
  saveDb();
  await tgApi("sendMessage", { chat_id: m.chat.id, text: "Возврат выполнен ✅" });
}

async function onUpdate(u: Update) {
  if (u.pre_checkout_query) return onPreCheckout(u.pre_checkout_query);
  const m = u.message;
  if (!m) return;
  if (m.successful_payment) return onPaid(m, m.successful_payment);

  const [cmd = "", ...args] = (m.text ?? "").trim().split(/\s+/);
  const name = cmd.split("@")[0];
  if (name === "/start") await tgApi("sendMessage", { chat_id: m.chat.id, text: TEXTS.start, ...openButton() });
  else if (name === "/paysupport") await tgApi("sendMessage", { chat_id: m.chat.id, text: TEXTS.paysupport });
  else if (name === "/terms") await tgApi("sendMessage", { chat_id: m.chat.id, text: TEXTS.terms });
  else if (name === "/refund" && ADMIN_ID && String(m.from?.id) === ADMIN_ID) await onRefund(m, args);
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
      const updates = await tgApi<Update[]>("getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["message", "pre_checkout_query"],
      });
      for (const u of updates) {
        offset = u.update_id + 1;
        await onUpdate(u).catch((e: Error) => console.error("update failed:", e.message));
      }
    } catch (e) {
      console.error("polling:", (e as Error).message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// ---------- start ----------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => console.log(`Mini App: http://localhost:${PORT}`));
  if (!BOT_TOKEN) {
    console.warn("BOT_TOKEN is not set: running without the bot and payments (only static files).");
  } else {
    setupBot()
      .then(() => console.log("Bot is running"))
      .catch((e: Error) => console.error("Bot setup failed:", e.message));
    void poll();
  }
}
