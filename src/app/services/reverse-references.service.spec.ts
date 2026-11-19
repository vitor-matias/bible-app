import { TestBed } from "@angular/core/testing"
import { createSpyObj, type SpyObj } from "../testing/spy-obj"
import {
  type BibleReference,
  BibleReferenceService,
} from "./bible-reference.service"
import { BookService } from "./book.service"
import { OfflineDataService } from "./offline-data.service"
import { ReverseReferencesService } from "./reverse-references.service"

const MATTHEW = {
  id: "mat",
  name: "Evangelho de São Mateus",
  shortName: "Mateus",
  abrv: "Mt",
  chapterCount: 28,
} as Book

const MARK = {
  id: "mrk",
  name: "Evangelho de São Marcos",
  shortName: "Marcos",
  abrv: "Mc",
  chapterCount: 16,
} as Book

const ABOUT = { id: "about", shortName: "Sobre", abrv: "Sobre" } as Book

function verse(number: number, references?: string): Verse {
  return {
    bookId: "mat",
    chapterNumber: 22,
    number,
    verseLabel: String(number),
    text: references
      ? [{ type: "references", text: references }]
      : [{ type: "text", text: "palavras" }],
  }
}

describe("ReverseReferencesService", () => {
  let service: ReverseReferencesService
  let offline: SpyObj<OfflineDataService>
  let bibleRef: SpyObj<BibleReferenceService>

  function configure(books: Book[]): void {
    TestBed.resetTestingModule()
    offline = createSpyObj<OfflineDataService>("OfflineDataService", [
      "getCachedBooksAsync",
    ])
    offline.getCachedBooksAsync.mockResolvedValue(books)

    bibleRef = createSpyObj<BibleReferenceService>("BibleReferenceService", [
      "extract",
    ])
    bibleRef.extract.mockReturnValue([])

    const bookService = createSpyObj<BookService>("BookService", [
      "findBook",
      "getUrlAbrv",
      "getChapterUrlSegment",
    ])
    bookService.findBook.mockImplementation((id: string) => {
      if (id === "mat" || id === "Mt") return MATTHEW
      if (id === "mrk" || id === "Mc") return MARK
      return ABOUT
    })
    bookService.getUrlAbrv.mockImplementation((book: Book) =>
      book.abrv.toLowerCase(),
    )
    bookService.getChapterUrlSegment.mockImplementation((chapter: number) =>
      String(chapter),
    )

    TestBed.configureTestingModule({
      providers: [
        ReverseReferencesService,
        { provide: OfflineDataService, useValue: offline },
        { provide: BibleReferenceService, useValue: bibleRef },
        { provide: BookService, useValue: bookService },
      ],
    })
    service = TestBed.inject(ReverseReferencesService)
  }

  it("gives up loading when the corpus cannot be read", async () => {
    configure([])
    offline.getCachedBooksAsync.mockRejectedValue(
      new Error("IndexedDB refused"),
    )

    // Resolves rather than rejecting: its caller awaits it and then reads
    // the state, and a rejection there left the panel saying "A procurar…"
    // for good.
    await expect(service.ensureIndex()).resolves.toBeUndefined()
    expect(service.state).toBe("unavailable")
  })

  it("tries again after a failed build", async () => {
    configure([])
    offline.getCachedBooksAsync.mockRejectedValue(
      new Error("IndexedDB refused"),
    )
    await service.ensureIndex()

    offline.getCachedBooksAsync.mockResolvedValue([])
    await service.ensureIndex()

    expect(offline.getCachedBooksAsync).toHaveBeenCalledTimes(2)
  })

  it("reports unavailable when the corpus has not been downloaded", async () => {
    configure([])

    await service.ensureIndex()

    // Not "nothing cites this verse" — the honest answer is that it cannot
    // be told yet.
    expect(service.state).toBe("unavailable")
    expect(service.incomingFor("mrk", 12, 31)).toEqual([])
  })

  it("finds the passage that cites a verse", async () => {
    bibleRefWith([
      { book: "mrk", chapter: 12, verses: [{ type: "single", verse: 31 }] },
    ])

    await service.ensureIndex()

    const incoming = service.incomingFor("mrk", 12, 31)
    expect(incoming.length).toBe(1)
    expect(incoming[0].label).toBe("Mateus 22,39")
    expect(incoming[0].link).toEqual(["/", "mt", "22"])
    expect(incoming[0].queryParams).toEqual({ verseStart: 39 })
  })

  it("cites from the passage a heading opens, not the verse that stores it", async () => {
    // The heading and its references arrive in the payload of the verse
    // before the passage: read off that verse, Mark 12,31 was cited by
    // "Mateus 22,33" — the last verse of the passage before — or by verse 0.
    const stored: Verse = {
      ...verse(33),
      text: [
        { type: "text", text: "E a multidão, ouvindo-o" },
        { type: "section", tag: "s1", text: "O mandamento do amor" },
        { type: "references", text: "Mc 12,31" },
      ],
    }
    configure([
      {
        ...MATTHEW,
        chapters: [{ bookId: "mat", number: 22, verses: [stored, verse(34)] }],
      } as Book,
    ])
    bibleRef.extract.mockReturnValue([
      {
        book: "mrk",
        chapter: 12,
        verses: [{ type: "single", verse: 31 }],
      } as BibleReference,
    ])

    await service.ensureIndex()

    const [incoming] = service.incomingFor("mrk", 12, 31)
    expect(incoming.label).toBe("Mateus 22,34")
    expect(incoming.queryParams).toEqual({ verseStart: 34 })
  })

  it("does not index the extent a division's heading opens with", async () => {
    // "(22,1-46; ver Mc 12,1-44)" under a major heading: the first range is
    // what the division covers, not a citation of itself.
    const stored: Verse = {
      ...verse(0),
      text: [
        { type: "section", tag: "ms", text: "EM JERUSALÉM" },
        { type: "references", text: "22,1-46; ver Mc 12,1-44" },
      ],
    }
    configure([
      {
        ...MATTHEW,
        chapters: [{ bookId: "mat", number: 22, verses: [stored, verse(1)] }],
      } as Book,
    ])
    bibleRef.extract.mockReturnValue([
      {
        book: "mat",
        chapter: 22,
        verses: [{ type: "range", start: 1, end: 46 }],
      } as BibleReference,
      {
        book: "mrk",
        chapter: 12,
        verses: [{ type: "range", start: 1, end: 44 }],
      } as BibleReference,
    ])

    await service.ensureIndex()

    expect(service.incomingFor("mat", 22, 10)).toEqual([])
    expect(service.incomingFor("mrk", 12, 10)[0].label).toBe("Mateus 22,1")
  })

  it("matches any verse inside a cited range", async () => {
    bibleRefWith([
      {
        book: "mrk",
        chapter: 12,
        verses: [{ type: "range", start: 28, end: 34 }],
      },
    ])

    await service.ensureIndex()

    expect(service.incomingFor("mrk", 12, 28).length).toBe(1)
    expect(service.incomingFor("mrk", 12, 31).length).toBe(1)
    expect(service.incomingFor("mrk", 12, 34).length).toBe(1)
    // Outside the range the citation does not apply.
    expect(service.incomingFor("mrk", 12, 35)).toEqual([])
  })

  it("matches any verse of a chapter cited whole", async () => {
    // "Mc 12" names no verse: it cites the chapter, so it is an answer to
    // whichever verse of that chapter the reader has chosen.
    bibleRefWith([{ book: "mrk", chapter: 12, verses: [] }])

    await service.ensureIndex()

    expect(service.incomingFor("mrk", 12, 1).length).toBe(1)
    expect(service.incomingFor("mrk", 12, 31).length).toBe(1)
    expect(service.incomingFor("mrk", 12, 44).length).toBe(1)
    // Still only that chapter.
    expect(service.incomingFor("mrk", 13, 1)).toEqual([])
  })

  it("matches every verse a citation lists, not only the first", async () => {
    // "Mc 12,28.31-33": a single verse and then a range, in one citation. Only
    // the first entry used to be indexed, so verse 32 found nothing.
    bibleRefWith([
      {
        book: "mrk",
        chapter: 12,
        verses: [
          { type: "single", verse: 28 },
          { type: "range", start: 31, end: 33 },
        ],
      },
    ])

    await service.ensureIndex()

    expect(service.incomingFor("mrk", 12, 28).length).toBe(1)
    expect(service.incomingFor("mrk", 12, 32).length).toBe(1)
    expect(service.incomingFor("mrk", 12, 33).length).toBe(1)
    // The gap between the entries is not cited.
    expect(service.incomingFor("mrk", 12, 30)).toEqual([])
  })

  it("matches every chapter of a run cited whole", async () => {
    bibleRefWith([{ book: "mrk", chapter: 12, endChapter: 14, verses: [] }])

    await service.ensureIndex()

    expect(service.incomingFor("mrk", 12, 20).length).toBe(1)
    expect(service.incomingFor("mrk", 13, 5).length).toBe(1)
    expect(service.incomingFor("mrk", 14, 72).length).toBe(1)
    expect(service.incomingFor("mrk", 15, 1)).toEqual([])
  })

  it("matches either side of a range that leaves its chapter", async () => {
    bibleRefWith([
      {
        book: "mrk",
        chapter: 12,
        verses: [],
        crossChapter: {
          type: "crossChapterRange",
          startChapter: 12,
          startVerse: 28,
          endChapter: 13,
          endVerse: 10,
        },
      },
    ])

    await service.ensureIndex()

    // From where it opens to the end of that chapter, and into the next as
    // far as it names.
    expect(service.incomingFor("mrk", 12, 28).length).toBe(1)
    expect(service.incomingFor("mrk", 12, 44).length).toBe(1)
    expect(service.incomingFor("mrk", 13, 10).length).toBe(1)
    expect(service.incomingFor("mrk", 12, 27)).toEqual([])
    expect(service.incomingFor("mrk", 13, 11)).toEqual([])
  })

  it("does not list a citation of an unresolvable book", async () => {
    bibleRefWith([{ book: "nonsense", chapter: 1, verses: [] }])

    await service.ensureIndex()

    expect(service.state).toBe("ready")
    expect(service.incomingFor("about", 1, 1)).toEqual([])
  })

  it("builds once, however many callers ask", async () => {
    bibleRefWith([{ book: "mrk", chapter: 12, verses: [] }])

    await Promise.all([
      service.ensureIndex(),
      service.ensureIndex(),
      service.ensureIndex(),
    ])
    await service.ensureIndex()

    expect(offline.getCachedBooksAsync).toHaveBeenCalledTimes(1)
  })

  describe("what a citation says about itself", () => {
    const words = "Amarás o teu próximo como a ti mesmo"
    const citing = (text: Verse["text"]): Book =>
      ({
        ...MATTHEW,
        chapters: [
          {
            bookId: "mat",
            number: 22,
            verses: [{ ...verse(39), text }],
          },
        ],
      }) as Book
    const cites = (target: string): BibleReference =>
      ({
        book: target,
        chapter: 12,
        verses: [{ type: "single", verse: 31 }],
        match: target,
        index: 0,
      }) as unknown as BibleReference

    it("quotes the start of the citing verse", async () => {
      configure([
        citing([
          { type: "text", text: words },
          { type: "references", text: "Mc 12,31" },
        ]),
      ])
      bibleRef.extract.mockReturnValue([cites("mrk")])

      await service.ensureIndex()

      expect(service.incomingFor("mrk", 12, 31)[0]).toMatchObject({
        source: "referência",
        excerpt: words,
        // Where it is, for opening it beside the reader's chapter.
        bookId: "mat",
        chapterNumber: 22,
      })
    })

    it("cuts a long verse at a word, not in the middle of one", async () => {
      const long = `${"palavra ".repeat(40)}fim`
      configure([
        citing([
          { type: "text", text: long },
          { type: "references", text: "Mc 12,31" },
        ]),
      ])
      bibleRef.extract.mockReturnValue([cites("mrk")])

      await service.ensureIndex()

      const { excerpt } = service.incomingFor("mrk", 12, 31)[0]
      expect(excerpt.endsWith("palavra…")).toBe(true)
      expect(excerpt.length).toBeLessThanOrEqual(141)
    })

    it("finds a verse cited only in a footnote, and says it is a footnote", async () => {
      configure([
        citing([
          { type: "text", text: words },
          { type: "footnote", text: "Ver Mc 12,31.", reference: "22,39" },
        ]),
      ])
      bibleRef.extract.mockImplementation((text: string) =>
        text.startsWith("Ver Mc") ? [cites("mrk")] : [],
      )

      await service.ensureIndex()

      const incoming = service.incomingFor("mrk", 12, 31)
      expect(incoming).toHaveLength(1)
      expect(incoming[0]).toMatchObject({
        source: "nota",
        label: "Mateus 22,39",
      })
    })

    it("lists a passage once when the cross references and a footnote both cite it", async () => {
      configure([
        citing([
          { type: "text", text: words },
          { type: "references", text: "Mc 12,31" },
          { type: "footnote", text: "Ver Mc 12,31.", reference: "22,39" },
        ]),
      ])
      bibleRef.extract.mockReturnValue([cites("mrk")])

      await service.ensureIndex()

      const incoming = service.incomingFor("mrk", 12, 31)
      expect(incoming).toHaveLength(1)
      expect(incoming[0].source).toBe("referência")
    })

    // The same passage cites the verse twice, in spans that differ: each is an
    // entry of its own in the index, and both cover the verse picked.
    describe("when one passage cites the verse in two different spans", () => {
      const spans = (text: string): BibleReference[] =>
        [
          {
            book: "mrk",
            chapter: 12,
            verses:
              text === "Mc 12,28-34"
                ? [{ type: "range", start: 28, end: 34 }]
                : [{ type: "single", verse: 31 }],
            match: text,
            index: 0,
          },
        ] as unknown as BibleReference[]

      it("lists it once, as a cross reference, wherever the note comes", async () => {
        for (const parts of [
          [
            { type: "references", text: "Mc 12,28-34" },
            { type: "footnote", text: "Mc 12,31", reference: "22,39" },
          ],
          // The note first: the order in the verse is not the claim's weight.
          [
            { type: "footnote", text: "Mc 12,31", reference: "22,39" },
            { type: "references", text: "Mc 12,28-34" },
          ],
        ] as Verse["text"][]) {
          configure([citing([{ type: "text", text: words }, ...parts])])
          bibleRef.extract.mockImplementation(spans)
          service.reset()

          await service.ensureIndex()

          const incoming = service.incomingFor("mrk", 12, 31)
          expect(incoming).toHaveLength(1)
          expect(incoming[0].source).toBe("referência")
        }
      })

      it("still says note, once, for a verse only the note's span covers", async () => {
        configure([
          citing([
            { type: "text", text: words },
            { type: "references", text: "Mc 12,31" },
            { type: "footnote", text: "Mc 12,28-34", reference: "22,39" },
          ]),
        ])
        bibleRef.extract.mockImplementation((text: string) =>
          spans(text === "Mc 12,31" ? "Mc 12,31" : "Mc 12,28-34"),
        )

        await service.ensureIndex()

        const incoming = service.incomingFor("mrk", 12, 30)
        expect(incoming).toHaveLength(1)
        expect(incoming[0].source).toBe("nota")
      })
    })
  })

  it("forgets what it knew when the text it was built from goes", async () => {
    bibleRefWith([
      { book: "mrk", chapter: 12, verses: [{ type: "single", verse: 31 }] },
    ])
    await service.ensureIndex()
    expect(service.state).toBe("ready")

    service.reset()

    expect(service.state).toBe("idle")
    expect(service.incomingFor("mrk", 12, 31)).toEqual([])
  })

  describe("a build that a reset overtakes", () => {
    const CITATION = [
      { book: "mrk", chapter: 12, verses: [{ type: "single", verse: 31 }] },
    ]

    /** The corpus, and a read of it that only finishes when the spec says. */
    async function slowReads() {
      bibleRefWith(CITATION)
      const corpus = await offline.getCachedBooksAsync()
      offline.getCachedBooksAsync.mockClear()
      const finish: Array<(books: Book[]) => void> = []
      const fail: Array<(error: Error) => void> = []
      offline.getCachedBooksAsync.mockImplementation(
        () =>
          new Promise<Book[]>((resolve, reject) => {
            finish.push(resolve)
            fail.push(reject)
          }),
      )
      return { corpus, finish, fail }
    }

    it("does not bring back an index of text that has been removed", async () => {
      const { corpus, finish } = await slowReads()
      const building = service.ensureIndex()
      expect(service.state).toBe("building")

      service.reset()
      finish[0](corpus)
      await building

      expect(service.state).toBe("idle")
      expect(service.incomingFor("mrk", 12, 31)).toEqual([])
    })

    it("does not call the index unavailable when its read fails after the reset", async () => {
      const { fail } = await slowReads()
      const building = service.ensureIndex()

      service.reset()
      fail[0](new Error("IndexedDB refused"))
      await building

      expect(service.state).toBe("idle")
    })

    it("leaves a newer build alone, and shared, when the old one ends", async () => {
      const { corpus, finish } = await slowReads()
      const stale = service.ensureIndex()
      service.reset()
      const fresh = service.ensureIndex()

      finish[0](corpus)
      await stale
      // The old build ended: it neither published nor cleared the new one, so
      // a caller now joins that one instead of starting a third read.
      expect(service.state).toBe("building")
      void service.ensureIndex()
      expect(offline.getCachedBooksAsync).toHaveBeenCalledTimes(2)

      finish[1](corpus)
      await fresh
      expect(service.state).toBe("ready")
      expect(service.incomingFor("mrk", 12, 31)).toHaveLength(1)
    })
  })

  /** Stubs a corpus of one chapter whose verse 39 prints the given refs. */
  function bibleRefWith(refs: unknown[]): void {
    configure([
      {
        ...MATTHEW,
        chapters: [
          {
            bookId: "mat",
            number: 22,
            verses: [verse(1), verse(39, "Mc 12,31")],
          },
        ],
      } as Book,
    ])
    bibleRef.extract.mockReturnValue(
      refs.map((ref) => ({
        match: "Mc 12,31",
        index: 0,
        ...(ref as object),
      })) as ReturnType<BibleReferenceService["extract"]>,
    )
  }
})
