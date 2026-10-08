import { foldText, highlightWords, searchWords, verseText } from "./text-search"

describe("text search", () => {
  // The edition splits "Senhor" into a run of its own (small capitals), and
  // lines of verse into quotes: Daniel 3,72.
  it("joins a verse's runs and lines as the text has them", () => {
    expect(
      verseText({
        bookId: "dan",
        chapterNumber: 3,
        number: 72,
        text: [
          { type: "quote", text: "\u200b", identLevel: 1 },
          { type: "text", text: "Luz e trevas, bendizei o " },
          { type: "text", text: "Senhor" },
          { type: "text", text: ":" },
          {
            type: "quote",
            text: "– a Ele a glória e o louvor eternamente!",
            identLevel: 1,
          },
        ],
      } as Verse),
    ).toBe(
      "Luz e trevas, bendizei o Senhor: – a Ele a glória e o louvor eternamente!",
    )
  })

  it("folds case and accents", () => {
    expect(foldText("Misericórdia, CÉU")).toBe("misericordia, ceu")
  })

  it("looks for the query's words, leaving out one-letter ones", () => {
    expect(searchWords("Deus é amor")).toEqual(["deus", "amor"])
    expect(searchWords("  Pai nosso, que estás no Céu ")).toEqual([
      "pai",
      "nosso",
      "que",
      "estas",
      "no",
      "ceu",
    ])
    expect(searchWords("é")).toEqual(["e"])
    expect(searchWords(" , ")).toEqual([])
  })

  describe("marking matches", () => {
    const marked = (text: string, query: string) =>
      highlightWords(text, query)
        .filter((segment) => segment.highlight)
        .map((segment) => segment.text)

    it("whatever the accents", () => {
      expect(marked("Felizes os misericordiosos", "misericórdia")).toEqual([])
      expect(marked("Felizes os misericordiosos", "misericordiosos")).toEqual([
        "misericordiosos",
      ])
      expect(marked("Tende misericórdia de mim", "misericordia")).toEqual([
        "misericórdia",
      ])
    })

    it("only where words begin", () => {
      expect(marked("A Luz reluz nas luzes", "luz")).toEqual(["Luz", "luz"])
    })

    it("each word, not the whole phrase", () => {
      expect(marked("Pai nosso, que estás no Céu", "pai céu")).toEqual([
        "Pai",
        "Céu",
      ])
    })

    it("leaving short words unmarked when longer ones are there", () => {
      expect(marked("Deus é amor", "Deus é amor")).toEqual(["Deus", "amor"])
    })

    it("keeping the text whole", () => {
      const text = "O Senhor é o meu pastor: nada me falta."
      expect(
        highlightWords(text, "pastor")
          .map((segment) => segment.text)
          .join(""),
      ).toBe(text)
    })
  })
})
