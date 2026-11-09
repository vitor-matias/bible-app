import { expect, test } from "@playwright/test"

// Only the built page runs Umami's own script through the app's hook.
// The service worker's requests would get past page.route, real or not.
test.use({ serviceWorkers: "block" })

test("Umami's script only runs once the hook that cleans its URLs is set", async ({
  page,
}) => {
  await page.route("**/umami.dojo.pt/script.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "window.hookWhenTrackerRan = typeof window.umamiBeforeSend",
    }),
  )
  await page.goto("/jo/1", { waitUntil: "commit" })
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "hookWhenTrackerRan")))
    .toBe("function")
})

test("what the reader searches doesn't reach Umami", async ({
  page,
  request,
}) => {
  // This spec needs the real tracker, which only its server can provide.
  const tracker = await request
    .get("https://umami.dojo.pt/script.js", { timeout: 10_000 })
    .catch(() => null)
  test.skip(!tracker?.ok(), "Umami's script is unavailable")

  const umami: string[] = []
  await page.route("**/umami.dojo.pt/api/send", (route) => {
    umami.push(route.request().postData() ?? "")
    return route.fulfill({ json: {} })
  })
  // The search event follows the answer, so a failed search would send none.
  await page.route("**/v1/search?*", (route) =>
    route.fulfill({
      json: { verses: [], total: 0, currentPage: 1, totalPages: 0 },
    }),
  )
  await page.addInitScript(() =>
    localStorage.setItem("onboardingSeen", "true"),
  )
  await page.goto("/search?q=palavrasecreta")
  await expect(page.locator("search-bar input")).toHaveValue("palavrasecreta")
  await expect
    .poll(() => umami.filter((body) => JSON.parse(body).payload.name === "search"))
    .toHaveLength(1)
  await page.waitForLoadState("networkidle")
  expect(umami.join()).toContain("/search")
  expect(umami.join()).not.toContain("palavrasecreta")
})
