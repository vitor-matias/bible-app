import {
  introductionTitle,
  passageLabel,
  passageShortLabels,
  passageSpokenLabel,
  sharedPassage,
} from "./passage-label"

describe("passage labels", () => {
  const luke = { id: "luk", shortName: "Lucas", name: "Evangelho de São Lucas" }
  const psalms = { id: "psa", shortName: "Salmos", name: "Livro dos Salmos" }

  // The card above chapter 1 said only "Introdução ao livro".
  it("name a book's introduction after the book, in its gender", () => {
    expect(introductionTitle({ name: "Livro do Génesis" })).toBe(
      "Introdução ao Livro do Génesis",
    )
    expect(introductionTitle(luke)).toBe("Introdução ao Evangelho de São Lucas")
    expect(introductionTitle({ name: "Cântico dos Cânticos" })).toBe(
      "Introdução ao Cântico dos Cânticos",
    )
    expect(introductionTitle({ name: "Primeiro Livro dos Macabeus" })).toBe(
      "Introdução ao Primeiro Livro dos Macabeus",
    )
    expect(introductionTitle({ name: "Carta aos Romanos" })).toBe(
      "Introdução à Carta aos Romanos",
    )
    expect(introductionTitle({ name: "Primeira Carta aos Coríntios" })).toBe(
      "Introdução à Primeira Carta aos Coríntios",
    )
  })

  it("cite a verse after a comma, as the text does", () => {
    expect(passageLabel(luke, 2, 32)).toBe("Lucas 2,32")
    expect(passageLabel(luke, 2)).toBe("Lucas 2")
  })

  // Shares said «Ler Evangelho de São Mateus 5.» for /mt/5?verseStart=3&verseEnd=12.
  it("name the passage a shared link opens", () => {
    expect(sharedPassage(luke, 5, "?verseStart=3&verseEnd=12")).toBe(
      "Lucas 5,3-12",
    )
    expect(sharedPassage(luke, 5, "?verseStart=3")).toBe("Lucas 5,3")
    expect(sharedPassage(luke, 5, "?verseStart=3&verseEnd=3")).toBe("Lucas 5,3")
    expect(sharedPassage(luke, 5, "")).toBe("Lucas 5")
    expect(sharedPassage(psalms, 23, "?verseStart=1&verseEnd=4")).toBe(
      "Salmo 23 (22),1-4",
    )
    expect(sharedPassage(luke, 0, "")).toBe("Lucas Introdução")
    expect(
      sharedPassage(
        { ...luke, name: "Introdução ao Pentateuco", introSlug: "pentateuco" },
        0,
        "",
      ),
    ).toBe("Introdução ao Pentateuco")
  })

  it("name one psalm, with its liturgical number in parentheses", () => {
    expect(passageLabel(psalms, 23)).toBe("Salmo 23 (22)")
    expect(passageLabel(psalms, 136, 7)).toBe("Salmo 136 (135),7")
    expect(passageLabel(psalms, 116)).toBe("Salmo 116 (114-115)")
    expect(passageLabel(psalms, 1)).toBe("Salmo 1")
  })

  it("abbreviate the book where the name doesn't fit", () => {
    expect(passageShortLabels({ id: "deu", abrv: "Dt" }, 3)).toEqual(["Dt 3"])
    expect(passageShortLabels({ id: "act", abrv: "At" }, 0)).toEqual([
      "At Intro",
    ])
    expect(passageShortLabels({ id: "jas", abrv: "Tg \ufeff" }, 1)).toEqual([
      "Tg 1",
    ])
  })

  it("abbreviate a psalm, then drop its liturgical number", () => {
    const psalms = { id: "psa", abrv: "Sl" }
    expect(passageShortLabels(psalms, 116)).toEqual([
      "Sl 116 (114-115)",
      "Sl 116",
    ])
    expect(passageShortLabels(psalms, 1)).toEqual(["Sl 1"])
    expect(passageShortLabels(psalms, 0)).toEqual(["Sl Intro"])
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
