import { TestBed } from "@angular/core/testing"
import { BibleReferenceService } from "./bible-reference.service"
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
      ? [{ type: "references", text: references, normalizedText: references }]
      : [{ type: "text", text: "palavras", normalizedText: "palavras" }],
  }
}

describe("ReverseReferencesService", () => {
  let service: ReverseReferencesService
  let offline: jasmine.SpyObj<OfflineDataService>
  let bibleRef: jasmine.SpyObj<BibleReferenceService>

  function configure(books: Book[]): void {
    TestBed.resetTestingModule()
    offline = jasmine.createSpyObj<OfflineDataService>("OfflineDataService", [
      "getCachedBooksAsync",
    ])
    offline.getCachedBooksAsync.and.resolveTo(books)

    bibleRef = jasmine.createSpyObj<BibleReferenceService>(
      "BibleReferenceService",
      ["extract"],
    )
    bibleRef.extract.and.returnValue([])

    const bookService = jasmine.createSpyObj<BookService>("BookService", [
      "findBook",
      "getUrlAbrv",
      "getChapterUrlSegment",
    ])
    bookService.findBook.and.callFake((id: string) => {
      if (id === "mat" || id === "Mt") return MATTHEW
      if (id === "mrk" || id === "Mc") return MARK
      return ABOUT
    })
    bookService.getUrlAbrv.and.callFake((book: Book) => book.abrv.toLowerCase())
    bookService.getChapterUrlSegment.and.callFake((chapter: number) =>
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
    bibleRef.extract.and.returnValue(
      refs.map((ref) => ({
        match: "Mc 12,31",
        index: 0,
        ...(ref as object),
      })) as ReturnType<BibleReferenceService["extract"]>,
    )
  }
})
