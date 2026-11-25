// Minimal typings and helpers for window.Telegram.WebApp
// (https://core.telegram.org/bots/webapps). Loaded by the <script> in index.html.

type StorageCallback<T> = (error: string | null, value?: T) => void;

export interface TgDeviceStorage {
  getItem(key: string, cb: StorageCallback<string | null>): void;
  setItem(key: string, value: string, cb?: StorageCallback<boolean>): void;
  removeItem(key: string, cb?: StorageCallback<boolean>): void;
  clear(cb?: StorageCallback<boolean>): void;
}

export interface TgThemeParams {
  bg_color?: string;
  secondary_bg_color?: string;
  section_bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
}

export interface TgWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  is_premium?: boolean;
}

export interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: TgWebAppUser };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  themeParams: TgThemeParams;
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
  openTelegramLink(url: string): void;
  downloadFile?(params: { url: string; file_name: string }, cb?: (accepted: boolean) => void): void;
  shareMessage?(msgId: string, cb?: (sent: boolean) => void): void; // Telegram 8.0+
  shareToStory?(mediaUrl: string, params?: { text?: string; widget_link?: { url: string; name?: string } }): void; // 7.8+
  showPopup?(
    params: {
      title?: string;
      message: string;
      buttons?: { id?: string; type?: "default" | "ok" | "close" | "cancel" | "destructive"; text?: string }[];
    },
    cb?: (buttonId: string) => void,
  ): void; // 6.2+
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

export const tgUser: TgWebAppUser | null = inTelegram ? tg!.initDataUnsafe.user ?? null : null;

export function haptic(style: "light" | "medium" | "heavy" = "light") {
  if (canUse("6.1")) tg!.HapticFeedback.impactOccurred(style);
}

export function hapticOk() {
  if (canUse("6.1")) tg!.HapticFeedback.notificationOccurred("success");
}

export function hapticTick() {
  if (canUse("6.1")) tg!.HapticFeedback.selectionChanged();
}

export function confirmAsk(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (canUse("6.2")) tg!.showConfirm(text, resolve);
    else resolve(window.confirm(text));
  });
}

// Telegram on phones ignores <a download>; desktop clients and browsers handle it.
export const isPhone = !!tg && ["ios", "android", "android_x"].includes(tg.platform);
