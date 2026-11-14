import { defineConfig, devices } from "@playwright/test";

// Real-browser smoke tests against a production build of the playground.
// They assert DOM state and URLs only (no screenshots): open/close, focus,
// keys, wheel handling, and the history entry.
//
//   npm run test:e2e
//
// Needs Chromium for Playwright once: `npx playwright install chromium`.
const PORT = 4173;
// Relative to the playground root.
const OUT = "../dist-e2e";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    // The playground builds for its GitHub Pages subpath.
    baseURL: `http://127.0.0.1:${PORT}/react-viewport-lightbox/`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      `vite build playground --outDir ${OUT} --emptyOutDir --logLevel error && ` +
      `vite preview playground --outDir ${OUT} --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/react-viewport-lightbox/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
