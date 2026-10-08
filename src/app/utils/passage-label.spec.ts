import { passageLabel, passageSpokenLabel } from "./passage-label"

describe("passage labels", () => {
  const luke = { id: "luk", shortName: "Lucas", name: "Evangelho de São Lucas" }
  const psalms = { id: "psa", shortName: "Salmos", name: "Livro dos Salmos" }

  it("cite a verse after a comma, as the text does", () => {
    expect(passageLabel(luke, 2, 32)).toBe("Lucas 2,32")
    expect(passageLabel(luke, 2)).toBe("Lucas 2")
  })

  it("name one psalm, with its liturgical number in parentheses", () => {
    expect(passageLabel(psalms, 23)).toBe("Salmo 23 (22)")
    expect(passageLabel(psalms, 136, 7)).toBe("Salmo 136 (135),7")
    expect(passageLabel(psalms, 116)).toBe("Salmo 116 (114-115)")
    expect(passageLabel(psalms, 1)).toBe("Salmo 1")
  })

  it("read the liturgical number out for VoiceOver", () => {
    expect(passageSpokenLabel(psalms, 23)).toBe("Salmo 23, na liturgia 22")
    expect(passageSpokenLabel(psalms, 116)).toBe(
      "Salmo 116, na liturgia 114 e 115",
    )
    expect(passageSpokenLabel(psalms, 150)).toBe("Salmo 150")
    expect(passageSpokenLabel(luke, 2)).toBe("Evangelho de São Lucas 2")
  })
})
