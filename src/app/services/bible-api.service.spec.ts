import { HttpErrorResponse } from "@angular/common/http"
import {
  HttpClientTestingModule,
  HttpTestingController,
} from "@angular/common/http/testing"
import { fakeAsync, TestBed, tick } from "@angular/core/testing"
import { firstValueFrom, Observable, of, TimeoutError } from "rxjs"
import {
  BibleApiService,
  createApiResilience,
  createServerBooksCache,
} from "./bible-api.service"
import { NetworkService } from "./network.service"
import { OfflineDataService } from "./offline-data.service"

describe("BibleApiService", () => {
  let service: BibleApiService
  let httpMock: HttpTestingController
  let offlineDataServiceSpy: jasmine.SpyObj<OfflineDataService>
  let networkServiceStub: { isOffline: boolean }

  beforeEach(() => {
    const spy = jasmine.createSpyObj("OfflineDataService", [
      "getCachedChapterAsync",
      "getCachedBooksAsync",
      "getCachedBookAsync",
      "getCachedVerseAsync",
      "getCachedGroupIntroSummariesAsync",
      "getCachedGroupIntroAsync",
    ])
    networkServiceStub = { isOffline: false }

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        BibleApiService,
        { provide: OfflineDataService, useValue: spy },
        { provide: NetworkService, useValue: networkServiceStub },
      ],
    })

    service = TestBed.inject(BibleApiService)
    httpMock = TestBed.inject(HttpTestingController)
    offlineDataServiceSpy = TestBed.inject(
      OfflineDataService,
    ) as jasmine.SpyObj<OfflineDataService>

    // Mock navigator.onLine to be true
    spyOnProperty(navigator, "onLine", "get").and.returnValue(true)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
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
              normalizedText: "In the beginning...",
            },
          ],
        },
      ],
    } as Chapter

    it("should return cached chapter when it contains verses", async () => {
      offlineDataServiceSpy.getCachedChapterAsync.and.returnValue(
        Promise.resolve(mockChapter),
      )

      const result = await firstValueFrom(service.getChapter(book, chapterNum))
      expect(result).toEqual(mockChapter)
      httpMock.expectNone(`v1/${book}/${chapterNum}`)
    })

    it("should fetch from server when cache returns undefined", async () => {
      offlineDataServiceSpy.getCachedChapterAsync.and.returnValue(
        Promise.resolve(undefined),
      )

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

    it("should fetch from server when cached chapter has no verses array", async () => {
      const hollowChapter = { bookId: book, number: chapterNum } as Chapter
      offlineDataServiceSpy.getCachedChapterAsync.and.returnValue(
        Promise.resolve(hollowChapter),
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
      offlineDataServiceSpy.getCachedChapterAsync.and.returnValue(
        Promise.resolve(emptyChapter),
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
      offlineDataServiceSpy.getCachedChapterAsync.and.returnValue(
        Promise.resolve(undefined),
      )

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
                normalizedText: "Now these are the names...",
              },
            ],
          },
        ],
      } as Chapter

      offlineDataServiceSpy.getCachedChapterAsync.and.returnValue(
        Promise.resolve(undefined),
      )

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
      offlineDataServiceSpy.getCachedBooksAsync.and.returnValue(
        Promise.resolve(cachedBooks),
      )

      const result = await firstValueFrom(service.getAvailableBooks())

      expect(result).toEqual(cachedBooks)
      httpMock.expectNone("v1/books")
    })

    it("should throw when offline and no cached books exist", async () => {
      offlineDataServiceSpy.getCachedBooksAsync.and.returnValue(
        Promise.resolve([]),
      )
      networkServiceStub.isOffline = true

      await expectAsync(
        firstValueFrom(service.getAvailableBooks()),
      ).toBeRejectedWithError("Offline and no cached books available")
      httpMock.expectNone("v1/books")
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
      offlineDataServiceSpy.getCachedBooksAsync.and.returnValue(
        Promise.resolve([]),
      )

      const booksPromise = firstValueFrom(service.getAvailableBooks())

      await Promise.resolve()
      await Promise.resolve()

      const req = httpMock.expectOne("v1/books")
      req.flush(remoteBooks)

      expect(await booksPromise).toEqual(remoteBooks)
      expect(service.books).toEqual(remoteBooks)
    })
  })

  describe("getBook", () => {
    it("should return a cached book when available", async () => {
      const cachedBook = {
        id: "gen",
        name: "Genesis",
        shortName: "Genesis",
        abrv: "Gn",
        chapterCount: 50,
      } as Book
      offlineDataServiceSpy.getCachedBookAsync.and.returnValue(
        Promise.resolve(cachedBook),
      )

      const result = await firstValueFrom(service.getBook("gen"))

      expect(result).toEqual(cachedBook)
      httpMock.expectNone("v1/gen")
    })

    it("should throw when offline and the book is not cached", async () => {
      offlineDataServiceSpy.getCachedBookAsync.and.returnValue(
        Promise.resolve(undefined),
      )
      networkServiceStub.isOffline = true

      await expectAsync(
        firstValueFrom(service.getBook("gen")),
      ).toBeRejectedWithError("Offline - book not cached")
      httpMock.expectNone("v1/gen")
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
            normalizedText: "In the beginning...",
          },
        ],
      } as Verse
      offlineDataServiceSpy.getCachedVerseAsync.and.returnValue(
        Promise.resolve(cachedVerse),
      )

      const result = await firstValueFrom(service.getVerse("gen", 1, 1))

      expect(result).toEqual(cachedVerse)
      httpMock.expectNone("v1/gen/1/1")
    })

    it("should throw when offline and the verse is not cached", async () => {
      offlineDataServiceSpy.getCachedVerseAsync.and.returnValue(
        Promise.resolve(undefined),
      )
      networkServiceStub.isOffline = true

      await expectAsync(
        firstValueFrom(service.getVerse("gen", 1, 1)),
      ).toBeRejectedWithError("Offline - verse not cached")
      httpMock.expectNone("v1/gen/1/1")
    })
  })

  describe("introductions", () => {
    beforeEach(() => {
      offlineDataServiceSpy.getCachedGroupIntroSummariesAsync.and.returnValue(
        Promise.resolve([]),
      )
      offlineDataServiceSpy.getCachedGroupIntroAsync.and.returnValue(
        Promise.resolve(undefined),
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
      offlineDataServiceSpy.getCachedGroupIntroSummariesAsync.and.returnValue(
        Promise.resolve(cachedIntros),
      )

      const result = await firstValueFrom(service.getIntros())

      expect(result).toEqual(cachedIntros)
      httpMock.expectNone("v1/intros")
    })

    it("throws when offline and the listing is not cached", async () => {
      networkServiceStub.isOffline = true

      await expectAsync(
        firstValueFrom(service.getIntros()),
      ).toBeRejectedWithError("Offline and no cached introductions available")
      httpMock.expectNone("v1/intros")
    })

    it("returns the cached body without hitting the network", async () => {
      const cachedIntro: GroupIntro = {
        slug: "pentateuco",
        name: "Pentateuco",
        introduction: [{ type: "introTitle", level: 1, text: "Pentateuco" }],
      }
      offlineDataServiceSpy.getCachedGroupIntroAsync.and.returnValue(
        Promise.resolve(cachedIntro),
      )

      const result = await firstValueFrom(service.getIntro("pentateuco"))

      expect(result).toEqual(cachedIntro)
      httpMock.expectNone("v1/intros/pentateuco")
    })

    it("throws when offline and the body is not cached", async () => {
      networkServiceStub.isOffline = true

      await expectAsync(
        firstValueFrom(service.getIntro("pentateuco")),
      ).toBeRejectedWithError("Offline - introduction not cached")
      httpMock.expectNone("v1/intros/pentateuco")
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

    it("times out and retries a request that never completes on the server", fakeAsync(() => {
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
      tick(1000 + 200 + 1000 + 400 + 1000)

      expect(attempts).toBe(3)
      expect(error).toBeInstanceOf(TimeoutError)
    }))

    // Retrying a 404 only multiplies the request count and the backoff wait:
    // prerendering "/" asks for /v1/about/1, which the API never serves.
    it("fails a permanent 4xx immediately instead of retrying it", fakeAsync(() => {
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
      tick(10_000)

      expect(attempts).toBe(1)
      expect((error as HttpErrorResponse).status).toBe(404)
    }))

    it("still retries the 4xx codes that mean try again", fakeAsync(() => {
      for (const status of [408, 429]) {
        let attempts = 0
        const throttled = new Observable<never>((subscriber) => {
          attempts++
          subscriber.error(new HttpErrorResponse({ status }))
        })

        throttled
          .pipe(createApiResilience(true, 1000, 2, 100))
          .subscribe({ error: () => {} })
        tick(10_000)

        expect(attempts).withContext(`status ${status}`).toBe(3)
      }
    }))
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
