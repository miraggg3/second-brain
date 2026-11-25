// Calls to the bot server (Cloudflare Worker). Every request carries Telegram
// initData, which the server checks to know who the user is.

import { signal } from "@preact/signals";
import { canUse, inTelegram, tg } from "./telegram";
import { lang } from "./i18n";

const API_BASE: string = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

// true once the server answered: enables "send to chat", downloads and payments
export const serverOnline = signal(false);

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!inTelegram) throw new ApiError("not in telegram", 0);
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: tg!.initData, lang: lang.value, ...body }),
    });
  } catch {
    throw new ApiError("offline", 0);
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(json.error || res.statusText, res.status);
  return json as T;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",", 2)[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// ---------- ways to get a file out of the app ----------

// 1. Bot sends the file to the user's private chat (works everywhere, needs the server)
export async function sendFileToChat(blob: Blob, filename: string, caption: string) {
  await api("/api/send-file", { filename, content: await blobToBase64(blob), caption });
}

// 2. Telegram's own download dialog (Telegram 8.0+, needs the server for a one-time link)
export const canTelegramDownload = () => serverOnline.value && canUse("8.0") && !!tg!.downloadFile;

export async function telegramDownload(blob: Blob, filename: string): Promise<boolean> {
  const { url } = await api<{ url: string }>("/api/download", { filename, content: await blobToBase64(blob) });
  return new Promise((resolve) => tg!.downloadFile!({ url, file_name: filename }, (ok) => resolve(ok)));
}

// 3. System share sheet: "Save to Files", Drive, other chats… (iOS, many Android phones)
export function canShareFiles(): boolean {
  try {
    const probe = new File(["{}"], "probe.json", { type: "application/json" });
    return !!navigator.canShare && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export async function shareFile(blob: Blob, filename: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
  try {
    await navigator.share({ files: [file], title: filename });
    return true;
  } catch (e) {
    if ((e as Error).name === "AbortError") return false; // user closed the sheet
    throw e;
  }
}

// 4. Plain browser download (browsers, some desktop Telegram clients)
export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
