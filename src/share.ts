// "Поделиться": a tracker or card is shared from its hold menu (gestures.tsx):
// pick "Квадрат" (for chats) or "Для сторис", and a clean summary card of that
// tracker (shareCards.tsx) is sent as a picture. Notes are shared as text:
// shareText() and copyText() at the end of this file.
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
import { canUse, haptic, hapticTick, inTelegram, tg } from "./telegram";
import { toast } from "./ui";
import { t } from "./i18n";
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
    tg!.shareToStory!(url, appLink ? { widget_link: { url: appLink, name: t("notes.appName") } } : undefined);
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
    if (!(await viaShareSheet(png))) toast(t("notes.cantShareImages"));
  } catch (e) {
    console.warn("share failed:", (e as Error).message);
    toast(t("notes.shareFailed"));
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
        title: t("common.share"),
        message: t("notes.shareAsk"),
        buttons: [
          { id: "square", type: "default", text: t("notes.square") },
          { id: "story", type: "default", text: t("notes.story") },
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
  shareTracker(key, window.confirm(t("notes.storyConfirm")) ? "story" : "square");
}

// Menu item that shares a tracker or card as a picture.
export const shareImageItem = (key: string) => ({
  label: t("common.sharePicture"),
  icon: "share" as const,
  run: () => askAndShare(key),
});

// ---------- text: notes and folders ----------

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // older webviews: hidden textarea + execCommand
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;opacity:0;left:-9999px";
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  hapticTick();
  toast(t("common.copied"));
}

// Sends text to any chat. Best: Telegram's own dialog with an "Открыть" button
// (needs the bot server, Telegram 8.0+, up to 1000 characters); then a
// t.me/share link; outside Telegram the phone's share sheet or the clipboard.
export async function shareText(text: string) {
  const clean = text.trim();
  if (!clean) return;
  if (online() && canUse("8.0") && tg!.shareMessage && clean.length <= 1000) {
    try {
      const { id } = await api<{ id: string }>("/api/share", { text: clean });
      tg!.shareMessage!(id);
      return;
    } catch (e) {
      console.warn("share text via bot failed:", (e as Error).message);
    }
  }
  if (inTelegram) {
    const url = appLink || "https://t.me";
    tg!.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(clean.slice(0, 3000))}`);
    return;
  }
  if (navigator.share) {
    try {
      await navigator.share({ text: clean });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  await copyText(clean);
}
