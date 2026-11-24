import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  // relative paths: the build also works from a sub-folder (e.g. GitHub Pages)
  base: "./",
  server: {
    // `npm run dev` + `npm start`: API calls go to the bot server
    proxy: { "/api": "http://localhost:3000" },
  },
});
