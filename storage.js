// Storage layer: all user data is kept on the user's device.
//
// Inside Telegram we use DeviceStorage (local on the phone, ~5 MB per user).
// In a normal browser (for testing on the laptop) we fall back to localStorage.
// The rest of the app only uses loadKey() and saveKey(), so the place where
// data lives can be changed later (e.g. encrypted copy in CloudStorage).

function deviceStorage() {
  const tg = window.Telegram && window.Telegram.WebApp;
  // DeviceStorage exists since Mini Apps API 9.0
  if (tg && tg.initData && tg.DeviceStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("9.0")) {
    return tg.DeviceStorage;
  }
  return null;
}

function parseOr(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (e) {
    console.error("Broken stored value, using default:", e);
    return fallback;
  }
}

function loadKey(key, fallback) {
  return new Promise((resolve) => {
    const ds = deviceStorage();
    if (!ds) {
      let raw = null;
      try { raw = localStorage.getItem(key); } catch (e) { /* storage blocked */ }
      resolve(parseOr(raw, fallback));
      return;
    }
    ds.getItem(key, (err, value) => {
      if (err) {
        console.error("DeviceStorage getItem failed:", err);
        resolve(fallback);
        return;
      }
      resolve(parseOr(value, fallback));
    });
  });
}

function saveKey(key, value) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(value);
    const ds = deviceStorage();
    if (!ds) {
      try { localStorage.setItem(key, data); } catch (e) { console.error(e); }
      resolve();
      return;
    }
    ds.setItem(key, data, (err) => (err ? reject(err) : resolve()));
  });
}
