import { devices, expect, test } from "@playwright/test"

// BibleScroll is the reader's one-verse-per-card view, offered on phones and
// tablets only. Its chapter stops rely on how a real browser orders scroll
// events and intersection readings, which the unit specs' mocked observer
// cannot show.
const { defaultBrowserType: _, ...pixel7 } = devices["Pixel 7"]
test.use(pixel7)

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("onboardingSeen", "true")
    localStorage.setItem("cardsView", "true")
  })
})

// Regression: a failed load slides the reader 60px aside and back. That showed
// 84% of the stop and then all of it again, which the stop took for the reader
// leaving and coming back: it asked for the chapter again on every failure,
// about twice a second, for as long as the reader stayed on it offline.
test("asks once for a chapter that fails to load, however long the reader rests on its stop", async ({
  page,
}) => {
  let requests = 0
  await page.route(/\/v1\/jhn\/4$/, (route) => {
    requests += 1
    return route.abort()
  })
  await page.goto("/jo/3")
  await page.locator("article.verse-card").first().waitFor({ timeout: 15_000 })
  expect(requests).toBe(0)

  // Past the last verse, onto the stop that leads to John 4.
  await page
    .locator("mat-drawer-content")
    .evaluate((scroller) => scroller.scrollTo({ top: scroller.scrollHeight }))
  await expect.poll(() => requests, { timeout: 10_000 }).toBe(1)

  // Long enough for several of the retries the slide used to set off.
  await page.waitForTimeout(3_000)
  expect(requests).toBe(1)
  await expect(page).toHaveURL(/\/jo\/3$/)
  await expect(page.locator(".end-card")).toBeInViewport()
})
