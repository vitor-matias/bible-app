import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of, ReplaySubject, throwError } from "rxjs"
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
  let api: jasmine.SpyObj<BibleApiService>
  let references: jasmine.SpyObj<BibleReferenceService>
  let booksLoaded: ReplaySubject<Book[]>

  beforeEach(() => {
    booksLoaded = new ReplaySubject<Book[]>(1)
    booksLoaded.next([MATTHEW])
    api = jasmine.createSpyObj<BibleApiService>("BibleApiService", [
      "getVerse",
      "search",
    ])
    references = jasmine.createSpyObj<BibleReferenceService>(
      "BibleReferenceService",
      ["destinationOf"],
    )
    references.destinationOf.and.returnValue(null)
    const books = jasmine.createSpyObj<BookService>(
      "BookService",
      ["findBook", "getUrlAbrv", "getChapterUrlSegment"],
      { books$: booksLoaded.asObservable() },
    )
    books.findBook.and.returnValue(MATTHEW)
    books.getUrlAbrv.and.callFake((book: Book) => book.abrv.toLowerCase())
    books.getChapterUrlSegment.and.callFake((chapter: number) =>
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
    references.destinationOf.and.returnValue({
      book: MATTHEW,
      chapter: 22,
      verseStart: 37,
    })
    api.getVerse.and.returnValue(of({} as Verse))

    const outcome = await firstValueFrom(service.run(" Mt 22,37 "))

    expect(api.getVerse).toHaveBeenCalledOnceWith("mat", 22, 37)
    expect(api.search).not.toHaveBeenCalled()
    expect(outcome).toEqual({
      kind: "destination",
      link: ["/", "mt", "22"],
      queryParams: { verseStart: 37 },
    })
  })

  it("answers a reference to a verse that is not there as missing", async () => {
    references.destinationOf.and.returnValue({ book: MATTHEW, chapter: 40 })
    api.getVerse.and.returnValue(throwError(() => ({ status: 404 })))

    expect(await firstValueFrom(service.run("Mt 40"))).toEqual({
      kind: "missing",
    })
  })

  it("leaves any other failure to whoever asked", async () => {
    references.destinationOf.and.returnValue({ book: MATTHEW, chapter: 22 })
    api.getVerse.and.returnValue(throwError(() => ({ status: 503 })))

    await expectAsync(firstValueFrom(service.run("Mt 22"))).toBeRejected()
  })

  it("opens a standalone introduction without asking for a verse of it", async () => {
    references.destinationOf.and.returnValue({ book: PENTATEUCH, chapter: 1 })

    const outcome = await firstValueFrom(service.run("Pentateuco"))

    expect(api.getVerse).not.toHaveBeenCalled()
    expect(outcome).toEqual({
      kind: "destination",
      link: ["/", "pentateuco", "intro"],
    })
  })

  it("searches the text for anything else, and readies what it finds", async () => {
    api.search.and.returnValue(
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

    expect(api.search).toHaveBeenCalledOnceWith("amarás", 1, 30)
    if (outcome.kind !== "results") return fail("expected results")
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
      const books = jasmine.createSpyObj<BookService>(
        "BookService",
        ["findBook", "getUrlAbrv", "getChapterUrlSegment"],
        { books$: booksLoaded.asObservable() },
      )
      books.findBook.and.returnValue(MATTHEW)
      books.getUrlAbrv.and.returnValue("mt")
      books.getChapterUrlSegment.and.returnValue("22")
      api.search.and.returnValue(of(found))
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
