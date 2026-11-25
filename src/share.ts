// "Поделиться": hold a tracker for ~0.5s (one listener for the whole app) or
// tap a share button, pick "Квадрат" (for chats) or "Для сторис", and a clean
// summary card of that tracker (shareCards.tsx) is sent as a picture.
//
// Square:
// 1. bot server online (Telegram 8.0+): server keeps the picture for a day and
//    prepares a photo message with an "Открыть" button, Telegram's own share
//    dialog sends it (WebApp.shareMessage);
// 2. otherwise the phone's share sheet with just the picture.
// Story:
// 1. bot server online (Telegram 7.8+): WebApp.shareToStory with the picture
//    and a link to the app;
// 2. otherwise the phone's share sheet (save it, then post it as a story).

import { domToJpeg, domToPng } from "modern-screenshot";
import { api, blobToBase64, serverOnline } from "./api";
import { canUse, haptic, inTelegram, tg } from "./telegram";
import { toast } from "./ui";
import { mountShareArt, specFor, type ShareFormat } from "./shareCards";

const BOT: string = (import.meta.env.VITE_BOT_USERNAME ?? "").replace(/^@/, "");

// opens the bot's main Mini App
export const appLink = BOT ? `https://t.me/${BOT}?startapp` : "";

// card size in CSS px; pictures are 3x: 1080×1080 and 1080×1920
const SCALE = 3;

// ---------- picture ----------

async function picture(key: string, format: ShareFormat, type: "png" | "jpeg"): Promise<Blob | null> {
  const spec = specFor(key);
  if (!spec) return null;
  const { el, done } = await mountShareArt(spec, format);
  try {
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#f2f2f7";
    const url = type === "png"
      ? await domToPng(el, { scale: SCALE, backgroundColor: bg })
      : await domToJpeg(el, { scale: SCALE, quality: 0.95, backgroundColor: bg });
    return await (await fetch(url)).blob();
  } finally {
    done();
  }
}

// ---------- sending ----------

const online = () => serverOnline.value && inTelegram;

async function squareViaBot(image: Blob): Promise<boolean> {
  try {
    const { id } = await api<{ id: string }>("/api/share-photo", { image: await blobToBase64(image) });
    tg!.shareMessage!(id);
    return true;
  } catch (e) {
    console.warn("share via bot failed:", (e as Error).message);
    return false;
  }
}

async function storyViaTelegram(image: Blob): Promise<boolean> {
  try {
    const { url } = await api<{ url: string }>("/api/story-image", { image: await blobToBase64(image) });
    tg!.shareToStory!(url, appLink ? { widget_link: { url: appLink, name: "Второй мозг" } } : undefined);
    return true;
  } catch (e) {
    console.warn("story via telegram failed:", (e as Error).message);
    return false;
  }
}

async function viaShareSheet(image: Blob): Promise<boolean> {
  const file = new File([image], "second-brain.png", { type: "image/png" });
  if (!navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file] }); // picture only: no extra text message
  } catch (e) {
    if ((e as Error).name !== "AbortError") throw e; // closed by the user: fine
  }
  return true;
}

let busy = false;

export async function shareTracker(key: string, format: ShareFormat) {
  if (busy) return;
  busy = true;
  try {
    if (format === "square" && online() && canUse("8.0") && tg!.shareMessage) {
      const jpeg = await picture(key, format, "jpeg");
      if (jpeg && (await squareViaBot(jpeg))) return;
    }
    if (format === "story" && online() && canUse("7.8") && tg!.shareToStory) {
      const jpeg = await picture(key, format, "jpeg");
      if (jpeg && (await storyViaTelegram(jpeg))) return;
    }
    const png = await picture(key, format, "png");
    if (!png) return;
    if (!(await viaShareSheet(png))) toast("Этот телефон не умеет делиться картинками");
  } catch (e) {
    console.warn("share failed:", (e as Error).message);
    toast("Не получилось поделиться");
  } finally {
    busy = false;
  }
}

// Ask "square or story", then share.
export function askAndShare(key: string) {
  if (!specFor(key)) return;
  haptic("medium");
  if (canUse("6.2") && tg!.showPopup) {
    tg!.showPopup!(
      {
        title: "Поделиться",
        message: "Картинка для чата или для сторис?",
        buttons: [
          { id: "square", type: "default", text: "Квадрат" },
          { id: "story", type: "default", text: "Для сторис" },
          { type: "cancel" },
        ],
      },
      (id) => {
        if (id === "square" || id === "story") shareTracker(key, id);
      },
    );
    return;
  }
  // outside Telegram (dev): confirm() as a simple chooser
  shareTracker(key, window.confirm("Для сторис? (Отмена = квадрат)") ? "story" : "square");
}

// For share buttons inside a tracker card.
export function shareFrom(button: EventTarget | null) {
  const el = button instanceof HTMLElement ? button.closest<HTMLElement>("[data-share]") : null;
  if (el?.dataset.share) askAndShare(el.dataset.share);
}

// ---------- long press, once for the whole app ----------

// only elements marked data-share (trackers) can be shared
const NOT_SHAREABLE = "input, textarea, select, .sheet, .tabbar, .fab, .stepper, .editor, .segmented, .chips";
const HOLD_MS = 500;
let timer: number | undefined;
let fired = false;
let startX = 0;
let startY = 0;

function cancel() {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
}

function shareKeyAt(target: EventTarget | null): string | null {
  if (!(target instanceof Element) || target.closest(NOT_SHAREABLE)) return null;
  return target.closest<HTMLElement>("[data-share]")?.dataset.share ?? null;
}

export function installLongPressShare() {
  document.addEventListener("pointerdown", (e) => {
    fired = false;
    cancel();
    const key = shareKeyAt(e.target);
    if (!key) return;
    startX = e.clientX;
    startY = e.clientY;
    timer = window.setTimeout(() => {
      timer = undefined;
      fired = true;
      askAndShare(key);
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
  // no "copy / select" menu on a held tracker
  document.addEventListener("contextmenu", (e) => {
    if (shareKeyAt(e.target)) e.preventDefault();
  });
}
