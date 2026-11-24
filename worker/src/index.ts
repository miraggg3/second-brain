// Second Brain bot + API on Cloudflare Workers.
//
// The Mini App itself is static (GitHub Pages). This worker:
// - POST /api/me         premium status (user checked via Telegram initData)
// - POST /api/invoice    Telegram Stars invoice link
// - POST /api/send-file  bot sends a backup file to the user's own chat
// - POST /api/download   one-time link for Telegram's native "download file" dialog
// - GET  /dl/<token>/... serves that file once, then forgets it (kept at most 5 minutes)
// - POST /bot            Telegram webhook (payments, /start, /paysupport, /terms, /refund)
// - GET  /setup?secret=  one-time: registers the webhook, commands and menu button
//
// User notes and trackers are never stored here. KV keeps only payments
// and, for up to 5 minutes, a file the user asked to download.

export interface Env {
  DB: KVNamespace;
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  WEBAPP_URL: string;
  ADMIN_ID?: string;
}

const DAY = 86_400_000;
const MAX_FILE = 15 * 1024 * 1024;

// ---------- plans (prices in Telegram Stars) ----------

type PlanId = "month" | "lifetime" | "tip";

const PLANS: Record<PlanId, { amount: number; title: string; description: string; period?: number }> = {
  month: {
    amount: 99,
    title: "Second Brain Premium · месяц",
    description: "Все темы, свои трекеры, безлимит привычек, рекорды в зале. Продлевается каждые 30 дней, отменить можно в любой момент.",
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

const isPlan = (v: unknown): v is PlanId => typeof v === "string" && Object.hasOwn(PLANS, v);

// ---------- storage ----------

interface Payment { plan: string; amount: number; chargeId: string; recurring: boolean; date: number; refunded?: boolean }
interface UserRecord { until: number; lifetime: boolean; payments: Payment[] }

async function getUser(env: Env, id: number | string): Promise<UserRecord> {
  return (await env.DB.get<UserRecord>(`user:${id}`, "json")) ?? { until: 0, lifetime: false, payments: [] };
}

function putUser(env: Env, id: number | string, u: UserRecord) {
  return env.DB.put(`user:${id}`, JSON.stringify(u));
}

// ---------- Telegram ----------

interface TgUser { id: number; first_name?: string }

class TgError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

async function tg<T = unknown>(env: Env, method: string, body: object | FormData = {}): Promise<T> {
  const init: RequestInit = body instanceof FormData
    ? { method: "POST", body }
    : { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } };
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, init);
  const data = await res.json<{ ok: boolean; result: T; description?: string; error_code?: number }>();
  if (!data.ok) throw new TgError(`${method}: ${data.description}`, data.error_code ?? 0);
  return data.result;
}

const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
async function verifyInitData(initData: unknown, token: string): Promise<TgUser | null> {
  if (!initData || typeof initData !== "string") return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const check = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = await hmac(enc.encode("WebAppData"), token);
  if (!safeEqual(hex(await hmac(secret, check)), hash)) return null;
  const authDate = Number(params.get("auth_date")) * 1000;
  if (!authDate || Date.now() - authDate > DAY) return null;
  try {
    const user = JSON.parse(params.get("user") ?? "null") as TgUser | null;
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

// ---------- HTTP helpers ----------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, obj: unknown) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS } });

const FILE_NAME_RE = /^[\p{L}\p{N} ._-]{1,80}\.(json|zip)$/u;

function decodeFile(body: Record<string, unknown>): { name: string; bytes: Uint8Array } | Response {
  const { filename, content } = body;
  if (typeof filename !== "string" || !FILE_NAME_RE.test(filename) || typeof content !== "string") {
    return json(400, { error: "bad file" });
  }
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0));
  } catch {
    return json(400, { error: "bad file" });
  }
  if (!bytes.length) return json(400, { error: "empty" });
  if (bytes.length > MAX_FILE) return json(413, { error: "too big" });
  return { name: filename, bytes };
}

// ---------- API ----------

async function handleApi(req: Request, env: Env, path: string, origin: string): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const raw = await req.text();
  if (raw.length > MAX_FILE * 1.4 + 10_000) return json(413, { error: "too big" });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return json(400, { error: "bad json" });
  }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user) return json(401, { error: "bad initData" });

  if (path === "/api/me") {
    const u = await getUser(env, user.id);
    const prices = Object.fromEntries(Object.entries(PLANS).map(([k, p]) => [k, p.amount]));
    return json(200, { until: u.until, lifetime: u.lifetime, prices });
  }

  if (path === "/api/invoice") {
    const planId = body.plan;
    if (!isPlan(planId)) return json(400, { error: "unknown plan" });
    if (planId !== "tip" && (await getUser(env, user.id)).lifetime) return json(409, { error: "already" });
    const plan = PLANS[planId];
    const link = await tg<string>(env, "createInvoiceLink", {
      title: plan.title,
      description: plan.description,
      payload: `${planId}:${user.id}`,
      currency: "XTR", // Telegram Stars: no provider token needed
      prices: [{ label: plan.title, amount: plan.amount }],
      ...(plan.period ? { subscription_period: plan.period } : {}),
    });
    return json(200, { link });
  }

  if (path === "/api/send-file") {
    const file = decodeFile(body);
    if (file instanceof Response) return file;
    const form = new FormData();
    form.append("chat_id", String(user.id));
    form.append("caption", String(body.caption ?? "").slice(0, 900));
    form.append("document", new Blob([file.bytes]), file.name);
    try {
      await tg(env, "sendDocument", form);
    } catch (e) {
      // 403: the user never pressed /start or blocked the bot
      if (e instanceof TgError && e.code === 403) return json(403, { error: "chat" });
      throw e;
    }
    return json(200, { ok: true });
  }

  if (path === "/api/download") {
    const file = decodeFile(body);
    if (file instanceof Response) return file;
    const token = crypto.randomUUID();
    await env.DB.put(`dl:${token}`, file.bytes, { expirationTtl: 300 });
    return json(200, { url: `${origin}/dl/${token}/${encodeURIComponent(file.name)}` });
  }

  return json(404, { error: "not found" });
}

async function handleDownload(env: Env, path: string): Promise<Response> {
  const [, , token, name] = path.split("/");
  if (!token || !/^[0-9a-f-]{36}$/.test(token)) return new Response("Not found", { status: 404 });
  const data = await env.DB.get(`dl:${token}`, "arrayBuffer");
  if (!data) return new Response("Ссылка устарела", { status: 410 });
  await env.DB.delete(`dl:${token}`);
  const fileName = decodeURIComponent(name ?? "backup.json");
  return new Response(data, {
    headers: {
      "Content-Type": fileName.endsWith(".zip") ? "application/zip" : "application/json",
      "Content-Disposition": `attachment; filename="backup${fileName.endsWith(".zip") ? ".zip" : ".json"}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
      ...CORS,
    },
  });
}

// ---------- bot ----------

const TEXTS = {
  start:
    "Привет! Это твой второй мозг 🧠\n\n" +
    "• Заметки с тегами и экспортом в Obsidian\n" +
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
};

const openButton = (env: Env) => ({
  reply_markup: { inline_keyboard: [[{ text: "🧠 Открыть", web_app: { url: env.WEBAPP_URL } }]] },
});

interface SuccessfulPayment {
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  subscription_expiration_date?: number;
  is_recurring?: boolean;
  is_first_recurring?: boolean;
}
interface Message { chat: { id: number }; from?: TgUser; text?: string; successful_payment?: SuccessfulPayment }
interface Update {
  message?: Message;
  pre_checkout_query?: { id: string; from: TgUser; currency: string; total_amount: number; invoice_payload: string };
}

async function onUpdate(env: Env, u: Update) {
  const q = u.pre_checkout_query;
  if (q) {
    const [planId, uid] = q.invoice_payload.split(":");
    const ok = isPlan(planId) && q.currency === "XTR" && q.total_amount === PLANS[planId].amount && String(q.from.id) === uid;
    await tg(env, "answerPreCheckoutQuery", ok
      ? { pre_checkout_query_id: q.id, ok: true }
      : { pre_checkout_query_id: q.id, ok: false, error_message: "Счёт устарел. Открой оплату в приложении заново." });
    return;
  }

  const m = u.message;
  if (!m) return;
  const p = m.successful_payment;
  if (p && m.from) {
    const [planId] = p.invoice_payload.split(":");
    const rec = await getUser(env, m.from.id);
    rec.payments.push({
      plan: planId, amount: p.total_amount, chargeId: p.telegram_payment_charge_id,
      recurring: !!p.is_recurring, date: Date.now(),
    });
    if (planId === "month") {
      rec.until = p.subscription_expiration_date
        ? p.subscription_expiration_date * 1000
        : Math.max(rec.until, Date.now()) + 30 * DAY;
    }
    if (planId === "lifetime") rec.lifetime = true;
    await putUser(env, m.from.id, rec);
    const text = planId === "tip"
      ? "Спасибо за поддержку! 💛"
      : p.is_recurring && !p.is_first_recurring
        ? "Подписка Premium продлена ⭐ Спасибо!"
        : "Premium активирован ⭐ Открой приложение — всё уже работает.";
    await tg(env, "sendMessage", { chat_id: m.chat.id, text, ...openButton(env) });
    return;
  }

  const [cmd = "", ...args] = (m.text ?? "").trim().split(/\s+/);
  const name = cmd.split("@")[0];
  if (name === "/start") await tg(env, "sendMessage", { chat_id: m.chat.id, text: TEXTS.start, ...openButton(env) });
  else if (name === "/paysupport") await tg(env, "sendMessage", { chat_id: m.chat.id, text: TEXTS.paysupport });
  else if (name === "/terms") await tg(env, "sendMessage", { chat_id: m.chat.id, text: TEXTS.terms });
  else if (name === "/refund" && env.ADMIN_ID && String(m.from?.id) === env.ADMIN_ID) {
    const [uid, chargeId] = args;
    if (!uid || !chargeId) {
      await tg(env, "sendMessage", { chat_id: m.chat.id, text: "Формат: /refund <user_id> <charge_id>" });
      return;
    }
    await tg(env, "refundStarPayment", { user_id: Number(uid), telegram_payment_charge_id: chargeId });
    const rec = await getUser(env, uid);
    const pay = rec.payments.find((x) => x.chargeId === chargeId);
    if (pay) {
      pay.refunded = true;
      if (pay.plan === "lifetime") rec.lifetime = false;
      if (pay.plan === "month") {
        rec.until = 0;
        await tg(env, "editUserStarSubscription", {
          user_id: Number(uid), telegram_payment_charge_id: chargeId, is_canceled: true,
        }).catch(() => undefined);
      }
    }
    await putUser(env, uid, rec);
    await tg(env, "sendMessage", { chat_id: m.chat.id, text: "Возврат выполнен ✅" });
  }
}

async function setup(env: Env, origin: string): Promise<Response> {
  await tg(env, "setWebhook", {
    url: `${origin}/bot`,
    secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ["message", "pre_checkout_query"],
  });
  await tg(env, "setMyCommands", {
    commands: [
      { command: "start", description: "Открыть второй мозг" },
      { command: "paysupport", description: "Помощь с оплатой" },
      { command: "terms", description: "Условия" },
    ],
  });
  await tg(env, "setChatMenuButton", {
    menu_button: { type: "web_app", text: "Открыть", web_app: { url: env.WEBAPP_URL } },
  });
  return new Response("Готово: webhook, команды и кнопка меню настроены ✅", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

// ---------- entry ----------

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(req, env, url.pathname, url.origin);
      if (url.pathname.startsWith("/dl/") && req.method === "GET") return await handleDownload(env, url.pathname);

      if (url.pathname === "/bot" && req.method === "POST") {
        const secret = req.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!env.WEBHOOK_SECRET || !safeEqual(secret, env.WEBHOOK_SECRET)) return new Response("forbidden", { status: 403 });
        const update = await req.json<Update>();
        // answer Telegram at once, handle the update in the background
        ctx.waitUntil(onUpdate(env, update).catch((e: Error) => console.error("update failed:", e.message)));
        return new Response("ok");
      }

      if (url.pathname === "/setup" && env.WEBHOOK_SECRET && safeEqual(url.searchParams.get("secret") ?? "", env.WEBHOOK_SECRET)) {
        return await setup(env, url.origin);
      }

      return new Response("Second Brain bot", { status: 200 });
    } catch (e) {
      console.error(e);
      return json(500, { error: "server error" });
    }
  },
} satisfies ExportedHandler<Env>;
