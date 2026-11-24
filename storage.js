// Storage layer: all notes are kept on the user's device.
//
// Inside Telegram we use DeviceStorage (local on the phone, ~5 MB per user).
// In a normal browser (for testing on the laptop) we fall back to localStorage.
// The rest of the app only uses loadNotes() and saveNotes(), so the place where
// data lives can be changed later (e.g. encrypted copy in CloudStorage).

const STORAGE_KEY = "notes";

function deviceStorage() {
  const tg = window.Telegram && window.Telegram.WebApp;
  // DeviceStorage exists since Mini Apps API 9.0
  if (tg && tg.DeviceStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("9.0")) {
    return tg.DeviceStorage;
  }
  return null;
}

function loadNotes() {
  return new Promise((resolve) => {
    const ds = deviceStorage();
    if (!ds) {
      resolve(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
      return;
    }
    ds.getItem(STORAGE_KEY, (err, value) => {
      if (err) {
        console.error("DeviceStorage getItem failed:", err);
        resolve([]);
        return;
      }
      resolve(value ? JSON.parse(value) : []);
    });
  });
}

function saveNotes(notes) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(notes);
    const ds = deviceStorage();
    if (!ds) {
      localStorage.setItem(STORAGE_KEY, data);
      resolve();
      return;
    }
    ds.setItem(STORAGE_KEY, data, (err) => (err ? reject(err) : resolve()));
  });
}
