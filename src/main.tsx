// The font is bundled with the app: no requests to font CDNs.
import "@fontsource-variable/onest";
import "./styles.css";

import { render } from "preact";
import { App } from "./App";
import { initTheme } from "./theme";
import { inTelegram } from "./telegram";
import { OpenInTelegram } from "./screens/OpenInTelegram";

initTheme();
// Outside Telegram only an "open via the bot" screen. `npm run dev` keeps the
// full app so it can be developed in a normal browser.
const root = document.getElementById("app")!;
render(inTelegram || import.meta.env.DEV ? <App /> : <OpenInTelegram />, root);
