import { defineConfig } from "vite";

// GitHub Pages serves the site under /<repo>/
export default defineConfig({
  base: "/fumble-and-glory/",
  // Busts the cache of UI strings on every deploy (the card data has its own version).
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
});
