import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  // playwright.prerendered.config.ts: those need a production build.
  testIgnore: "prerendered/**",
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4200",
    trace: "on-first-retry",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm start",
    url: "http://localhost:4200",
    reuseExistingServer: true,
    // A CI runner has no Angular build cache for its first compile.
    timeout: 180_000,
  },
})
