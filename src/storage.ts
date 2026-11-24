// Storage layer: all user data stays on the user's device.
//
// Inside Telegram (API 9.0+) we use DeviceStorage: local to this phone/PC,
// removed together with the Telegram app. In a normal browser or an old
// Telegram we fall back to localStorage, which is also local to the device.

import { canUse, tg, type TgDeviceStorage } from "./telegram";

function deviceStorage(): TgDeviceStorage | null {
  return canUse("9.0") && tg!.DeviceStorage ? tg!.DeviceStorage : null;
}

function parseOr<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error("Broken stored value, using default:", e);
    return fallback;
  }
}

export function loadKey<T>(key: string, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const ds = deviceStorage();
    if (!ds) {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(key);
      } catch {
        /* storage blocked */
      }
      resolve(parseOr(raw, fallback));
      return;
    }
    ds.getItem(key, (err, value) => {
      if (err) console.error("DeviceStorage getItem failed:", err);
      resolve(err ? fallback : parseOr(value, fallback));
    });
  });
}

export function saveKey(key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const raw = JSON.stringify(value);
    const ds = deviceStorage();
    if (!ds) {
      try {
        localStorage.setItem(key, raw);
        resolve();
      } catch (e) {
        reject(e);
      }
      return;
    }
    ds.setItem(key, raw, (err) => (err ? reject(new Error(err)) : resolve()));
  });
}

export function removeKey(key: string): Promise<void> {
  return new Promise((resolve) => {
    const ds = deviceStorage();
    if (!ds) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      resolve();
      return;
    }
    ds.removeItem(key, () => resolve());
  });
}
