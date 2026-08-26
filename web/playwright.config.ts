import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", testMatch: /designer\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 950 } } },
    // isMobile emulation gives Chromium a layout viewport taller than the visual one, which breaks Playwright's hit-testing
    // of fixed bottom bars (not a real-phone problem); keep the iPhone size, DPR and touch, drop that flag.
    { name: "mobile", testMatch: /mobile\.spec\.ts/, use: { ...devices["iPhone 13"], browserName: "chromium", isMobile: false } },
  ],
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: !process.env.CI, timeout: 120_000 },
  reporter: process.env.CI ? "github" : "list",
});
