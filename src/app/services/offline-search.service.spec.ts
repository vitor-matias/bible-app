import { TestBed } from "@angular/core/testing"
import { OfflineDataService } from "./offline-data.service"
import { OfflineSearchService } from "./offline-search.service"

describe("OfflineSearchService", () => {
  let stored: Book[]
  let service: OfflineSearchService

  const verse = (
    bookId: string,
    chapterNumber: number,
    number: number,
    text: string,
  ) =>
    ({
      bookId,
      chapterNumber,
      number,
      text: [{ type: "text", text }],
    }) as Verse
  const book = (id: string, chapters: Verse[][]) =>
    ({
      id,
      name: id,
      shortName: id,
      abrv: id,
      chapterCount: chapters.length,
      chapters: chapters.map((verses, index) => ({
        bookId: id,
        number: index + 1,
        verses,
      })),
    }) as Book

  beforeEach(() => {
    // As the API lists them: Sirach after the New Testament.
    stored = [
      book("jhn", [[verse("jhn", 1, 5, "A Luz brilhou nas trevas,")]]),
      book("gen", [
        [
          verse("gen", 1, 0, "A CRIAÇÃO"),
          verse("gen", 1, 3, "Deus disse: «Faça-se a luz.»"),
          verse("gen", 1, 4, "Deus viu que a luz era boa"),
        ],
      ]),
      book("sir", [[verse("sir", 1, 1, "A luz da sabedoria vem do Senhor")]]),
      book("geral", []),
    ]
    TestBed.configureTestingModule({
      providers: [
        {
          provide: OfflineDataService,
          useValue: { getCachedBooksAsync: async () => stored },
        },
      ],
    })
    service = TestBed.inject(OfflineSearchService)
  })

  const found = async (query: string) =>
    (await service.search(query))?.map(
      (match) => `${match.bookId} ${match.chapterNumber},${match.number}`,
    )

  // The API lists Sirach after the New Testament; the canon among the wisdom books.
  it("finds the verses with the words, in the order of the Bible", async () => {
    expect(await found("luz")).toEqual([
      "gen 1,3",
      "gen 1,4",
      "sir 1,1",
      "jhn 1,5",
    ])
  })

  it("needs every word, accents and case aside", async () => {
    expect(await found("LUZ boa")).toEqual(["gen 1,4"])
    expect(await found("criação")).toEqual([])
    expect(await found("sabedória")).toEqual(["sir 1,1"])
  })

  it("searches again once the stored Bible changes", async () => {
    await found("luz")
    stored = [
      ...stored,
      book("mat", [[verse("mat", 5, 14, "Vós sois a luz do mundo.")]]),
    ]
    expect(await found("luz mundo")).toEqual(["mat 5,14"])
  })

  it("puts the verses with the words together first", async () => {
    stored = [
      book("gen", [[verse("gen", 1, 31, "o nosso pai está velho")]]),
      book("mat", [[verse("mat", 6, 9, "Pai nosso, que estás no Céu")]]),
    ]
    expect(await found("pai nosso")).toEqual(["mat 6,9", "gen 1,31"])
  })

  it("finds the words a query word begins", async () => {
    stored = [
      book("gen", [
        [
          verse("gen", 1, 1, "as luzes do céu"),
          verse("gen", 1, 2, "a lua reluz"),
        ],
      ]),
    ]
    expect(await found("luz")).toEqual(["gen 1,1"])
  })

  // This edition writes "Pai-nosso".
  it("takes a hyphen for a space", async () => {
    stored = [
      book("gen", [[verse("gen", 1, 31, "o nosso pai está velho")]]),
      book("mat", [[verse("mat", 6, 9, "‘Pai-nosso, que estás no Céu,")]]),
    ]
    expect(await found("pai nosso")).toEqual(["mat 6,9", "gen 1,31"])
  })

  it("finds nothing for a query without words", async () => {
    expect(await found(" ; ")).toEqual([])
  })

  it("says when no Bible is stored", async () => {
    stored = [book("geral", [])]
    expect(await service.search("luz")).toBeNull()
  })
})
