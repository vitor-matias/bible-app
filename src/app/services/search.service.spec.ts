import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of, ReplaySubject, throwError } from "rxjs"
import { createSpyObj, type SpyObj } from "../testing/spy-obj"
import { BibleApiService } from "./bible-api.service"
import { BibleReferenceService } from "./bible-reference.service"
import { BookService } from "./book.service"
import { SearchService } from "./search.service"

const MATTHEW = { id: "mat", abrv: "Mt", shortName: "Mateus" } as Book
const PENTATEUCH = {
  id: "pentateuco",
  abrv: "pentateuco",
  shortName: "Introdução ao Pentateuco",
  introSlug: "pentateuco",
} as Book

describe("SearchService", () => {
  let service: SearchService
  let api: SpyObj<BibleApiService>
  let references: SpyObj<BibleReferenceService>
  let booksLoaded: ReplaySubject<Book[]>

  beforeEach(() => {
    booksLoaded = new ReplaySubject<Book[]>(1)
    booksLoaded.next([MATTHEW])
    api = createSpyObj<BibleApiService>("BibleApiService", [
      "getVerse",
      "search",
    ])
    references = createSpyObj<BibleReferenceService>("BibleReferenceService", [
      "destinationOf",
    ])
    references.destinationOf.mockReturnValue(null)
    const books = createSpyObj<BookService>(
      "BookService",
      ["findBook", "getUrlAbrv", "getChapterUrlSegment"],
      { books$: booksLoaded.asObservable() },
    )
    books.findBook.mockReturnValue(MATTHEW)
    books.getUrlAbrv.mockImplementation((book: Book) => book.abrv.toLowerCase())
    books.getChapterUrlSegment.mockImplementation((chapter: number) =>
      String(chapter),
    )

    TestBed.configureTestingModule({
      providers: [
        SearchService,
        { provide: BibleApiService, useValue: api },
        { provide: BibleReferenceService, useValue: references },
        { provide: BookService, useValue: books },
      ],
    })
    service = TestBed.inject(SearchService)
  })

  it("answers a reference with where to go, once it knows it is there", async () => {
    references.destinationOf.mockReturnValue({
      book: MATTHEW,
      chapter: 22,
      verseStart: 37,
    })
    api.getVerse.mockReturnValue(of({} as Verse))

    const outcome = await firstValueFrom(service.run(" Mt 22,37 "))

    expect(api.getVerse).toHaveBeenCalledExactlyOnceWith("mat", 22, 37)
    expect(api.search).not.toHaveBeenCalled()
    expect(outcome).toEqual({
      kind: "destination",
      link: ["/", "mt", "22"],
      queryParams: { verseStart: 37 },
    })
  })

  it("answers a reference to a verse that is not there as missing", async () => {
    references.destinationOf.mockReturnValue({ book: MATTHEW, chapter: 40 })
    api.getVerse.mockReturnValue(throwError(() => ({ status: 404 })))

    expect(await firstValueFrom(service.run("Mt 40"))).toEqual({
      kind: "missing",
    })
  })

  it("leaves any other failure to whoever asked", async () => {
    references.destinationOf.mockReturnValue({ book: MATTHEW, chapter: 22 })
    api.getVerse.mockReturnValue(throwError(() => ({ status: 503 })))

    await expect(firstValueFrom(service.run("Mt 22"))).rejects.toMatchObject({
      status: 503,
    })
  })

  it("opens a standalone introduction without asking for a verse of it", async () => {
    references.destinationOf.mockReturnValue({ book: PENTATEUCH, chapter: 1 })

    const outcome = await firstValueFrom(service.run("Pentateuco"))

    expect(api.getVerse).not.toHaveBeenCalled()
    expect(outcome).toEqual({
      kind: "destination",
      link: ["/", "pentateuco", "intro"],
    })
  })

  it("searches the text for anything else, and readies what it finds", async () => {
    api.search.mockReturnValue(
      of({
        verses: [
          {
            bookId: "mat",
            chapterNumber: 22,
            number: 37,
            verseLabel: "37",
            text: [{ type: "text", text: "Amarás ao Senhor, teu Deus" }],
          },
        ],
        total: 12,
        currentPage: 1,
        totalPages: 1,
      }),
    )

    const outcome = await firstValueFrom(service.run("amarás", 30))

    expect(api.search).toHaveBeenCalledExactlyOnceWith("amarás", 1, 30)
    if (outcome.kind !== "results") throw new Error("expected results")
    expect(outcome.total).toBe(12)
    const [hit] = outcome.hits
    expect(hit.reference).toBe("Mateus 22,37")
    expect(hit.link).toEqual(["/", "mt", "22"])
    expect(hit.queryParams).toEqual({ verseStart: 37 })
    expect(
      hit.highlightedSegments.find((segment) => segment.highlight)?.text,
    ).toBe("Amarás")
  })

  describe("when results outrun the book list", () => {
    const found = {
      verses: [
        {
          bookId: "mat",
          chapterNumber: 22,
          number: 37,
          verseLabel: "37",
          text: [{ type: "text", text: "Amarás" }],
        } as Verse,
      ],
      total: 1,
      currentPage: 1,
      totalPages: 1,
    }

    it("waits for it, so a verse is not listed under the About page", () => {
      // A search shared into the app runs as the app starts.
      booksLoaded = new ReplaySubject<Book[]>(1)
      TestBed.resetTestingModule()
      const books = createSpyObj<BookService>(
        "BookService",
        ["findBook", "getUrlAbrv", "getChapterUrlSegment"],
        { books$: booksLoaded.asObservable() },
      )
      books.findBook.mockReturnValue(MATTHEW)
      books.getUrlAbrv.mockReturnValue("mt")
      books.getChapterUrlSegment.mockReturnValue("22")
      api.search.mockReturnValue(of(found))
      TestBed.configureTestingModule({
        providers: [
          SearchService,
          { provide: BibleApiService, useValue: api },
          { provide: BibleReferenceService, useValue: references },
          { provide: BookService, useValue: books },
        ],
      })
      let listed = 0
      TestBed.inject(SearchService)
        .run("amarás")
        .subscribe(() => listed++)

      expect(listed).toBe(0)
      booksLoaded.next([MATTHEW])
      expect(listed).toBe(1)
    })
  })

  it("reads the words of a verse of poetry", () => {
    // The search page's own copy of this took prose only, so a verse of a
    // psalm — poetry from its first word — was listed with no text at all.
    const psalm = {
      text: [
        { type: "quote", text: "​", identLevel: 1 },
        { type: "text", text: "Feliz o homem " },
        { type: "section", tag: "s1", text: "Um título" },
        { type: "quote", text: "que não segue o conselho", identLevel: 1 },
        { type: "footnote", text: "nota", reference: "1,1" },
      ],
    } as Verse

    expect(SearchService.wordsOf(psalm)).toBe(
      "Feliz o homem que não segue o conselho",
    )
  })
})
