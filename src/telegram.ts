// Minimal typings and helpers for window.Telegram.WebApp
// (https://core.telegram.org/bots/webapps). Loaded by the <script> in index.html.

type StorageCallback<T> = (error: string | null, value?: T) => void;

export interface TgDeviceStorage {
  getItem(key: string, cb: StorageCallback<string | null>): void;
  setItem(key: string, value: string, cb?: StorageCallback<boolean>): void;
  removeItem(key: string, cb?: StorageCallback<boolean>): void;
  clear(cb?: StorageCallback<boolean>): void;
}

export interface TgWebApp {
  initData: string;
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  isVersionAtLeast(version: string): boolean;
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor?(color: string): void;
  onEvent(event: string, cb: () => void): void;
  showConfirm(message: string, cb: (ok: boolean) => void): void;
  openInvoice(url: string, cb: (status: "paid" | "cancelled" | "failed" | "pending") => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void };
  HapticFeedback: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  };
  DeviceStorage?: TgDeviceStorage;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TgWebApp };
  }
}

export const tg: TgWebApp | null = window.Telegram?.WebApp ?? null;

// false when the page is opened in a normal browser (the SDK still loads there)
export const inTelegram = !!tg?.initData;

export function canUse(version: string): boolean {
  return !!tg && inTelegram && tg.isVersionAtLeast(version);
}

export function haptic(style: "light" | "medium" | "heavy" = "light") {
  if (canUse("6.1")) tg!.HapticFeedback.impactOccurred(style);
}

export function hapticOk() {
  if (canUse("6.1")) tg!.HapticFeedback.notificationOccurred("success");
}

export function confirmAsk(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (canUse("6.2")) tg!.showConfirm(text, resolve);
    else resolve(window.confirm(text));
  });
}

// Telegram on phones ignores <a download>; desktop clients and browsers handle it.
export const isPhone = !!tg && ["ios", "android", "android_x"].includes(tg.platform);
