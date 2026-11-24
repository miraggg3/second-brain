// Calls to the bot server. Every request carries Telegram initData, which the
// server checks to know who the user is.

import { tg } from "./telegram";

const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: tg?.initData ?? "", ...body }),
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

// Bot sends the file to the user's private chat: the easiest way to get it on another device.
export async function sendFileToChat(blob: Blob, filename: string, caption: string) {
  const content = await blobToBase64(blob);
  await api("/api/send-file", { filename, content, caption });
}

// Works in browsers and Telegram Desktop/Web, not inside the phone apps.
export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
