// Premium for Telegram Stars. The server creates the invoice and remembers who
// paid; the app shows plans, opens the invoice and caches the status locally.

import { signal } from "@preact/signals";
import { api, ApiError, serverOnline } from "./api";
import { data, isPremium, set } from "./store";
import { canUse, hapticOk, inTelegram, tg } from "./telegram";
import { toast } from "./ui";
import { openOverlay } from "./nav";

export type Plan = "month" | "lifetime" | "tip";

export const FREE_HABITS = 3;

// shown until the server answers with its real prices
export const prices = signal<Record<Plan, number>>({ month: 99, lifetime: 499, tip: 50 });

interface MeResponse {
  until: number;
  lifetime: boolean;
  prices?: Record<Plan, number>;
}

export async function refreshPremium() {
  if (!inTelegram) return;
  try {
    const me = await api<MeResponse>("/api/me");
    serverOnline.value = true;
    if (me.prices) prices.value = me.prices;
    set("premium", { until: me.until || 0, lifetime: !!me.lifetime });
  } catch (e) {
    console.warn("Server not reachable:", (e as Error).message);
  }
}

export async function buy(plan: Plan) {
  if (!inTelegram) return toast("Оплата работает только внутри Telegram");
  if (!serverOnline.value) return toast("Оплата пока недоступна: сервер бота не подключён");
  if (!canUse("6.1")) return toast("Обнови Telegram, чтобы оплатить");
  try {
    const { link } = await api<{ link: string }>("/api/invoice", { plan });
    tg!.openInvoice(link, async (status) => {
      if (status === "paid") {
        hapticOk();
        toast(plan === "tip" ? "Спасибо за поддержку! 💛" : "Premium активирован ✨");
        // the bot receives the payment a moment later: ask twice
        await refreshPremium();
        setTimeout(refreshPremium, 3000);
      } else if (status === "failed") {
        toast("Платёж не прошёл");
      }
    });
  } catch (e) {
    toast(e instanceof ApiError && e.message === "already"
      ? "У тебя уже Premium навсегда ✨"
      : "Сервер недоступен, попробуй позже");
  }
}

// true if premium is active, otherwise shows the paywall
export function requirePremium(reason: string): boolean {
  if (isPremium.value) return true;
  toast(reason);
  openOverlay({ name: "premium" });
  return false;
}

export function premiumStatusText(): string {
  const p = data.value.premium;
  if (p.lifetime) return "Premium навсегда";
  if (p.until > Date.now()) {
    return `Premium до ${new Date(p.until).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`;
  }
  return "Бесплатная версия";
}
