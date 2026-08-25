import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://localhost:3000", viewport: { width: 1400, height: 950 }, trace: "retain-on-failure" },
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: !process.env.CI, timeout: 120_000 },
  reporter: process.env.CI ? "github" : "list",
});
