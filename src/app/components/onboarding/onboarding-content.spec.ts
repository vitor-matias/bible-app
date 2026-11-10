import {
  INSTALL_STEP_ID,
  nativeOnboardingSteps,
  ONBOARDING_STEPS,
  sfSymbol,
} from "./onboarding-content"

const texts = (
  steps: readonly { intro: string; features: readonly { text: string }[] }[],
) =>
  steps.flatMap((entry) => [
    entry.intro,
    ...entry.features.map((feature) => feature.text),
  ])

describe("ONBOARDING_STEPS", () => {
  const step = (id: string) => ONBOARDING_STEPS.find((entry) => entry.id === id)

  // Short enough for a first-time reader to remember: one job per step.
  it("teaches the book, the reference search and the letter size, in that order", () => {
    expect(ONBOARDING_STEPS.map((entry) => entry.id)).toEqual([
      "welcome",
      "books",
      "tools",
      "customize",
      INSTALL_STEP_ID,
    ])
  })

  // The web header has the book's name and the chapter number as two buttons.
  it("points to the book's name, then the chapter number", () => {
    expect(step("books")?.intro).toContain("toque no nome do livro")
    expect(step("books")?.features[0].text).toContain(
      "toque no número ao lado do nome do livro",
    )
    expect(step("books")?.features[2].text).toContain("«Filtrar livros»")
  })

  it("opens a reference heard at Mass through search", () => {
    expect(step("tools")?.title).toBe("Encontrar uma passagem")
    expect(step("tools")?.intro).toContain("«Jo 3,16»")
    expect(step("tools")?.intro).toContain("«Pesquisar»")
  })

  // An empty step left the dialog's floor blank under one sentence.
  it("gives every reading step a few tips", () => {
    for (const entry of ONBOARDING_STEPS) {
      if (entry.id === INSTALL_STEP_ID) continue
      expect(entry.features.length, entry.id).toBeGreaterThanOrEqual(3)
    }
  })

  it("finds the replay and the bookmarks in the web menu", () => {
    const texts = ONBOARDING_STEPS.flatMap((entry) =>
      entry.features.map((feature) => feature.text),
    )
    expect(texts).toContain(
      "Pode voltar a ver esta introdução em «Menu» (☰), em «Como usar a app».",
    )
    expect(step("tools")?.features[2].text).toContain(
      "«Menu» (☰), em «Marcadores»",
    )
    // Only where the browser can share does the web menu offer it.
    expect(step("tools")?.features[1].text).toMatch(
      /^No telemóvel e no tablet, .*«Partilhar» em «Menu» \(☰\)/,
    )
  })

  // A screen reader says the name; the glyph only helps those who see it.
  it("names each button before its glyph", () => {
    expect(step("customize")?.intro).toContain("«Menu» (☰)")
  })

  it("keeps the offline note with the install, where it applies", () => {
    expect(step("welcome")?.features.map((f) => f.icon)).toEqual([
      "explore",
      "history",
      "touch_app",
    ])
    expect(step(INSTALL_STEP_ID)?.intro).toContain("sem ligação")
  })
})

describe("nativeOnboardingSteps", () => {
  const steps = nativeOnboardingSteps()
  const step = (id: string) => steps.find((entry) => entry.id === id)

  it("leaves out the install step: the iOS app is installed", () => {
    expect(steps.map((entry) => entry.id)).not.toContain(INSTALL_STEP_ID)
    expect(steps.length).toBe(ONBOARDING_STEPS.length - 1)
  })

  // The iOS app's passage button sits in the bottom bar and opens on the
  // current book's chapters; «Livros» leads back to the books.
  it("describes the iOS app's bars, not the web header", () => {
    expect(step("books")?.intro).toContain("barra inferior")
    // The ringed copy is the real button: a fresh install opens on «Sobre a
    // Bíblia», which no "livro e capítulo" describes.
    expect(step("books")?.intro).toContain("O botão acima")
    expect(step("books")?.intro).toContain("«Livros»")
    expect(step("customize")?.intro).toContain("«Texto e aparência» (AA)")
    for (const text of texts(steps)) {
      expect(text).not.toContain("☰")
      expect(text).not.toContain("No topo do ecrã")
      expect(text).not.toContain("teclado")
      expect(text).not.toContain("‹")
    }
  })

  it("finds the replay under «Mais» and «Marcadores» in the top bar", () => {
    expect(step("welcome")?.features[2].text).toContain("«Mais» (⋯)")
    expect(step("tools")?.features[1].text).toContain(
      "«Partilhar» no menu «Mais» (⋯)",
    )
    expect(step("tools")?.features[2].text).toContain("«Marcadores», no topo")
  })

  // The apps ring their own bar button: their text step names «Texto e
  // aparência», where the web's names its menu.
  it("tells the apps which bar button each page names", () => {
    expect(steps.map((entry) => entry.highlight)).toEqual([
      undefined,
      "passage",
      "search",
      "text",
    ])
  })

  it("shows the logo on the welcome page and symbols elsewhere", () => {
    expect(step("welcome")?.logo).toBe(true)
    expect(step("tools")).toEqual(
      expect.objectContaining({ logo: false, symbol: "magnifyingglass" }),
    )
  })

  it("has a symbol for every icon it uses", () => {
    for (const source of ONBOARDING_STEPS) {
      if (source.id === INSTALL_STEP_ID) continue
      for (const icon of [
        source.icon,
        ...source.features.map((feature) => feature.icon),
      ]) {
        expect(sfSymbol(icon), icon).not.toBe("circle")
      }
    }
  })
})

describe("nativeOnboardingSteps for the Android app", () => {
  const steps = nativeOnboardingSteps(ONBOARDING_STEPS, "android")
  const step = (id: string) => steps.find((entry) => entry.id === id)

  // The passage is the top bar's title.
  it("points to the passage on top, with «Livros» to go back", () => {
    expect(step("books")?.intro).toContain("no topo do ecrã")
    expect(step("books")?.intro).toContain("O botão acima")
    expect(step("books")?.intro).toContain("«Génesis 1»")
    expect(step("books")?.intro).toContain("«Livros»")
    expect(step("books")?.intro).not.toContain("barra inferior")
    for (const text of texts(steps)) {
      expect(text).not.toContain("▾")
      expect(text).not.toContain("←")
    }
  })

  it("finds the replay under «Mais opções»", () => {
    expect(step("welcome")?.features[2].text).toContain("«Mais opções» (⋮)")
    expect(step("tools")?.features[1].text).toContain(
      "«Partilhar» no menu «Mais opções» (⋮)",
    )
    expect(step("tools")?.features[2].text).toContain("«Marcadores», no topo")
  })

  it("names its text button, and shows its icon in the hero", () => {
    expect(step("customize")?.intro).toContain("«Texto e aparência» (TT)")
    expect(step("customize")?.icon).toBe("format_size")
  })

  it("sends the Material icons, which the Android app draws", () => {
    expect(step("tools")?.icon).toBe("search")
    expect(step("books")?.features.map((feature) => feature.icon)).toEqual([
      "touch_app",
      "swipe",
      "search",
    ])
  })
})
