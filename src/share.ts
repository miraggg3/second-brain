// "Поделиться": send a result to a friend or chat.
//
// 1. With the bot server online: the server prepares a message with an
//    "Открыть" button (savePreparedInlineMessage) and Telegram's own
//    share dialog sends it (WebApp.shareMessage, Telegram 8.0+).
// 2. Otherwise: Telegram's "forward to…" dialog (t.me/share/url) with the
//    text and a link to the app. Works without any server.

import { api, serverOnline } from "./api";
import { canUse, haptic, inTelegram, tg } from "./telegram";
import { toast } from "./ui";

const BOT: string = (import.meta.env.VITE_BOT_USERNAME ?? "").replace(/^@/, "");

// opens the bot's main Mini App
export const appLink = BOT ? `https://t.me/${BOT}?startapp` : "";

const FOOTER = "Слежу за этим во «Втором мозге» 🧠";

export async function shareText(text: string) {
  haptic("medium");
  const message = `${text.trim()}\n\n${FOOTER}`;

  if (serverOnline.value && canUse("8.0") && tg!.shareMessage) {
    try {
      const { id } = await api<{ id: string }>("/api/share", { text: message });
      tg!.shareMessage(id);
      return;
    } catch (e) {
      console.warn("prepared share failed, falling back:", (e as Error).message);
    }
  }

  if (!appLink) return toast("Не задан бот для ссылки");
  const url = `https://t.me/share/url?url=${encodeURIComponent(appLink)}&text=${encodeURIComponent(message)}`;
  if (inTelegram) tg!.openTelegramLink(url);
  else window.open(url, "_blank", "noopener");
}

// ---------- long press ----------
// One press at a time, so the state lives here and survives re-renders.

const HOLD_MS = 500;
let timer: number | undefined;
let fired = false;
let startX = 0;
let startY = 0;

function cancel() {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
}

// Spread on any element: hold ~0.5s to share, a normal tap still works.
export function longPressShare(getText: () => string) {
  return {
    onPointerDown: (e: PointerEvent) => {
      fired = false;
      startX = e.clientX;
      startY = e.clientY;
      cancel();
      timer = window.setTimeout(() => {
        timer = undefined;
        fired = true;
        shareText(getText());
      }, HOLD_MS);
    },
    onPointerMove: (e: PointerEvent) => {
      // scrolling is not a long press
      if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (e: Event) => e.preventDefault(),
    // the tap that ended a long press must not also open/toggle things
    onClickCapture: (e: Event) => {
      if (!fired) return;
      fired = false;
      e.stopPropagation();
      e.preventDefault();
    },
  };
}
