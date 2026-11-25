// Second Brain bot + API on Cloudflare Workers.
//
// The Mini App itself is static (GitHub Pages). This worker:
// - POST /api/me         premium status (user checked via Telegram initData)
// - POST /api/invoice    Telegram Stars invoice link
// - POST /api/send-file  bot sends a backup file to the user's own chat
// - POST /api/download   one-time link for Telegram's native "download file" dialog
// - POST /api/share      prepared message with an "Открыть" button for WebApp.shareMessage
// - POST /api/share-photo the same with a picture of a card (kept one day in KV)
// - POST /api/story-image picture for WebApp.shareToStory (public URL, one day)
// - GET  /img/<id>.jpg   that picture, for Telegram
// - GET  /dl/<token>/... serves that file once, then forgets it (kept at most 5 minutes)
// - POST /bot            Telegram webhook (payments, /start, /paysupport, /terms, /refund)
// - GET  /setup?secret=  one-time: registers the webhook, commands and menu button
//
// User notes and trackers are never stored here. KV keeps only payments,
// for up to 5 minutes a file the user asked to download and for one day a
// picture of a card the user chose to share.

import { LANGS, langOf, texts, type Lang } from "./texts";

export interface Env {
  DB: KVNamespace;
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  WEBAPP_URL: string;
  ADMIN_ID?: string;
}

const DAY = 86_400_000;
const MAX_FILE = 15 * 1024 * 1024;
const MAX_IMAGE = 2 * 1024 * 1024;

// ---------- plans (prices in Telegram Stars) ----------

type PlanId = "month" | "lifetime" | "tip";

const PLANS: Record<PlanId, { amount: number; period?: number }> = {
  month: { amount: 99, period: 30 * 24 * 60 * 60 }, // Stars subscriptions must be exactly 30 days
  lifetime: { amount: 499 },
  tip: { amount: 50 },
};

function planText(id: PlanId, lang: Lang): { title: string; description: string } {
  const x = texts(lang);
  if (id === "month") return { title: x.planMonthTitle, description: x.planMonthDescription };
  if (id === "lifetime") return { title: x.planLifetimeTitle, description: x.planLifetimeDescription };
  return { title: x.planTipTitle, description: x.planTipDescription };
}

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

interface TgUser { id: number; first_name?: string; language_code?: string }

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

// Browsers may call the API only from the Mini App itself (WEBAPP_URL).
// This is in addition to the initData check: without a valid Telegram
// signature every /api/ request is rejected anyway.
const appOrigin = (env: Env) => new URL(env.WEBAPP_URL).origin;

function withCors(res: Response, env: Env): Response {
  const out = new Response(res.body, res);
  out.headers.set("Access-Control-Allow-Origin", appOrigin(env));
  out.headers.set("Access-Control-Allow-Headers", "Content-Type");
  out.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  out.headers.append("Vary", "Origin");
  return out;
}

// files for Telegram's native download dialog are fetched by Telegram itself
const DOWNLOAD_CORS = { "Access-Control-Allow-Origin": "*" };

const json = (status: number, obj: unknown) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

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
  // a browser on another site: refuse before reading the body
  const from = req.headers.get("Origin");
  if (from && from !== appOrigin(env)) return json(403, { error: "origin" });

  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
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
  const lang = langOf(user.language_code, body.lang);

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
    const { title, description } = planText(planId, lang);
    const link = await tg<string>(env, "createInvoiceLink", {
      title,
      description,
      payload: `${planId}:${user.id}`,
      currency: "XTR", // Telegram Stars: no provider token needed
      prices: [{ label: title, amount: plan.amount }],
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

  if (path === "/api/share") {
    // a message the user can send to any chat via WebApp.shareMessage
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 1000) : "";
    if (!text) return json(400, { error: "empty" });
    const prepared = await tg<{ id: string }>(env, "savePreparedInlineMessage", {
      user_id: user.id,
      result: {
        type: "article",
        id: crypto.randomUUID(),
        title: texts(lang).shareTitle,
        input_message_content: { message_text: text },
        reply_markup: { inline_keyboard: [[{ text: texts(lang).open, url: await appLink(env) }]] },
      },
      allow_user_chats: true,
      allow_group_chats: true,
      allow_channel_chats: true,
    });
    return json(200, { id: prepared.id });
  }

  if (path === "/api/story-image") {
    // picture for WebApp.shareToStory, which needs a public URL
    const stored = await storeImage(env, body.image, origin);
    if (stored instanceof Response) return stored;
    return json(200, { url: stored.url });
  }

  if (path === "/api/share-photo") {
    // picture of a card: kept one day so Telegram can fetch it, then sent
    // by the user through WebApp.shareMessage as a photo with a button
    const { caption } = body;
    const stored = await storeImage(env, body.image, origin);
    if (stored instanceof Response) return stored;
    const { token, url } = stored;
    const prepared = await tg<{ id: string }>(env, "savePreparedInlineMessage", {
      user_id: user.id,
      result: {
        type: "photo",
        id: token,
        photo_url: url,
        thumbnail_url: url,
        caption: String(caption ?? "").slice(0, 1000),
        reply_markup: { inline_keyboard: [[{ text: texts(lang).open, url: await appLink(env) }]] },
      },
      allow_user_chats: true,
      allow_group_chats: true,
      allow_channel_chats: true,
    });
    return json(200, { id: prepared.id });
  }

  return json(404, { error: "not found" });
}

// Keeps a shared picture (base64 JPEG, at most 2 MB) one day in KV.
async function storeImage(env: Env, image: unknown, origin: string): Promise<{ token: string; url: string } | Response> {
  if (typeof image !== "string") return json(400, { error: "bad image" });
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(image), (c) => c.charCodeAt(0));
  } catch {
    return json(400, { error: "bad image" });
  }
  // JPEG only (starts with FF D8)
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return json(400, { error: "not jpeg" });
  if (bytes.length > MAX_IMAGE) return json(413, { error: "too big" });
  const token = crypto.randomUUID();
  await env.DB.put(`img:${token}`, bytes, { expirationTtl: DAY / 1000 });
  return { token, url: `${origin}/img/${token}.jpg` };
}

async function handleImage(env: Env, path: string): Promise<Response> {
  const m = /^\/img\/([0-9a-f-]{36})\.jpg$/.exec(path);
  if (!m) return new Response("Not found", { status: 404 });
  const data = await env.DB.get(`img:${m[1]}`, "arrayBuffer");
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(data, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" } });
}

// t.me link that opens the bot's main Mini App; username asked once per worker instance
let botUsername: string | null = null;
async function appLink(env: Env): Promise<string> {
  botUsername ??= (await tg<{ username: string }>(env, "getMe")).username;
  return `https://t.me/${botUsername}?startapp`;
}

async function handleDownload(env: Env, path: string, acceptLanguage: string): Promise<Response> {
  const [, , token, name] = path.split("/");
  if (!token || !/^[0-9a-f-]{36}$/.test(token)) return new Response("Not found", { status: 404 });
  const data = await env.DB.get(`dl:${token}`, "arrayBuffer");
  if (!data) {
    return new Response(texts(langOf(acceptLanguage.split(",")[0])).linkExpired, {
      status: 410, headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  await env.DB.delete(`dl:${token}`);
  const fileName = decodeURIComponent(name ?? "backup.json");
  return new Response(data, {
    headers: {
      "Content-Type": fileName.endsWith(".zip") ? "application/zip" : "application/json",
      "Content-Disposition": `attachment; filename="backup${fileName.endsWith(".zip") ? ".zip" : ".json"}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
      ...DOWNLOAD_CORS,
    },
  });
}

// ---------- bot ----------

// bot texts: ./texts.ts (ru, en, uk, ar)

const openButton = (env: Env, lang: Lang) => ({
  reply_markup: { inline_keyboard: [[{ text: texts(lang).open, web_app: { url: env.WEBAPP_URL } }]] },
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
      : { pre_checkout_query_id: q.id, ok: false, error_message: texts(langOf(q.from.language_code)).invoiceExpired });
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
    const lang = langOf(m.from.language_code);
    const x = texts(lang);
    const text = planId === "tip"
      ? x.thanksTip
      : p.is_recurring && !p.is_first_recurring
        ? x.thanksRenewed
        : x.thanksActivated;
    await tg(env, "sendMessage", { chat_id: m.chat.id, text, ...openButton(env, lang) });
    return;
  }

  const [cmd = "", ...args] = (m.text ?? "").trim().split(/\s+/);
  const name = cmd.split("@")[0];
  const lang = langOf(m.from?.language_code);
  const x = texts(lang);
  if (name === "/start") {
    await tg(env, "sendMessage", { chat_id: m.chat.id, text: x.start, ...openButton(env, lang) });
    // the menu button in this chat speaks the user's language too
    await tg(env, "setChatMenuButton", {
      chat_id: m.chat.id,
      menu_button: { type: "web_app", text: x.open.replace(/^\S+\s/, ""), web_app: { url: env.WEBAPP_URL } },
    }).catch(() => undefined);
  } else if (name === "/paysupport") await tg(env, "sendMessage", { chat_id: m.chat.id, text: x.paysupport });
  else if (name === "/terms") await tg(env, "sendMessage", { chat_id: m.chat.id, text: x.terms });
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
  // English is the default for languages we don't have
  for (const lang of [undefined, ...LANGS]) {
    const x = texts(lang ?? "en");
    const language_code = lang ? { language_code: lang } : {};
    await tg(env, "setMyCommands", {
      commands: [
        { command: "start", description: x.cmdStart },
        { command: "paysupport", description: x.cmdPaysupport },
        { command: "terms", description: x.cmdTerms },
      ],
      ...language_code,
    });
    await tg(env, "setMyShortDescription", { short_description: x.shortDescription, ...language_code });
    await tg(env, "setMyDescription", { description: x.description, ...language_code });
  }
  await tg(env, "setChatMenuButton", {
    menu_button: { type: "web_app", text: "Open", web_app: { url: env.WEBAPP_URL } },
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
      if (url.pathname.startsWith("/api/")) return withCors(await handleApi(req, env, url.pathname, url.origin), env);
      if (url.pathname.startsWith("/dl/") && req.method === "GET") return await handleDownload(env, url.pathname, req.headers.get("Accept-Language") ?? "");
      if (url.pathname.startsWith("/img/") && req.method === "GET") return await handleImage(env, url.pathname);

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
