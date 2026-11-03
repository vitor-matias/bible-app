import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of, ReplaySubject, throwError } from "rxjs"
import { createSpyObj, type SpyObj } from "../testing/spy-obj"
import { BibleApiService } from "./bible-api.service"
import { BibleReferenceService } from "./bible-reference.service"
import { BookService } from "./book.service"
import { NetworkService } from "./network.service"
import { OfflineSearchService } from "./offline-search.service"
import { SearchService } from "./search.service"

const MATTHEW = { id: "mat", abrv: "Mt", shortName: "Mateus" } as Book
const PSALMS = {
  id: "psa",
  abrv: "Sl",
  shortName: "Salmos",
} as Book
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
  let bookService: SpyObj<BookService>
  let network: { isOffline: boolean }
  let offline: SpyObj<OfflineSearchService>

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
    network = { isOffline: false }
    offline = createSpyObj<OfflineSearchService>("OfflineSearchService", [
      "search",
    ])
    const books = createSpyObj<BookService>(
      "BookService",
      ["findBook", "findTypedBook", "getUrlAbrv", "getChapterUrlSegment"],
      { books$: booksLoaded.asObservable() },
    )
    bookService = books
    books.findBook.mockReturnValue(MATTHEW)
    books.findTypedBook.mockReturnValue(undefined)
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
        { provide: NetworkService, useValue: network },
        { provide: OfflineSearchService, useValue: offline },
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
      label: "Mateus 22,37",
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
      label: "Introdução ao Pentateuco",
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
          { provide: NetworkService, useValue: network },
          { provide: OfflineSearchService, useValue: offline },
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

  describe("a psalm, whose number is not the same in the Mass", () => {
    beforeEach(() => {
      bookService.findTypedBook.mockImplementation((name: string) =>
        name === "Sl" ? PSALMS : undefined,
      )
      api.getVerse.mockReturnValue(of({} as Verse))
    })

    it("offers both psalms a bare number may mean, and opens neither unasked", async () => {
      references.destinationOf.mockReturnValue({ book: PSALMS, chapter: 94 })

      const outcome = await firstValueFrom(service.run("Sl 94"))

      expect(outcome).toEqual({
        kind: "psalmChoice",
        options: [
          {
            label: "Salmo 94 (93)",
            note: "nesta Bíblia",
            link: ["/", "sl", "94"],
          },
          {
            label: "Salmo 95 (94)",
            note: "como na Missa",
            link: ["/", "sl", "95"],
          },
        ],
      })
      expect(api.getVerse).not.toHaveBeenCalled()
    })

    it("keeps the verses a bare number came with, on both", async () => {
      references.destinationOf.mockReturnValue({
        book: PSALMS,
        chapter: 94,
        verseStart: 3,
      })

      const outcome = await firstValueFrom(service.run("Sl 94,3"))

      expect(outcome.kind === "psalmChoice" && outcome.options).toMatchObject([
        { queryParams: { verseStart: 3 } },
        { queryParams: { verseStart: 3 } },
      ])
    })

    it("takes the one psalm a leaflet names with both numbers", async () => {
      references.destinationOf.mockReturnValue({
        book: PSALMS,
        chapter: 95,
        verseStart: 1,
      })

      const outcome = await firstValueFrom(service.run("Sl 94 (95), 1-2"))

      // The edition's number for it is what the reference names.
      expect(references.destinationOf).toHaveBeenCalledWith("Sl 95,1-2")
      expect(outcome).toMatchObject({
        kind: "destination",
        label: "Salmo 95 (94),1",
        link: ["/", "sl", "95"],
      })
    })

    it("does not ask about a psalm that is the same in both numberings", async () => {
      references.destinationOf.mockReturnValue({ book: PSALMS, chapter: 9 })

      const outcome = await firstValueFrom(service.run("Sl 9"))

      expect(outcome.kind).toBe("destination")
    })
  })

  describe("what a hit says", () => {
    const hitFor = async (verse: Verse): Promise<string> => {
      api.search.mockReturnValue(
        of({ verses: [verse], total: 1, currentPage: 1, totalPages: 1 }),
      )
      const outcome = await firstValueFrom(service.run("amarás"))
      if (outcome.kind !== "results") throw new Error("expected results")
      return outcome.hits[0].highlightedSegments
        .map((segment) => segment.text)
        .join("")
    }

    it("reads the words of a verse of poetry", async () => {
      // The search page's own copy of this took prose only, so a verse of a
      // psalm — poetry from its first word — was listed with no text at all.
      const psalm = {
        bookId: "mat",
        chapterNumber: 1,
        number: 1,
        text: [
          { type: "quote", text: "​", identLevel: 1 },
          { type: "text", text: "Feliz o homem " },
          { type: "section", tag: "s1", text: "Um título" },
          { type: "quote", text: "que não segue o conselho", identLevel: 1 },
          { type: "footnote", text: "nota", reference: "1,1" },
        ],
      } as Verse

      expect(await hitFor(psalm)).toBe("Feliz o homem que não segue o conselho")
    })

    it("sets no space before the punctuation after a run of its own", async () => {
      // The edition prints "Senhor" as a run of its own, in small capitals:
      // joined with spaces, the comma after it came out as "Senhor , teu".
      const verse = {
        bookId: "mat",
        chapterNumber: 22,
        number: 37,
        text: [
          { type: "text", text: "Amarás o " },
          { type: "text", text: "Senhor" },
          { type: "text", text: ", teu Deus" },
        ],
      } as Verse

      expect(await hitFor(verse)).toBe("Amarás o Senhor, teu Deus")
    })

    it("marks the words typed, accents and case aside", async () => {
      api.search.mockReturnValue(
        of({
          verses: [
            {
              bookId: "mat",
              chapterNumber: 22,
              number: 37,
              text: [{ type: "text", text: "Amarás ao Senhor, teu Deus" }],
            } as Verse,
          ],
          total: 1,
          currentPage: 1,
          totalPages: 1,
        }),
      )

      const outcome = await firstValueFrom(service.run("AMARAS senhor"))

      if (outcome.kind !== "results") throw new Error("expected results")
      expect(
        outcome.hits[0].highlightedSegments
          .filter((segment) => segment.highlight)
          .map((segment) => segment.text),
      ).toEqual(["Amarás", "Senhor"])
    })
  })

  describe("with no connection", () => {
    const stored = (number: number): Verse =>
      ({
        bookId: "mat",
        chapterNumber: 22,
        number,
        text: [{ type: "text", text: `Amarás ${number}` }],
      }) as Verse

    beforeEach(() => {
      network.isOffline = true
    })

    it("looks for the words in the Bible kept on the device", async () => {
      offline.search.mockResolvedValue([stored(37), stored(38), stored(39)])

      const outcome = await firstValueFrom(service.run("amarás", 2))

      expect(api.search).not.toHaveBeenCalled()
      expect(offline.search).toHaveBeenCalledExactlyOnceWith("amarás")
      // A page of them, and the count of all.
      if (outcome.kind !== "results") throw new Error("expected results")
      expect(outcome.total).toBe(3)
      expect(outcome.hits.map((hit) => hit.number)).toEqual([37, 38])
    })

    it("says so when no Bible is kept there", async () => {
      offline.search.mockResolvedValue(null)

      expect(await firstValueFrom(service.run("amarás"))).toEqual({
        kind: "nothingStored",
      })
    })

    it("still answers a reference as somewhere to go", async () => {
      references.destinationOf.mockReturnValue({
        book: PENTATEUCH,
        chapter: 1,
      })

      const outcome = await firstValueFrom(service.run("Pentateuco"))

      expect(outcome.kind).toBe("destination")
      expect(offline.search).not.toHaveBeenCalled()
    })
  })
})
