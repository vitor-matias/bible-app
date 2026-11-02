import { expect, test } from "@playwright/test"

// Only the built page runs Umami's own script through the app's hook.
// The service worker's requests would get past page.route, real or not.
test.use({ serviceWorkers: "block" })

test("what the reader searches doesn't reach Umami", async ({ page }) => {
  const umami: string[] = []
  await page.route("**/umami.dojo.pt/api/send", (route) => {
    umami.push(route.request().postData() ?? "")
    return route.fulfill({ json: {} })
  })
  await page.addInitScript(() =>
    localStorage.setItem("onboardingSeen", "true"),
  )
  await page.goto("/search?q=palavrasecreta")
  await expect(page.locator("search-bar input")).toHaveValue("palavrasecreta")
  await expect.poll(() => umami.length).toBeGreaterThan(0)
  await page.waitForLoadState("networkidle")
  expect(umami.join()).toContain("/search")
  expect(umami.join()).not.toContain("palavrasecreta")
})
