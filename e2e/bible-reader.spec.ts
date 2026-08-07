import { expect, type Locator, type Page, test } from "@playwright/test"

// The app proxies /v1 to https://biblia.capuchinhos.org — tests run against
// the live dev server and the real API.

// Icons are ligatures in the Material Symbols font, so an icon the font doesn't
// carry doesn't fail loudly — it renders its own name as words. A ligature
// collapses to roughly one em; spelled-out letters run many times wider.
// mat-icon is a fixed 24px box that clips the overflow, so the giveaway is
// scrollWidth, not the element's own width.
function iconsRenderedAsText(scope: Locator): Promise<string[]> {
  return scope.locator("mat-icon").evaluateAll((icons) =>
    icons
      .filter((icon) => icon.textContent?.trim() && icon.checkVisibility())
      .filter((icon) => {
        const { fontSize } = getComputedStyle(icon)
        return icon.scrollWidth > Number.parseFloat(fontSize) * 1.6
      })
      .map((icon) => icon.textContent?.trim() ?? ""),
  )
}

// The icon font is a few megabytes, so poll rather than measure once: names
// still spelled out after the font has had time to arrive are genuinely absent
// from it.
async function expectIconsRendered(scope: Locator) {
  await expect
    .poll(() => iconsRenderedAsText(scope), { timeout: 20_000 })
    .toEqual([])
}

async function openReader(page: Page) {
  await page.goto("/jo/1")
  await page.locator("verse").first().waitFor({ timeout: 15_000 })
  await page.evaluate(() =>
    document.fonts.load('24px "Material Symbols Outlined"'),
  )
}

test.describe("Initial load", () => {
  test("redirects to a book/chapter URL", async ({ page }) => {
    await page.goto("/")
    // Angular router redirects to a stored or default book/chapter
    await expect(page).toHaveURL(/\/[a-z0-9-]+\/\d+/, { timeout: 10_000 })
    // Content should load — either verses (bible book) or the about page
    await expect(
      page.locator("verse, about").first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test("shows the header with book and chapter labels", async ({ page }) => {
    await page.goto("/jo/1")
    // Wait for content to load before checking header
    await page.locator("verse").first().waitFor({ timeout: 15_000 })
    await expect(page.locator(".bookSelectorButton").first()).toBeVisible()
    // Header should mention John's abbreviation or name
    await expect(page.locator("mat-toolbar")).toContainText(/Jo/i)
  })
})

test.describe("Direct URL navigation", () => {
  test("loads John 1 at /jo/1", async ({ page }) => {
    await page.goto("/jo/1")
    await expect(page.locator("verse").first()).toBeVisible({ timeout: 15_000 })
    // URL should stay at /jo/1
    await expect(page).toHaveURL(/\/jo\/1/)
  })

  test("loads John 3 at /jo/3", async ({ page }) => {
    await page.goto("/jo/3")
    await expect(page.locator("verse").first()).toBeVisible({ timeout: 15_000 })
    // The famous verse 16 should be present (attribute selector — numeric IDs can't use #16 in CSS)
    await expect(page.locator('verse[id="16"]')).toBeVisible()
  })

  test("navigating to a different chapter via URL shows new content", async ({
    page,
  }) => {
    await page.goto("/jo/1")
    await page.locator("verse").first().waitFor({ timeout: 15_000 })

    // Grab the text of the first verse in chapter 1
    const ch1Text = await page.locator("verse").first().innerText()

    await page.goto("/jo/2")
    await page.locator("verse").first().waitFor({ timeout: 15_000 })

    const ch2Text = await page.locator("verse").first().innerText()
    expect(ch1Text).not.toEqual(ch2Text)
  })
})

test.describe("Book selector drawer", () => {
  test("opens and lists books when the book toggle is clicked", async ({
    page,
  }) => {
    await page.goto("/jo/1")
    await page.locator("verse").first().waitFor({ timeout: 15_000 })

    await page.locator(".bookSelectorButton mat-button-toggle").first().click()
    const drawer = page.locator("mat-drawer")
    await expect(drawer).toBeVisible({ timeout: 5_000 })
    // Book selector should list at least one entry
    await expect(drawer.locator("mat-tree-node, mat-list-item").first()).toBeVisible()
  })

  test("closes the drawer with the dismiss button", async ({ page }) => {
    await page.goto("/jo/1")
    await page.locator("verse").first().waitFor({ timeout: 15_000 })

    await page.locator(".bookSelectorButton mat-button-toggle").first().click()
    const drawer = page.locator("mat-drawer")
    await expect(drawer).toBeVisible({ timeout: 5_000 })

    await page.locator(".dismiss-button").click()
    await expect(drawer).not.toBeVisible({ timeout: 5_000 })
  })
})

test.describe("Chapter selector", () => {
  test("opens chapter list when chapter toggle is clicked", async ({ page }) => {
    await page.goto("/jo/1")
    await page.locator("verse").first().waitFor({ timeout: 15_000 })

    // The second toggle is the chapter picker
    await page.locator(".bookSelectorButton mat-button-toggle").nth(1).click()
    const drawer = page.locator("mat-drawer")
    await expect(drawer).toBeVisible({ timeout: 5_000 })
    await expect(drawer.locator("chapter-selector")).toBeVisible()
  })
})

test.describe("Search", () => {
  test("search page loads with an input field", async ({ page }) => {
    await page.goto("/search")
    await expect(
      page.locator('input[aria-label="Procurar na Bíblia"]'),
    ).toBeVisible({ timeout: 10_000 })
  })

  test("returns results for a known term", async ({ page }) => {
    await page.goto("/search")
    const input = page.locator('input[aria-label="Procurar na Bíblia"]')
    await input.waitFor({ timeout: 10_000 })
    await input.fill("luz")
    await input.press("Enter")

    // Results list should appear
    await expect(page.locator(".results-list")).toBeVisible({ timeout: 15_000 })
    await expect(page.locator(".result-item").first()).toBeVisible()
  })

  test("clicking a search result navigates to the verse", async ({ page }) => {
    await page.goto("/search")
    const input = page.locator('input[aria-label="Procurar na Bíblia"]')
    await input.waitFor({ timeout: 10_000 })
    await input.fill("amor")
    await input.press("Enter")

    await page.locator(".result-item").first().waitFor({ timeout: 15_000 })
    await page.locator(".result-item").first().click()

    // Should navigate away from /search to a book/chapter
    await expect(page).toHaveURL(/\/[a-z0-9-]+\/\d+/, { timeout: 10_000 })
    await expect(page.locator("verse").first()).toBeVisible({ timeout: 15_000 })
  })
})

test.describe("Icon font", () => {
  test("toolbar icons render as glyphs", async ({ page }) => {
    await openReader(page)
    await expectIconsRendered(page.locator("mat-toolbar"))
  })

  test("header menu icons render as glyphs", async ({ page }) => {
    await openReader(page)

    await page.locator(".menuButton").click()
    const menu = page.locator(".cdk-overlay-container")
    await expect(menu.locator("mat-icon").first()).toBeVisible({
      timeout: 5_000,
    })
    await expectIconsRendered(menu)
  })

  test("book selector icons render as glyphs, expanded and collapsed", async ({
    page,
  }) => {
    await openReader(page)

    await page.locator(".bookSelectorButton mat-button-toggle").first().click()
    const drawer = page.locator("mat-drawer")
    await expect(drawer).toBeVisible({ timeout: 5_000 })
    // Collapsed groups show one toggle icon, expanded groups the other.
    await expectIconsRendered(drawer)

    await drawer.locator(".book-group").first().click()
    await expect(drawer.locator("mat-tree-node").nth(1)).toBeVisible()
    await expectIconsRendered(drawer)
  })
})

test.describe("About page", () => {
  test("loads the about page at /about/1", async ({ page }) => {
    await page.goto("/about/1")
    await expect(page.locator("about")).toBeVisible({ timeout: 10_000 })
  })
})

test.describe("Keyboard accessibility", () => {
  test("verse with footnotes activates bottom sheet on Enter", async ({
    page,
  }) => {
    // John 1 has footnotes in the Portuguese Difusora Bíblica translation
    await page.goto("/jo/1")
    await page.locator("verse").first().waitFor({ timeout: 15_000 })

    // Find a verse text span with role=button (has footnotes)
    const interactiveSpan = page
      .locator('span.interactive[role="button"]')
      .first()
    const count = await interactiveSpan.count()
    if (count === 0) {
      test.skip()
      return
    }

    await interactiveSpan.focus()
    await interactiveSpan.press("Enter")
    await expect(page.locator("footnotes-bottom-sheet")).toBeVisible({
      timeout: 5_000,
    })
  })

  test("verse footnote indicator activates on Space", async ({ page }) => {
    await page.goto("/jo/1")
    await page.locator("verse").first().waitFor({ timeout: 15_000 })

    const indicator = page.locator(".footnoteIndicator").first()
    const count = await indicator.count()
    if (count === 0) {
      test.skip()
      return
    }

    await indicator.focus()
    await indicator.press("Space")
    await expect(page.locator("footnotes-bottom-sheet")).toBeVisible({
      timeout: 5_000,
    })
  })
})
