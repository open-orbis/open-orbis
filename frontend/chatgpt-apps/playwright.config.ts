import { defineConfig } from "@playwright/test";

// Two-server setup:
//  - Port 4173 serves the built widget bundles (frontend/public/chatgpt-widgets)
//  - Port 4174 serves the harness HTML fixtures (e2e/fixtures)
// The harness pages load the widget bundles cross-origin from 4173, so both
// servers enable CORS.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Visual baselines live next to the spec as <spec>-snapshots/<name>-<project>.png
  // so the repo commits them.
  use: {
    baseURL: "http://localhost:4174",
    viewport: { width: 640, height: 600 },
  },
  webServer: [
    {
      command:
        "npm run build && npx serve ../public/chatgpt-widgets -p 4173 --cors --no-clipboard",
      port: 4173,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: "npx serve e2e/fixtures -p 4174 --cors --no-clipboard",
      port: 4174,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  projects: [
    { name: "chromium-light", use: { colorScheme: "light" } },
    { name: "chromium-dark", use: { colorScheme: "dark" } },
  ],
});
