import { formatPassage, highlightSegments, normalizeForSearch } from "./text"

describe("text utils", () => {
  describe("highlightSegments", () => {
    /** The words, in order, with the matched ones marked. */
    function shape(segments: HighlightSegment[]): string {
      return segments
        .map((part) => (part.highlight ? `[${part.text}]` : part.text))
        .join("")
    }

    it("marks every occurrence of the term", () => {
      expect(shape(highlightSegments("Jesus disse a Jesus", "Jesus"))).toBe(
        "[Jesus] disse a [Jesus]",
      )
    })

    it("matches whatever the case", () => {
      expect(shape(highlightSegments("Jesus de Nazaré", "jesus"))).toBe(
        "[Jesus] de Nazaré",
      )
    })

    it("matches the term the reader meant, not the spaces around it", () => {
      expect(shape(highlightSegments("E Jesus disse", " Jesus "))).toBe(
        "E [Jesus] disse",
      )
    })

    it("takes the term as words, not as a pattern", () => {
      expect(shape(highlightSegments("A pergunta (1,5) aqui", "(1,5)"))).toBe(
        "A pergunta [(1,5)] aqui",
      )
    })

    it("leaves the text alone when there is nothing to look for", () => {
      expect(highlightSegments("um versículo", "   ")).toEqual([
        { text: "um versículo", highlight: false },
      ])
    })

    it("leaves the text alone when the term is not in it", () => {
      expect(shape(highlightSegments("um versículo", "Moisés"))).toBe(
        "um versículo",
      )
    })
  })

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
