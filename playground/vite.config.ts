import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// The playground imports the library straight from source for fast local dev.
export default defineConfig(({ command }) => ({
  // Served from a repo subpath on GitHub Pages; root during local dev.
  base: command === "build" ? "/react-viewport-lightbox/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@jekrch/react-viewport-lightbox": resolve(__dirname, "../src/index.ts"),
    },
  },
  server: { port: 5180 },
}));
