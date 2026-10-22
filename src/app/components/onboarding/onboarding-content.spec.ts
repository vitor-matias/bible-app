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
    const autoScroll = feature("customize", "arrow_circle_down")
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
      icon: "bookmarks",
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

describe("nativeOnboardingSteps for the Android app", () => {
  const steps = nativeOnboardingSteps(ONBOARDING_STEPS, "android")
  const step = (id: string) => steps.find((entry) => entry.id === id)

  // Its text button and ⋮ sit at the top right; the rest is where the iOS
  // app has it.
  it("points to the Android app's text button and ⋮ menu", () => {
    expect(step("customize")?.intro).toContain(
      "Toque em TT (Texto e aparência), no topo à direita",
    )
    // Its hero shows that button's icon.
    expect(step("customize")?.icon).toBe("format_size")
    const autoScroll = step("customize")?.features.find(
      (feature) => feature.icon === "arrow_circle_down",
    )?.text
    expect(autoScroll).toContain("menu ⋮, no topo à direita")
    expect(autoScroll).not.toContain("⋯")
  })

  // The passage is the top bar's title, the arrows sit in the corners, and
  // the bars follow the scrolling rather than a tap on the text.
  it("points to the passage on top and the arrows in the corners", () => {
    expect(step("navigate")?.intro).toContain("No topo do ecrã")
    expect(step("navigate")?.intro).not.toContain("barra inferior")
    const [swipe, , notes] = step("navigate")?.features ?? []
    expect(swipe.text).toContain("cantos inferiores")
    expect(swipe.text).not.toContain("barra inferior")
    expect(notes.text).toContain("ícone de notas")
    expect(notes.text).not.toContain("Um toque no texto")
  })

  // The menu's entry is "Como usar a app", under ⋮; the title is the passage.
  it("names where the introduction is found again, and the title", () => {
    expect(step("welcome")?.features[2].text).toContain(
      "no menu ⋮, em «Como usar a app»",
    )
    expect(step("navigate")?.intro).toContain("«Génesis 1 ▾»")
  })

  it("keeps the iOS app's words where the bars are alike", () => {
    expect(step("tools")?.features[1].text).toContain("no topo à direita")
  })

  it("sends the Material icons, which the Android app draws", () => {
    expect(step("tools")?.icon).toBe("search")
    expect(step("customize")?.features.map((feature) => feature.icon)).toEqual([
      "dark_mode",
      "auto_stories",
      "text_increase",
      "arrow_circle_down",
    ])
  })
})
