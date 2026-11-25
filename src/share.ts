// "Поделиться": send a card exactly as it looks in the app.
//
// The pressed card is copied into an off-screen frame (padding, background,
// app name + bot link at the bottom) and turned into a JPEG. Then:
// 1. bot server online: the server keeps the picture for a day and prepares
//    a photo message with an "Открыть" button; Telegram's own share dialog
//    (WebApp.shareMessage, Telegram 8.0+) sends it to the chosen chat;
// 2. otherwise the phone's share sheet with the picture (Telegram is in it);
// 3. otherwise Telegram's "forward to…" dialog with text and a link.

import { domToJpeg } from "modern-screenshot";
import { api, blobToBase64, serverOnline } from "./api";
import { canUse, haptic, inTelegram, tg } from "./telegram";
import { toast } from "./ui";

const BOT: string = (import.meta.env.VITE_BOT_USERNAME ?? "").replace(/^@/, "");

// opens the bot's main Mini App
export const appLink = BOT ? `https://t.me/${BOT}?startapp` : "";

const FOOTER = "Слежу за этим во «Втором мозге» 🧠";

// ---------- picture of a card ----------

async function cardImage(el: HTMLElement): Promise<Blob> {
  const width = Math.round(el.getBoundingClientRect().width);
  const frame = document.createElement("div");
  frame.className = "share-frame";
  frame.style.width = `${width + 40}px`;

  const copy = el.cloneNode(true) as HTMLElement;
  // a single row (habit) looks better inside a card
  const body = el.matches(".card, .stat-row, .achievement, .profile-stats, .note") ? copy : wrapInCard(copy);
  const footer = document.createElement("div");
  footer.className = "share-frame-foot";
  footer.innerHTML = `<b>🧠 Второй мозг</b>${BOT ? `<span>t.me/${BOT}</span>` : ""}`;
  frame.append(body, footer);
  document.body.append(frame);

  try {
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#f2f2f7";
    const dataUrl = await domToJpeg(frame, { scale: 3, quality: 0.92, backgroundColor: bg });
    return await (await fetch(dataUrl)).blob();
  } finally {
    frame.remove();
  }
}

function wrapInCard(node: HTMLElement): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  card.append(node);
  return card;
}

// ---------- sending ----------

async function viaBot(image: Blob, caption: string): Promise<boolean> {
  if (!(serverOnline.value && canUse("8.0") && tg!.shareMessage)) return false;
  try {
    const { id } = await api<{ id: string }>("/api/share-photo", { image: await blobToBase64(image), caption });
    tg!.shareMessage(id);
    return true;
  } catch (e) {
    console.warn("share via bot failed:", (e as Error).message);
    return false;
  }
}

async function viaShareSheet(image: Blob, caption: string): Promise<boolean> {
  const file = new File([image], "second-brain.jpg", { type: "image/jpeg" });
  if (!navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], text: caption });
  } catch (e) {
    if ((e as Error).name !== "AbortError") throw e; // closed by the user: fine
  }
  return true;
}

export function shareText(text: string) {
  if (!appLink) return toast("Не задан бот для ссылки");
  const message = `${text.trim()}\n\n${FOOTER}`;
  const url = `https://t.me/share/url?url=${encodeURIComponent(appLink)}&text=${encodeURIComponent(message)}`;
  if (inTelegram) tg!.openTelegramLink(url);
  else window.open(url, "_blank", "noopener");
}

let busy = false;

// Share the card `el` as a picture; `text` is the caption and the last fallback.
export async function shareCard(el: HTMLElement | null, text: string) {
  if (busy) return;
  busy = true;
  haptic("medium");
  const caption = `${text.trim()}\n\n${FOOTER}${appLink ? `\n${appLink}` : ""}`;
  try {
    if (el) {
      const image = await cardImage(el);
      if (await viaBot(image, caption)) return;
      if (await viaShareSheet(image, caption)) return;
    }
    shareText(text);
  } catch (e) {
    console.warn("share failed:", (e as Error).message);
    shareText(text);
  } finally {
    busy = false;
  }
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

// Spread on a card: hold ~0.5s to share it as a picture, a normal tap still works.
export function longPressShare(getText: () => string) {
  return {
    onPointerDown: (e: PointerEvent) => {
      const el = e.currentTarget as HTMLElement;
      fired = false;
      startX = e.clientX;
      startY = e.clientY;
      cancel();
      timer = window.setTimeout(() => {
        timer = undefined;
        fired = true;
        shareCard(el, getText());
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

// For share buttons: share the closest element matching `selector`.
export function shareFrom(button: EventTarget | null, selector: string, text: string) {
  const el = button instanceof HTMLElement ? button.closest<HTMLElement>(selector) : null;
  shareCard(el, text);
}
