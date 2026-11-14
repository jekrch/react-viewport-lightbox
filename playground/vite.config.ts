import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// The playground imports the library straight from source for fast local dev.
// Exact-match aliases, so the `/lazy` subpath isn't swallowed by the root one.
//
// `--mode embed` builds for hosting inside someone else's sandboxed frame:
// relative URLs, one JS file (the viewer chunk inlined, so nothing loads a
// module at runtime), and App hides the parts that need a real address bar.
export default defineConfig(({ command, mode, isPreview }) => ({
  // Served from a repo subpath on GitHub Pages (and by `vite preview` of that
  // build, which loads this config as "serve"); root during local dev.
  base:
    command === "build" || isPreview
      ? mode === "embed"
        ? "./"
        : "/react-viewport-lightbox/"
      : "/",
  build:
    mode === "embed" ? { rollupOptions: { output: { inlineDynamicImports: true } } } : undefined,
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@jekrch\/react-viewport-lightbox\/lazy$/,
        replacement: resolve(import.meta.dirname, "../src/lazy.tsx"),
      },
      {
        find: /^@jekrch\/react-viewport-lightbox$/,
        replacement: resolve(import.meta.dirname, "../src/index.ts"),
      },
    ],
  },
  server: { port: 5180 },
}));
