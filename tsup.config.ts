import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    lazy: "src/lazy.tsx",
    styles: "src/styles.css",
  },
  format: ["esm", "cjs"],
  // tsup splits ESM by default (CJS stays one file per entry): the viewer
  // becomes a shared chunk that `index` imports statically and `lazy` imports
  // on demand.
  dts: { entry: { index: "src/index.ts", lazy: "src/lazy.tsx" } },
  sourcemap: true,
  clean: true,
  // Comment prose stays in src/ and the sourcemaps; the shipped JS and CSS are
  // minified. `scripts/check-size.mjs` guards the gzip budget in CI.
  minify: true,
  // Every export touches hooks or the DOM, so the whole entry is client-only.
  // Without this, Next.js App Router server components fail on import.
  banner: { js: '"use client";' },
  external: ["react", "react-dom", "react/jsx-runtime"],
});
