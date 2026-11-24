// The font is bundled with the app: no requests to font CDNs.
import "@fontsource-variable/onest";
import "./styles.css";

import { render } from "preact";
import { App } from "./App";
import { initTheme } from "./theme";

initTheme();
render(<App />, document.getElementById("app")!);
