import { placeReferences, sectionStartsIn } from "./chapter-references"

function verse(number: number, text: TextType[]): Verse {
  return {
    bookId: "heb",
    chapterNumber: 1,
    number,
    verseLabel: String(number),
    text,
  }
}

const words = (text: string): TextType => ({ type: "text", text })
const heading = (tag: string, text: string): TextType =>
  ({ type: "section", tag, text }) as TextType
const references = (text: string): TextType => ({ type: "references", text })

describe("chapter references", () => {
  // Hebrews 1 as the edition prints it: verse 4's payload ends with the next
  // division's title and range, and then the first passage's title, both of
  // which introduce verse 5.
  const hebrews = [
    verse(1, [words("Muitas vezes e de muitos modos")]),
    verse(4, [
      words("tão superior aos anjos"),
      heading("ms", "I. O FILHO DE DEUS É SUPERIOR AOS ANJOS"),
      references("(1,5-2,18)"),
      heading("s2", "Prova escriturística"),
      references("(Sl 2,7)"),
    ]),
    verse(5, [words("Com efeito, a qual dos anjos")]),
  ]

  it("opens the next verse with a heading stacked on another", () => {
    // Both headings come after verse 4's words, so both open verse 5. The
    // second used to open verse 4, as if it headed the verse it follows.
    expect(sectionStartsIn(hebrews)).toEqual([5])
  })

  it("places the stacked heading's references on the passage it opens", () => {
    const placed = placeReferences(hebrews)

    expect(placed.map((block) => block.startsAt)).toEqual([5, 5])
    expect(placed[0].underMajorHeading).toBeTrue()
    expect(placed[1].underMajorHeading).toBeFalse()
  })

  it("still opens the verse it heads when nothing comes before it", () => {
    const chapter = [
      verse(1, [heading("s2", "Criação do mundo"), words("No princípio")]),
    ]

    expect(sectionStartsIn(chapter)).toEqual([1])
  })
})
