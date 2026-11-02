import { formatPassage, normalizeForSearch } from "./text"

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
})
