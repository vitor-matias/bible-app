import { HttpErrorResponse, HttpHeaders } from "@angular/common/http"
import {
  HttpClientTestingModule,
  HttpTestingController,
  type TestRequest,
} from "@angular/common/http/testing"
import { ApplicationRef } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, Observable, of, TimeoutError } from "rxjs"
import { createSpyObj, type SpyObj } from "../testing/spy-obj"
import { AnalyticsService } from "./analytics.service"
import {
  BibleApiService,
  createApiResilience,
  createServerBooksCache,
  describeBookListFailure,
  REQUEST_TIMEOUT_MS,
} from "./bible-api.service"
import { NetworkService } from "./network.service"
import { OfflineDataService } from "./offline-data.service"

describe("BibleApiService", () => {
  let service: BibleApiService
  let httpMock: HttpTestingController
  let offlineDataServiceSpy: SpyObj<OfflineDataService>
  let networkServiceStub: {
    isOffline: boolean
  }
  let analyticsSpy: SpyObj<AnalyticsService>

  beforeEach(() => {
    analyticsSpy = createSpyObj("AnalyticsService", ["track"])
    analyticsSpy.track.mockResolvedValue(undefined)
    const spy = createSpyObj("OfflineDataService", [
      "getCachedChapterAsync",
      "getCachedBooksAsync",
      "getCachedBookAsync",
      "getCachedVerseAsync",
      "getCachedGroupIntroSummariesAsync",
      "getCachedGroupIntroAsync",
      "areGroupIntrosCached",
    ])
    networkServiceStub = { isOffline: false }

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        BibleApiService,
        { provide: OfflineDataService, useValue: spy },
        { provide: NetworkService, useValue: networkServiceStub },
        { provide: AnalyticsService, useValue: analyticsSpy },
      ],
    })

    service = TestBed.inject(BibleApiService)
    httpMock = TestBed.inject(HttpTestingController)
    offlineDataServiceSpy = TestBed.inject(
      OfflineDataService,
    ) as SpyObj<OfflineDataService>

    // Mock navigator.onLine to be true
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
  })

  describe("request timeout", () => {
    const failureOf = async (source: Observable<unknown>, url: string) => {
      vi.useFakeTimers()
      let failure: unknown
      source.subscribe({
        error: (error) => {
          failure = error
        },
      })
      await vi.advanceTimersByTimeAsync(0)
      const stalled = httpMock.expectOne(url)
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1)
      expect(failure).toBeUndefined()
      await vi.advanceTimersByTimeAsync(1)
      expect(stalled.cancelled).toBe(true)
      return failure
    }

    it("fails a chapter that never answers", async () => {
      offlineDataServiceSpy.getCachedChapterAsync.mockResolvedValue(undefined)

      expect(
        await failureOf(service.getChapter("gen", 1), "v1/gen/1"),
      ).toBeInstanceOf(TimeoutError)
    })

    it("fails a search that never answers", async () => {
      expect(
        await failureOf(
          service.search("amor"),
          "v1/search?text=amor&page=1&limit=50&semantic=true",
        ),
      ).toBeInstanceOf(TimeoutError)
    })

    it("fails a verse that never answers", async () => {
      offlineDataServiceSpy.getCachedVerseAsync.mockResolvedValue(undefined)

      expect(
        await failureOf(service.getVerse("gen", 1, 1), "v1/gen/1/1"),
      ).toBeInstanceOf(TimeoutError)
    })

    it("fails an introduction that never answers", async () => {
      offlineDataServiceSpy.getCachedGroupIntroAsync.mockResolvedValue(
        undefined,
      )

      expect(
        await failureOf(service.getIntro("pentateuco"), "v1/intros/pentateuco"),
      ).toBeInstanceOf(TimeoutError)
    })
  })

  describe("getChapter", () => {
    const book = "gen"
    const chapterNum = 1
    const mockChapter = {
      bookId: book,
      number: chapterNum,
      verses: [
        {
          bookId: book,
          chapterNumber: chapterNum,
          number: 1,
          verseLabel: "1",
          text: [
            {
              type: "text",
              text: "In the beginning...",
            },
          ],
        },
      ],
    } as Chapter

    it("should return cached chapter when it contains verses", async () => {
      offlineDataServiceSpy.getCachedChapterAsync.mockResolvedValue(mockChapter)

      const result = await firstValueFrom(service.getChapter(book, chapterNum))
      expect(result).toEqual(mockChapter)
      httpMock.expectNone(`v1/${book}/${chapterNum}`)
    })

    // The prerender serializes a page once the app is stable: from the call to
    // the answer, nothing but this keeps it so (the cache lookup is a promise).
    it("keeps the app unstable from the call until the chapter arrives", async () => {
      offlineDataServiceSpy.getCachedChapterAsync.mockResolvedValue(undefined)
      const isStable = () =>
        firstValueFrom(TestBed.inject(ApplicationRef).isStable)

      const chapterPromise = firstValueFrom(
        service.getChapter(book, chapterNum),
      )
      expect(await isStable()).toBe(false)

      await Promise.resolve()
      await Promise.resolve()
      httpMock.expectOne(`v1/${book}/${chapterNum}`).flush(mockChapter)
      await chapterPromise
      // Settles only once the task has been released.
      await TestBed.inject(ApplicationRef).whenStable()
    })

    it("lets go of the app when the chapter fails", async () => {
      offlineDataServiceSpy.getCachedChapterAsync.mockResolvedValue(undefined)

      const chapter = firstValueFrom(service.getChapter(book, chapterNum))
      await Promise.resolve()
      await Promise.resolve()
      httpMock
        .expectOne(`v1/${book}/${chapterNum}`)
        .error(new ProgressEvent("error"))

      await expect(chapter).rejects.toThrow()
      await TestBed.inject(ApplicationRef).whenStable()
    })

    // In a browser tab IndexedDB is empty, but the service worker may have
    // the chapter: only the request can tell.
    it("asks the network for an uncached chapter while offline", async () => {
      offlineDataServiceSpy.getCachedChapterAsync.mockResolvedValue(undefined)
      networkServiceStub.isOffline = true

      const chapter = firstValueFrom(service.getChapter(book, chapterNum))
      await Promise.resolve()
      await Promise.resolve()
      httpMock.expectOne(`v1/${book}/${chapterNum}`).flush(mockChapter)

      expect(await chapter).toEqual(mockChapter)
    })

    it("should fetch from server when cache returns undefined", async () => {
      offlineDataServiceSpy.getCachedChapterAsync.mockResolvedValue(undefined)

      const chapterPromise = firstValueFrom(
        service.getChapter(book, chapterNum),
      )

      // Wait for the cache check microtask to complete
      await Promise.resolve()
      await Promise.resolve()

      const req = httpMock.expectOne(`v1/${book}/${chapterNum}`)
      expect(req.request.method).toBe("GET")
      req.flush(mockChapter)

      const result = await chapterPromise
      expect(result).toEqual(mockChapter)
    })

    // An empty 200 parses as null, which the reader showed as a blank page.
    it("fails on a response that is not a chapter", async () => {
      offlineDataServiceSpy.getCachedChapterAsync.mockResolvedValue(undefined)

      const chapterPromise = firstValueFrom(
        service.getChapter(book, chapterNum),
      )
      await Promise.resolve()
      await Promise.resolve()
      httpMock.expectOne(`v1/${book}/${chapterNum}`).flush(null)

      await expect(chapterPromise).rejects.toThrow()
    })

    it("should fetch from server when cached chapter has no verses array", async () => {
      const hollowChapter = { bookId: book, number: chapterNum } as Chapter
      offlineDataServiceSpy.getCachedChapterAsync.mockResolvedValue(
        hollowChapter,
      )

      const chapterPromise = firstValueFrom(
        service.getChapter(book, chapterNum),
      )

      // Wait for the cache check microtask to complete
      await Promise.resolve()
      await Promise.resolve()

      const req = httpMock.expectOne(`v1/${book}/${chapterNum}`)
      req.flush(mockChapter)

      const result = await chapterPromise
      expect(result).toEqual(mockChapter)
    })

    it("should fetch from server when cached chapter has empty verses array", async () => {
      const emptyChapter = {
        bookId: book,
        number: chapterNum,
        verses: [],
      } as Chapter
      offlineDataServiceSpy.getCachedChapterAsync.mockResolvedValue(
        emptyChapter,
      )

      const chapterPromise = firstValueFrom(
        service.getChapter(book, chapterNum),
      )

      // Wait for the cache check microtask to complete
      await Promise.resolve()
      await Promise.resolve()

      const req = httpMock.expectOne(`v1/${book}/${chapterNum}`)
      req.flush(mockChapter)

      const result = await chapterPromise
      expect(result).toEqual(mockChapter)
    })

    it("should share a single request for the same chapter", async () => {
      offlineDataServiceSpy.getCachedChapterAsync.mockResolvedValue(undefined)

      const firstChapterPromise = firstValueFrom(service.getChapter(book, 1))
      const secondChapterPromise = firstValueFrom(service.getChapter(book, 1))

      await Promise.resolve()
      await Promise.resolve()

      const req = httpMock.expectOne(`v1/${book}/1`)
      req.flush(mockChapter)

      expect(await firstChapterPromise).toEqual(mockChapter)
      expect(await secondChapterPromise).toEqual(mockChapter)
    })

    it("should keep concurrent chapter requests isolated by book and chapter", async () => {
      const otherChapter = {
        bookId: "exo",
        number: 2,
        verses: [
          {
            bookId: "exo",
            chapterNumber: 2,
            number: 1,
            verseLabel: "1",
            text: [
              {
                type: "text",
                text: "Now these are the names...",
              },
            ],
          },
        ],
      } as Chapter

      offlineDataServiceSpy.getCachedChapterAsync.mockResolvedValue(undefined)

      const firstChapterPromise = firstValueFrom(service.getChapter(book, 1))
      const secondChapterPromise = firstValueFrom(service.getChapter("exo", 2))

      await Promise.resolve()
      await Promise.resolve()

      const firstReq = httpMock.expectOne(`v1/${book}/1`)
      const secondReq = httpMock.expectOne("v1/exo/2")

      secondReq.flush(otherChapter)
      firstReq.flush(mockChapter)

      expect(await firstChapterPromise).toEqual(mockChapter)
      expect(await secondChapterPromise).toEqual(otherChapter)
    })
  })

  describe("getAvailableBooks", () => {
    it("should return cached books before using the network", async () => {
      const cachedBooks = [
        {
          id: "gen",
          name: "Genesis",
          shortName: "Genesis",
          abrv: "Gn",
          chapterCount: 50,
        },
      ] as Book[]
      offlineDataServiceSpy.getCachedBooksAsync.mockResolvedValue(cachedBooks)

      const result = await firstValueFrom(service.getAvailableBooks())

      expect(result).toEqual(cachedBooks)
      httpMock.expectNone("v1/books")
    })

    // A browser tab never preloads IndexedDB; its service worker may still
    // have the list.
    it("asks the network for the books while offline with none cached", async () => {
      offlineDataServiceSpy.getCachedBooksAsync.mockResolvedValue([])
      networkServiceStub.isOffline = true
      const remoteBooks = [{ id: "gen", chapterCount: 50 }] as Book[]

      const books = firstValueFrom(service.getAvailableBooks())
      await Promise.resolve()
      await Promise.resolve()
      httpMock.expectOne("v1/books").flush(remoteBooks)

      expect(await books).toEqual(remoteBooks)
    })

    it("should exclude cached group-intro pseudo-books from the available books", async () => {
      const realBook = {
        id: "gen",
        name: "Genesis",
        shortName: "Genesis",
        abrv: "Gn",
        chapterCount: 50,
      } as Book
      const introBook = {
        id: "pentateuco",
        name: "Pentateuco",
        shortName: "Pentateuco",
        abrv: "pentateuco",
        chapterCount: 0,
        introSlug: "pentateuco",
        introduction: [],
      } as Book
      offlineDataServiceSpy.getCachedBooksAsync.mockResolvedValue([
        realBook,
        introBook,
      ])

      const result = await firstValueFrom(service.getAvailableBooks())

      // BookService builds its own synthetic entry for every standalone
      // introduction from getIntros() — leaking the cached pseudo-book
      // through here would duplicate it.
      expect(result).toEqual([realBook])
      httpMock.expectNone("v1/books")
    })

    it("asks the network while offline when only group-intro pseudo-books are cached", async () => {
      const introBook = {
        id: "pentateuco",
        name: "Pentateuco",
        shortName: "Pentateuco",
        abrv: "pentateuco",
        chapterCount: 0,
        introSlug: "pentateuco",
        introduction: [],
      } as Book
      offlineDataServiceSpy.getCachedBooksAsync.mockResolvedValue([introBook])
      networkServiceStub.isOffline = true

      const books = firstValueFrom(service.getAvailableBooks())
      await Promise.resolve()
      await Promise.resolve()
      httpMock.expectOne("v1/books").error(new ProgressEvent("error"))

      await expect(books).rejects.toThrow()
    })

    it("should fetch books from the server and cache them in memory", async () => {
      const remoteBooks = [
        {
          id: "exo",
          name: "Exodus",
          shortName: "Exodus",
          abrv: "Ex",
          chapterCount: 40,
        },
      ] as Book[]
      offlineDataServiceSpy.getCachedBooksAsync.mockResolvedValue([])

      const booksPromise = firstValueFrom(service.getAvailableBooks())

      await Promise.resolve()
      await Promise.resolve()

      const req = httpMock.expectOne("v1/books")
      req.flush(remoteBooks)

      expect(await booksPromise).toEqual(remoteBooks)
      expect(service.books).toEqual(remoteBooks)
    })

    // A first launch must end on the reader's retry screen, never stuck or
    // broken, whatever happens to the request.
    describe("when the request goes wrong", () => {
      const remoteBooks = [
        {
          id: "exo",
          name: "Exodus",
          shortName: "Exodus",
          abrv: "Ex",
          chapterCount: 40,
        },
      ] as Book[]

      beforeEach(() => {
        offlineDataServiceSpy.getCachedBooksAsync.mockResolvedValue([])
      })

      // A connection that opened but never answered left the reader empty,
      // with no retry, until iOS gave up on it.
      it("fails a stalled request in time, and a retry asks again", async () => {
        vi.useFakeTimers()
        let failure: unknown
        service.getAvailableBooks().subscribe({
          error: (error) => {
            failure = error
          },
        })
        await vi.advanceTimersByTimeAsync(0)
        const stalled = httpMock.expectOne("v1/books")

        await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)

        expect(failure).toBeInstanceOf(TimeoutError)
        expect(stalled.cancelled).toBe(true)
        expect(analyticsSpy.track).toHaveBeenCalledTimes(1)
        expect(analyticsSpy.track).toHaveBeenCalledWith("books_load_failed", {
          reason: "timeout",
        })
        let books: Book[] | undefined
        service.getAvailableBooks().subscribe((result) => {
          books = result
        })
        await vi.advanceTimersByTimeAsync(0)
        httpMock.expectOne("v1/books").flush(remoteBooks)
        expect(books).toEqual(remoteBooks)
        // The retry that worked reports nothing.
        expect(analyticsSpy.track).toHaveBeenCalledTimes(1)
      })

      const failures: [
        string,
        (request: TestRequest) => void,
        Record<string, string | number>,
      ][] = [
        [
          "a download the network cut off",
          (request) => request.error(new ProgressEvent("error")),
          { reason: "network" },
        ],
        // In the app HttpClient rejects a body that stops mid-JSON before
        // this point; should one arrive as text, it must fail the same way.
        [
          "a truncated JSON body",
          (request) => request.flush('[{"id":"exo","name":"Exo'),
          { reason: "not_a_list" },
        ],
        [
          "a body that isn't the list",
          (request) => request.flush({ error: "Bad gateway" }),
          { reason: "not_a_list" },
        ],
        [
          "a proxy's error page",
          (request) =>
            request.flush("<html><h1>502 Bad Gateway</h1></html>", {
              status: 502,
              statusText: "Bad Gateway",
              headers: { "content-type": "text/html; charset=utf-8" },
            }),
          { reason: "http_error", status: 502, contentType: "text/html" },
        ],
      ]
      for (const [what, fail, event] of failures) {
        it(`fails on ${what}, keeps nothing, reports it, and a retry asks again`, async () => {
          const first = firstValueFrom(service.getAvailableBooks())
          await Promise.resolve()
          await Promise.resolve()
          fail(httpMock.expectOne("v1/books"))

          await expect(first).rejects.toThrow()
          expect(service.books).toEqual([])
          expect(analyticsSpy.track).toHaveBeenCalledTimes(1)
          expect(analyticsSpy.track).toHaveBeenCalledWith(
            "books_load_failed",
            event,
          )

          const retry = firstValueFrom(service.getAvailableBooks())
          await Promise.resolve()
          await Promise.resolve()
          httpMock.expectOne("v1/books").flush(remoteBooks)
          expect(await retry).toEqual(remoteBooks)
          expect(analyticsSpy.track).toHaveBeenCalledTimes(1)
        })
      }
    })

    describe("describeBookListFailure", () => {
      // What HttpClient raises for a 200 that isn't JSON: a Wi-Fi login page,
      // or JSON cut short. The testing backend never parses, so it's built here.
      it("names an HTML page in place of the list", () => {
        const error = new HttpErrorResponse({
          status: 200,
          statusText: "OK",
          headers: new HttpHeaders({ "content-type": "text/html" }),
          error: {
            error: new SyntaxError("Unexpected token '<'"),
            text: "<!DOCTYPE html><title>Hotel Wi-Fi</title>",
          },
        })

        expect(describeBookListFailure(error)).toEqual({
          reason: "not_json",
          status: 200,
          contentType: "text/html",
        })
      })

      it("says other for anything else", () => {
        expect(describeBookListFailure(new Error("?"))).toEqual({
          reason: "other",
        })
      })
    })
  })

  describe("getVerse", () => {
    it("should return a cached verse when available", async () => {
      const cachedVerse = {
        bookId: "gen",
        chapterNumber: 1,
        number: 1,
        verseLabel: "1",
        text: [
          {
            type: "text",
            text: "In the beginning...",
          },
        ],
      } as Verse
      offlineDataServiceSpy.getCachedVerseAsync.mockResolvedValue(cachedVerse)

      const result = await firstValueFrom(service.getVerse("gen", 1, 1))

      expect(result).toEqual(cachedVerse)
      httpMock.expectNone("v1/gen/1/1")
    })

    it("asks the network for an uncached verse while offline", async () => {
      offlineDataServiceSpy.getCachedVerseAsync.mockResolvedValue(undefined)
      networkServiceStub.isOffline = true

      const verse = firstValueFrom(service.getVerse("gen", 1, 1))
      await Promise.resolve()
      await Promise.resolve()
      httpMock.expectOne("v1/gen/1/1").error(new ProgressEvent("error"))

      await expect(verse).rejects.toThrow()
    })
  })

  describe("introductions", () => {
    beforeEach(() => {
      offlineDataServiceSpy.getCachedGroupIntroSummariesAsync.mockResolvedValue(
        [],
      )
      offlineDataServiceSpy.getCachedGroupIntroAsync.mockResolvedValue(
        undefined,
      )
    })

    it("requests the listing and one body through the resilience wrapper", async () => {
      // The wrapper is a pass-through in the browser; on the server it adds
      // the timeout and backoff that keep a prerender build from shipping
      // pages with no introductions after one transient failure. The cache
      // check ahead of the request is itself async, so the request only
      // appears after a microtask tick.
      const intros = [{ slug: "pentateuco", name: "PENTATEUCO" }]
      const introsPromise = firstValueFrom(service.getIntros())
      await Promise.resolve()
      await Promise.resolve()

      httpMock.expectOne("v1/intros").flush(intros)
      expect(await introsPromise).toEqual(intros as IntroSummary[])

      const introPromise = firstValueFrom(service.getIntro("pentateuco"))
      await Promise.resolve()
      await Promise.resolve()

      httpMock.expectOne("v1/intros/pentateuco").flush({
        slug: "pentateuco",
        name: "PENTATEUCO",
        introduction: [],
      })
      expect((await introPromise).slug).toBe("pentateuco")
    })

    it("returns the cached listing without hitting the network", async () => {
      const cachedIntros = [{ slug: "pentateuco", name: "Pentateuco" }]
      offlineDataServiceSpy.getCachedGroupIntroSummariesAsync.mockResolvedValue(
        cachedIntros,
      )
      offlineDataServiceSpy.areGroupIntrosCached.mockReturnValue(true)

      const result = await firstValueFrom(service.getIntros())

      expect(result).toEqual(cachedIntros)
      httpMock.expectNone("v1/intros")
    })

    it("asks the network past a partial cache, keeping it as the fallback", async () => {
      // One slug failing during preload leaves the cache short. Served as the
      // listing, the missing introduction would vanish for the whole session.
      const partial = [{ slug: "pentateuco", name: "Pentateuco" }]
      const full = [...partial, { slug: "samuel", name: "Samuel" }]
      offlineDataServiceSpy.getCachedGroupIntroSummariesAsync.mockResolvedValue(
        partial,
      )
      offlineDataServiceSpy.areGroupIntrosCached.mockReturnValue(false)

      const online = firstValueFrom(service.getIntros())
      await Promise.resolve()
      await Promise.resolve()
      httpMock.expectOne("v1/intros").flush(full)
      expect(await online).toEqual(full)

      const failing = firstValueFrom(service.getIntros())
      await Promise.resolve()
      await Promise.resolve()
      httpMock
        .expectOne("v1/intros")
        .flush("down", { status: 400, statusText: "Bad Request" })
      expect(await failing).toEqual(partial)
    })

    // BookService waits for the listing with the books, so a stalled one held
    // the book list back too.
    it("fails a stalled listing in time", async () => {
      vi.useFakeTimers()
      let failure: unknown
      service.getIntros().subscribe({
        error: (error) => {
          failure = error
        },
      })
      await vi.advanceTimersByTimeAsync(0)
      const stalled = httpMock.expectOne("v1/intros")

      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)

      expect(failure).toBeInstanceOf(TimeoutError)
      expect(stalled.cancelled).toBe(true)
    })

    it("asks the network for an uncached listing while offline", async () => {
      networkServiceStub.isOffline = true

      const intros = firstValueFrom(service.getIntros())
      await Promise.resolve()
      await Promise.resolve()
      httpMock.expectOne("v1/intros").error(new ProgressEvent("error"))

      await expect(intros).rejects.toThrow()
    })

    it("returns the cached body without hitting the network", async () => {
      const cachedIntro: GroupIntro = {
        slug: "pentateuco",
        name: "Pentateuco",
        introduction: [{ type: "introTitle", level: 1, text: "Pentateuco" }],
      }
      offlineDataServiceSpy.getCachedGroupIntroAsync.mockResolvedValue(
        cachedIntro,
      )

      const result = await firstValueFrom(service.getIntro("pentateuco"))

      expect(result).toEqual(cachedIntro)
      httpMock.expectNone("v1/intros/pentateuco")
    })

    it("asks the network for an uncached body while offline", async () => {
      networkServiceStub.isOffline = true

      const intro = firstValueFrom(service.getIntro("pentateuco"))
      await Promise.resolve()
      await Promise.resolve()
      httpMock
        .expectOne("v1/intros/pentateuco")
        .error(new ProgressEvent("error"))

      await expect(intro).rejects.toThrow()
    })

    // As for chapters: the prerender must not serialize the page during the
    // cache lookup.
    it("keeps the app unstable from the call until the introduction arrives", async () => {
      offlineDataServiceSpy.getCachedGroupIntroAsync.mockResolvedValue(
        undefined,
      )
      const appRef = TestBed.inject(ApplicationRef)

      const introPromise = firstValueFrom(service.getIntro("pentateuco"))
      expect(await firstValueFrom(appRef.isStable)).toBe(false)

      await Promise.resolve()
      await Promise.resolve()
      httpMock.expectOne("v1/intros/pentateuco").flush({ slug: "pentateuco" })
      await introPromise
      // Settles only once the task has been released.
      await appRef.whenStable()
    })

    it("lets go of the app when the introduction fails", async () => {
      offlineDataServiceSpy.getCachedGroupIntroAsync.mockResolvedValue(
        undefined,
      )

      const intro = firstValueFrom(service.getIntro("pentateuco"))
      await Promise.resolve()
      await Promise.resolve()
      httpMock
        .expectOne("v1/intros/pentateuco")
        .error(new ProgressEvent("error"))

      await expect(intro).rejects.toThrow()
      await TestBed.inject(ApplicationRef).whenStable()
    })
  })

  describe("createApiResilience", () => {
    it("passes the source through untouched in the browser", () => {
      let value: number | undefined
      of(42)
        .pipe(createApiResilience<number>(false))
        .subscribe((v) => {
          value = v
        })
      expect(value).toBe(42)
    })

    it("times out and retries a request that never completes on the server", async () => {
      vi.useFakeTimers()
      let error: unknown
      let attempts = 0
      // A request that accepts the connection but never responds.
      const hangingRequest = new Observable<never>(() => {
        attempts++
      })

      hangingRequest
        .pipe(createApiResilience(true, 1000, 2, 100))
        .subscribe({ error: (err: unknown) => (error = err) })

      // Initial attempt + 2 retries, with 200ms and 400ms backoff between.
      await vi.advanceTimersByTimeAsync(1000 + 200 + 1000 + 400 + 1000)

      expect(attempts).toBe(3)
      expect(error).toBeInstanceOf(TimeoutError)
    })

    // Retrying a 404 only multiplies the request count and the backoff wait:
    // prerendering "/" asks for /v1/about/1, which the API never serves.
    it("fails a permanent 4xx immediately instead of retrying it", async () => {
      vi.useFakeTimers()
      let attempts = 0
      let error: unknown
      const notFound = new Observable<never>((subscriber) => {
        attempts++
        subscriber.error(
          new HttpErrorResponse({ status: 404, statusText: "Not Found" }),
        )
      })

      notFound
        .pipe(createApiResilience(true, 1000, 3, 100))
        .subscribe({ error: (err: unknown) => (error = err) })
      await vi.advanceTimersByTimeAsync(10000)

      expect(attempts).toBe(1)
      expect((error as HttpErrorResponse).status).toBe(404)
    })

    it("still retries the 4xx codes that mean try again", async () => {
      vi.useFakeTimers()
      for (const status of [408, 429]) {
        let attempts = 0
        const throttled = new Observable<never>((subscriber) => {
          attempts++
          subscriber.error(new HttpErrorResponse({ status }))
        })

        throttled
          .pipe(createApiResilience(true, 1000, 2, 100))
          .subscribe({ error: () => {} })
        await vi.advanceTimersByTimeAsync(10000)

        expect(attempts, `status ${status}`).toBe(3)
      }
    })
  })

  describe("server book list cache", () => {
    // One 200-with-[] would otherwise be reused by every later render in the
    // prerender worker, resolving every book to the About page.
    it("does not keep a degenerate book list for the rest of the build", () => {
      const cache = createServerBooksCache(true)

      cache.write([])
      expect(cache.read()).toBeNull()

      cache.write(undefined as unknown as Book[])
      expect(cache.read()).toBeNull()
    })

    it("keeps a usable book list and will not let a later empty response clobber it", () => {
      const cache = createServerBooksCache(true)
      const books = [{ id: "gen" } as Book]

      cache.write(books)
      expect(cache.read()).toBe(books)

      cache.write([])
      expect(cache.read()).toBe(books)
    })

    // Binding isServer at construction is what makes this unmixable: a browser
    // cache can neither be written to nor read from, whatever the call site.
    it("is server-only", () => {
      const cache = createServerBooksCache(false)

      cache.write([{ id: "gen" } as Book])
      expect(cache.read()).toBeNull()
    })

    it("does not share state between instances", () => {
      const first = createServerBooksCache(true)
      const second = createServerBooksCache(true)

      first.write([{ id: "gen" } as Book])
      expect(second.read()).toBeNull()
    })
  })
})
