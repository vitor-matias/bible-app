import { expect, test } from "@playwright/test"

// The Índice Bíblico-Pastoral at /indice, against the live dev server and API.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("onboardingSeen", "true"))
})

test("filters the themes and offers a Bible search when none match", async ({
  page,
}) => {
  await page.goto("/indice")
  await expect(
    page.getByRole("heading", { level: 1, name: "Índice Bíblico-Pastoral" }),
  ).toBeAttached({ timeout: 15_000 })

  const filter = page.getByRole("searchbox", { name: "Filtrar temas" })
  await filter.fill("maria")
  await expect(page.locator("#tema-maria")).toBeVisible()
  await expect(page.locator("#tema-pedro")).toHaveCount(0)

  await filter.fill("zzzz")
  await expect(page.getByText("Nenhum tema encontrado.")).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Procurar «zzzz» na Bíblia" }),
  ).toHaveAttribute("href", "/search?q=zzzz")
})

test("a citation opens the reader, and the toast leads back to its theme", async ({
  page,
}) => {
  await page.goto("/indice/maria")
  const citation = page
    .locator('#tema-maria article a[href]:not([href^="/indice"])')
    .first()
  await citation.click({ timeout: 15_000 })

  await expect(page).toHaveURL(/\/[a-z0-9]+\/\d+\?verseStart=\d+/)
  await expect(page.locator("verse").first()).toBeVisible({ timeout: 15_000 })

  await page.getByRole("button", { name: "Voltar para o Índice" }).click()
  await expect(page).toHaveURL(/\/indice\/maria$/)
  await expect(page.locator("#tema-maria")).toBeVisible()
})

test("search offers the themes whose titles begin with the query", async ({
  page,
}) => {
  await page.goto("/search")
  const input = page.locator('input[aria-label="Procurar na Bíblia"]')
  await input.waitFor({ timeout: 10_000 })
  await input.fill("Mari")

  const theme = page.locator('a.passage-suggestion[href="/indice/maria"]')
  await expect(theme).toBeVisible({ timeout: 10_000 })
  await theme.click()
  await expect(page).toHaveURL(/\/indice\/maria$/)
})
