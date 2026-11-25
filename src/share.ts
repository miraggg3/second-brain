// "Поделиться": send any card as a picture, exactly as it looks in the app.
//
// Hold any card, tile or tracker for ~0.5s (one listener for the whole app),
// or tap a share button. The card is copied into an off-screen frame (padding,
// background, app name + bot link at the bottom) and turned into a JPEG.
// Only the picture is sent, no separate text message:
// 1. bot server online: the server keeps the picture for a day and prepares
//    a photo message with an "Открыть" button; Telegram's own share dialog
//    (WebApp.shareMessage, Telegram 8.0+) sends it to the chosen chat;
// 2. otherwise the phone's share sheet with just the picture;
// 3. if the phone can't share files: Telegram's "forward to…" dialog with
//    the card's text and a link (the only case without a picture).

import { domToJpeg } from "modern-screenshot";
import { api, blobToBase64, serverOnline } from "./api";
import { canUse, haptic, inTelegram, tg } from "./telegram";
import { toast } from "./ui";

const BOT: string = (import.meta.env.VITE_BOT_USERNAME ?? "").replace(/^@/, "");

// opens the bot's main Mini App
export const appLink = BOT ? `https://t.me/${BOT}?startapp` : "";

// Everything that can be shared. closest() picks the innermost match, so a
// tile inside a card is shared alone, not the whole card.
const SHAREABLE = [
  ".hero", ".tile", ".stat-row", ".habit", ".tracker", ".history", ".achievement",
  ".profile-stats", ".note", ".gym-banner", ".card",
].join(", ");

// never start a share from these
const NOT_SHAREABLE = "input, textarea, select, .sheet, .tabbar, .fab, .stepper, .editor, .segmented, .chips";

// ---------- picture of a card ----------

async function cardImage(el: HTMLElement): Promise<Blob> {
  const width = Math.round(el.getBoundingClientRect().width);
  const frame = document.createElement("div");
  frame.className = "share-frame";
  frame.style.width = `${width + 40}px`;

  const copy = el.cloneNode(true) as HTMLElement;
  // single rows (habit, tracker) look better inside a card
  const body = el.matches(".habit, .tracker") ? wrapInCard(copy) : copy;
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

async function viaBot(image: Blob): Promise<boolean> {
  if (!(serverOnline.value && canUse("8.0") && tg!.shareMessage)) return false;
  try {
    const { id } = await api<{ id: string }>("/api/share-photo", { image: await blobToBase64(image) });
    tg!.shareMessage(id);
    return true;
  } catch (e) {
    console.warn("share via bot failed:", (e as Error).message);
    return false;
  }
}

async function viaShareSheet(image: Blob): Promise<boolean> {
  const file = new File([image], "second-brain.jpg", { type: "image/jpeg" });
  if (!navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file] }); // picture only: no extra text message
  } catch (e) {
    if ((e as Error).name !== "AbortError") throw e; // closed by the user: fine
  }
  return true;
}

function shareText(text: string) {
  if (!appLink) return toast("Не получилось поделиться");
  const message = `${text.trim().slice(0, 900)}\n\nВторой мозг 🧠`;
  const url = `https://t.me/share/url?url=${encodeURIComponent(appLink)}&text=${encodeURIComponent(message)}`;
  if (inTelegram) tg!.openTelegramLink(url);
  else window.open(url, "_blank", "noopener");
}

// what the card says, for the last fallback
const textOf = (el: HTMLElement) => el.innerText.replace(/\n{2,}/g, "\n").trim();

let busy = false;

export async function shareCard(el: HTMLElement | null) {
  if (!el || busy) return;
  busy = true;
  haptic("medium");
  try {
    const image = await cardImage(el);
    if (await viaBot(image)) return;
    if (await viaShareSheet(image)) return;
    shareText(textOf(el));
  } catch (e) {
    console.warn("share failed:", (e as Error).message);
    shareText(textOf(el));
  } finally {
    busy = false;
  }
}

// For share buttons: share the closest element matching `selector`.
export function shareFrom(button: EventTarget | null, selector: string) {
  shareCard(button instanceof HTMLElement ? button.closest<HTMLElement>(selector) : null);
}

// ---------- long press, once for the whole app ----------

const HOLD_MS = 500;
let timer: number | undefined;
let fired = false;
let startX = 0;
let startY = 0;

function cancel() {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
}

function shareableAt(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element) || target.closest(NOT_SHAREABLE)) return null;
  return target.closest<HTMLElement>(SHAREABLE);
}

export function installLongPressShare() {
  document.addEventListener("pointerdown", (e) => {
    fired = false;
    cancel();
    const el = shareableAt(e.target);
    if (!el) return;
    startX = e.clientX;
    startY = e.clientY;
    timer = window.setTimeout(() => {
      timer = undefined;
      fired = true;
      shareCard(el);
    }, HOLD_MS);
  });
  document.addEventListener("pointermove", (e) => {
    // scrolling is not a long press
    if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) cancel();
  });
  for (const type of ["pointerup", "pointercancel"]) document.addEventListener(type, cancel);
  // the tap that ended a long press must not also open/toggle things
  document.addEventListener("click", (e) => {
    if (!fired) return;
    fired = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);
  // no "copy / select" menu on a held card
  document.addEventListener("contextmenu", (e) => {
    if (shareableAt(e.target)) e.preventDefault();
  });
}
