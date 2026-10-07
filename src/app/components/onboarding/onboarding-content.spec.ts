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
    expect(step("customize")?.intro).toContain("⋯")
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

  it("shows the logo on the welcome page and symbols elsewhere", () => {
    expect(step("welcome")?.logo).toBeTrue()
    expect(step("tools")).toEqual(
      jasmine.objectContaining({ logo: false, symbol: "magnifyingglass" }),
    )
    expect(step("tools")?.features[1]).toEqual({
      symbol: "bookmark",
      text: "Guarde marcadores coloridos nos capítulos a que quer voltar.",
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
