import { defineConfig, devices } from "@playwright/test"

// Run after `ng build --configuration=production`, against its output.
export default defineConfig({
  testDir: "./e2e/prerendered",
  workers: 1,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4201" },
  webServer: {
    command: "node e2e/prerendered/serve.mjs",
    url: "http://localhost:4201",
  },
})
