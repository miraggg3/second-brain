// The font is bundled with the app: no requests to font CDNs.
import "@fontsource-variable/onest";
import "./styles.css";

import { render } from "preact";
import { App } from "./App";
import { initTheme } from "./theme";
import { inTelegram } from "./telegram";
import { OpenInTelegram } from "./screens/OpenInTelegram";

initTheme();

// iOS ignores user-scalable=no: stop pinch zoom by hand (and ctrl+wheel on desktop)
for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener("touchmove", (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });
document.addEventListener("wheel", (e) => {
  if (e.ctrlKey) e.preventDefault();
}, { passive: false });
// Outside Telegram only an "open via the bot" screen. `npm run dev` keeps the
// full app so it can be developed in a normal browser.
const root = document.getElementById("app")!;
render(inTelegram || import.meta.env.DEV ? <App /> : <OpenInTelegram />, root);
