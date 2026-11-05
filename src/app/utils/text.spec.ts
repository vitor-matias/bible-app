import {
  EDITION,
  formatCitation,
  formatPassage,
  normalizeForSearch,
} from "./text"

describe("text utils", () => {
  describe("normalizeForSearch", () => {
    it("folds away accents, so a plain keyboard finds the book", () => {
      expect(normalizeForSearch("Génesis")).toBe("genesis")
      expect(normalizeForSearch("João")).toBe("joao")
      expect(normalizeForSearch("coração")).toBe("coracao")
    })

    it("folds away case", () => {
      expect(normalizeForSearch("MATEUS")).toBe("mateus")
    })

    it("collapses and trims spacing", () => {
      expect(normalizeForSearch("  Atos   dos   Apóstolos ")).toBe(
        "atos dos apostolos",
      )
    })

    it("leaves an already plain word alone", () => {
      expect(normalizeForSearch("marcos")).toBe("marcos")
    })
  })

  describe("formatPassage", () => {
    it("puts the reference after the words", () => {
      expect(formatPassage("Amarás ao Senhor", "Mateus 22,37")).toBe(
        "Amarás ao Senhor (Mateus 22,37)",
      )
    })

    it("gives the words alone when there is no reference", () => {
      expect(formatPassage("Amarás ao Senhor", "")).toBe("Amarás ao Senhor")
    })
  })

  describe("formatCitation", () => {
    it("quotes the words, then names the reference and the edition", () => {
      expect(
        formatCitation("Amarás ao Senhor", "Evangelho de São Mateus 22,37"),
      ).toBe(`«Amarás ao Senhor»\n— Evangelho de São Mateus 22,37, ${EDITION}`)
    })

    it("adds a psalm's other number, which is the one a leaflet prints", () => {
      expect(
        formatCitation("O Senhor é meu pastor", "Salmos 23,1", "22,1"),
      ).toBe(
        `«O Senhor é meu pastor»\n— Salmos 23,1 (numeração litúrgica: 22,1), ${EDITION}`,
      )
    })
  })
})
