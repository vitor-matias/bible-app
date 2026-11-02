import { expect, test } from "@playwright/test"

// Without hydration, Angular wipes the prerendered page when it starts and the
// text is gone until the chapter has loaded again. A template that doesn't match
// what the browser parsed (a table without a tbody, say) throws NG05xx instead.
// `ng serve` never renders on the server, so only a production build shows this.
for (const url of ["/jo/1", "/gn/intro"]) {
  test(`hydrates ${url} without replacing it`, async ({ page }) => {
    const hydrationErrors: string[] = []
    page.on("console", (message) => {
      if (/NG05\d\d/.test(message.text())) hydrationErrors.push(message.text())
    })
    await page.addInitScript(() => {
      localStorage.setItem("onboardingSeen", "true")
      document.addEventListener("DOMContentLoaded", () => {
        document.querySelector(".chapterBlock")?.setAttribute("data-server", "")
      })
    })

    const response = await page.goto(url)
    expect(await response?.text()).toContain('ngh="')

    // Hydration's cleanup clears these once the app is stable.
    await expect(page.locator("[ngh]")).toHaveCount(0, { timeout: 30_000 })
    await expect(page.locator(".chapterBlock[data-server]")).toBeVisible()
    expect(hydrationErrors).toEqual([])
  })
}
