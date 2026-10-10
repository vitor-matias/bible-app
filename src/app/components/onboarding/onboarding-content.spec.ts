import {
  INSTALL_STEP_ID,
  nativeOnboardingSteps,
  ONBOARDING_STEPS,
  sfSymbol,
} from "./onboarding-content"

describe("nativeOnboardingSteps", () => {
  const steps = nativeOnboardingSteps()
  const step = (id: string) => steps.find((entry) => entry.id === id)

  it("leaves out the install step: the iOS app is installed", () => {
    expect(steps.map((entry) => entry.id)).not.toContain(INSTALL_STEP_ID)
    expect(steps.length).toBe(ONBOARDING_STEPS.length - 1)
  })

  // The iOS app's bars put the picker at the bottom and the menu top-right.
  it("describes the iOS app's bars, not the web header", () => {
    expect(step("navigate")?.intro).toContain("barra inferior")
    expect(step("customize")?.intro).toContain("AA")
    const texts = steps.flatMap((entry) => [
      entry.intro,
      ...entry.features.map((feature) => feature.text),
    ])
    for (const text of texts) {
      expect(text).not.toContain("☰")
      expect(text).not.toContain("No topo do ecrã")
      expect(text).not.toContain("computador, use as setas")
    }
  })

  // Text, theme and page mode under AA; Marcadores a button of its own; and
  // auto-scroll still turned on from ⋯.
  it("points to the buttons of the iOS app's top and bottom bars", () => {
    const feature = (id: string, icon: string) =>
      step(id)?.features.find((entry) => entry.symbol === sfSymbol(icon))?.text
    expect(feature("tools", "bookmarks")).toContain("Toque no marcador")
    const autoScroll = feature("customize", "auto_mode")
    expect(autoScroll).toContain("menu ⋯")
  })

  it("names the reading modes in plain words", () => {
    const modes = step("customize")?.features.find(
      (feature) => feature.symbol === sfSymbol("auto_stories"),
    )?.text
    expect(modes).toContain("texto contínuo")
    expect(modes).toContain("página a página")
  })

  // There a tap on the text shows or hides the bars; only the notes icon opens
  // notes (it is no longer an asterisk).
  it("teaches the notes icon for notes", () => {
    const notes = step("navigate")?.features.find((feature) =>
      feature.text.includes("ler a nota"),
    )
    expect(notes?.text).toContain("ícone de notas")
    expect(notes?.text).not.toContain("asterisco")
    expect(notes?.text).not.toContain("Toque num versículo")
  })

  it("shows the logo on the welcome page and symbols elsewhere", () => {
    expect(step("welcome")?.logo).toBeTrue()
    expect(step("tools")).toEqual(
      jasmine.objectContaining({ logo: false, symbol: "magnifyingglass" }),
    )
    expect(step("tools")?.features[1]).toEqual({
      symbol: "bookmark",
      text: "Toque no marcador, no topo à direita, para guardar marcadores coloridos nos capítulos a que quer voltar.",
    })
  })

  it("has a symbol for every icon it uses", () => {
    for (const source of ONBOARDING_STEPS) {
      if (source.id === INSTALL_STEP_ID) continue
      for (const icon of [
        source.icon,
        ...source.features.map((feature) => feature.icon),
      ]) {
        expect(sfSymbol(icon)).withContext(icon).not.toBe("circle")
      }
    }
  })
})
