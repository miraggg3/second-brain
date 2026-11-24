// Fonts are bundled with the app: no requests to font CDNs.
import "@fontsource/unbounded/600.css";
import "@fontsource/unbounded/800.css";
import "@fontsource/golos-text/400.css";
import "@fontsource/golos-text/500.css";
import "@fontsource/golos-text/600.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles.css";

import { render } from "preact";
import { App } from "./App";
import { initTheme } from "./theme";

initTheme();
render(<App />, document.getElementById("app")!);
