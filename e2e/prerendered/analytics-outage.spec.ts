import { expect, test } from "@playwright/test"

// The service worker's requests would get past page.route.
test.use({ serviceWorkers: "block" })

test("the app starts while Umami's script never answers", async ({ page }) => {
  await page.route("**/umami.dojo.pt/script.js", () => {})
  await page.addInitScript(() =>
    localStorage.setItem("onboardingSeen", "true"),
  )
  // Not the default "load", which the unanswered script holds back regardless.
  // Not "commit" either: no markup has arrived yet, so [ngh] already counts 0.
  await page.goto("/jo/1", { waitUntil: "domcontentloaded" })
  // Hydration's cleanup clears these, so the bundle has run.
  await expect(page.locator("[ngh]")).toHaveCount(0, { timeout: 30_000 })
})
