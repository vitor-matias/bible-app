import { devices, expect, test } from "@playwright/test"

// Routes, chapter navigation and the web's pointers to the native apps,
// against the live dev server and API.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("onboardingSeen", "true"))
})

for (const url of ["/xx/1", "/jo/99", "/jo/abc", "/sobre/999"]) {
  test(`${url} shows a noindexed not-found page`, async ({ page }) => {
    await page.goto(url)
    await expect(
      page.getByRole("heading", { name: "Capítulo não encontrado" }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    )
  })
}

test("the chapter arrows move between chapters, and a reload keeps the place", async ({
  page,
}) => {
  await page.goto("/jo/3")
  await page.locator("verse").first().waitFor({ timeout: 15_000 })

  await page.getByRole("link", { name: "Capítulo seguinte" }).click()
  await expect(page).toHaveURL(/\/jo\/4$/)
  await expect(page.locator("h1")).toContainText("4")

  await page.getByRole("link", { name: "Capítulo anterior" }).click()
  await expect(page).toHaveURL(/\/jo\/3$/)

  await page.reload()
  await expect(page).toHaveURL(/\/jo\/3$/)
  await expect(page.locator("verse").first()).toBeVisible({ timeout: 15_000 })
})

test("a link opens its own passage, not the one read last", async ({
  page,
}) => {
  await page.goto("/mt/5")
  await page.locator("verse").first().waitFor({ timeout: 15_000 })

  await page.goto("/sl/23")
  await expect(page.locator("h1")).toContainText("Salmos 23", {
    timeout: 15_000,
  })
  // The heading can show before the reader saves the passage it opened.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("book")))
    .toBe("psa")

  await page.goto("/")
  await expect(page).toHaveURL(/\/sl\/23$/, { timeout: 15_000 })
})

test("Return on a blank search field searches nothing", async ({ page }) => {
  await page.goto("/search")
  const input = page.locator('input[aria-label="Procurar na Bíblia"]')
  await input.waitFor({ timeout: 10_000 })
  await input.fill("   ")
  await input.press("Enter")

  await expect(page).toHaveURL(/\/search$/)
  await expect(page.locator(".result-item")).toHaveCount(0)
  await expect(page.getByText("Nenhum versículo")).toHaveCount(0)
})

for (const [path, store] of [
  ["/android", "https://play.google.com/store/apps/details?id="],
  ["/ios", "https://apps.apple.com/app/id"],
]) {
  test(`${path} sends the visitor to the store listing`, async ({ page }) => {
    await page.route(/play\.google\.com|apps\.apple\.com/, (route) =>
      route.fulfill({ body: "store" }),
    )
    await page.goto(path)
    await expect(page).toHaveURL((url) => url.href.startsWith(store), {
      timeout: 15_000,
    })
  })
}

test.describe("on an Android phone", () => {
  const { defaultBrowserType: _, ...pixel7 } = devices["Pixel 7"]
  test.use(pixel7)

  test("the tutorial's install step offers Google Play", async ({ page }) => {
    await page.goto("/jo/1")
    await page.locator("verse").first().waitFor({ timeout: 15_000 })
    await page.locator(".menuButton").click()
    await page.getByRole("menuitem", { name: "Como usar a app" }).click()

    const wizard = page.locator("onboarding")
    await wizard.locator(".dot").last().click()
    await expect(wizard.locator("a.store-badge")).toHaveAttribute(
      "href",
      /^https:\/\/play\.google\.com\//,
    )
  })
})
