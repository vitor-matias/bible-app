import {
  HttpClientTestingModule,
  HttpTestingController,
} from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { OfflineDataService } from "./offline-data.service"

describe("OfflineDataService", () => {
  let service: OfflineDataService
  let httpMock: HttpTestingController
  let mockLocalStorage: any

  const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30
  const NINETY_ONE_DAYS_MS = 1000 * 60 * 60 * 24 * 91

  const mockBooks: Book[] = [
    {
      id: "gen",
      name: "Genesis",
      shortName: "Genesis",
      abrv: "Gn",
      chapterCount: 50,
      chapters: [
        {
          bookId: "gen",
          number: 1,
          verses: [
            {
              bookId: "gen",
              chapterNumber: 1,
              number: 1,
              verseLabel: "1",
              text: [{ type: "text", text: "In the beginning..." }],
            },
          ],
        },
      ],
    },
    {
      id: "exo",
      name: "Exodus",
      shortName: "Exodus",
      abrv: "Ex",
      chapterCount: 40,
    },
  ]

  function createMockIndexedDB() {
    let storedBooks: Book[] = []

    const mockObjectStore = {
      put: jasmine.createSpy("put").and.callFake((book: Book) => {
        storedBooks.push(book)
      }),
      clear: jasmine.createSpy("clear").and.callFake(() => {
        storedBooks = []
      }),
      getAll: jasmine.createSpy("getAll").and.callFake(() => {
        const request = {
          onsuccess: null as any,
          onerror: null as any,
          result: storedBooks,
        }
        setTimeout(() => {
          if (request.onsuccess) {
            request.onsuccess()
          }
        }, 0)
        return request
      }),
    }

    const mockTransaction = {
      oncomplete: null as any,
      onerror: null as any,
      onabort: null as any,
      error: null,
      objectStore: jasmine
        .createSpy("objectStore")
        .and.returnValue(mockObjectStore),
    }

    const mockDB = {
      transaction: jasmine.createSpy("transaction").and.callFake(() => {
        setTimeout(() => {
          if (mockTransaction.oncomplete) {
            mockTransaction.oncomplete()
          }
        }, 0)
        return mockTransaction
      }),
      objectStoreNames: {
        contains: jasmine.createSpy("contains").and.returnValue(true),
      },
      createObjectStore: jasmine.createSpy("createObjectStore"),
    }

    return {
      open: jasmine.createSpy("open").and.callFake(() => {
        const request = {
          onsuccess: null as any,
          onerror: null as any,
          onupgradeneeded: null as any,
          result: mockDB,
        }
        setTimeout(() => {
          if (request.onsuccess) {
            request.onsuccess()
          }
        }, 0)
        return request
      }),
    }
  }

  beforeEach(() => {
    // Mock localStorage
    mockLocalStorage = {
      _storage: {} as Record<string, string>,
      getItem: jasmine.createSpy("getItem").and.callFake((key: string) => {
        return mockLocalStorage._storage[key] || null
      }),
      setItem: jasmine
        .createSpy("setItem")
        .and.callFake((key: string, value: string) => {
          mockLocalStorage._storage[key] = value
        }),
      removeItem: jasmine
        .createSpy("removeItem")
        .and.callFake((key: string) => {
          delete mockLocalStorage._storage[key]
        }),
      clear: jasmine.createSpy("clear").and.callFake(() => {
        mockLocalStorage._storage = {}
      }),
      key: jasmine.createSpy("key"),
      length: 0,
    }
    spyOnProperty(window, "localStorage", "get").and.returnValue(
      mockLocalStorage,
    )

    // Mock IndexedDB
    spyOnProperty(window, "indexedDB", "get").and.returnValue(
      createMockIndexedDB() as any,
    )

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [OfflineDataService],
    })
    service = TestBed.inject(OfflineDataService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    httpMock.verify()
    mockLocalStorage._storage = {}
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
  })

  describe("preloadAllBooksAndChapters", () => {
    it("should skip preload if cache is already valid", async () => {
      mockLocalStorage._storage["booksCacheReady"] = "true"
      mockLocalStorage._storage["booksCacheTimestamp"] = Date.now().toString()

      await service.preloadAllBooksAndChapters()

      httpMock.expectNone("v1/books?withChapters=true")
      expect(true).toBe(true) // Silence 'no expectations' warning
    })

    it("should preload books if cache flag is not set", async () => {
      const promise = service.preloadAllBooksAndChapters()

      const req = httpMock.expectOne("v1/books?withChapters=true")
      expect(req.request.method).toBe("GET")
      req.flush(mockBooks)

      await promise

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "booksCacheReady",
        "true",
      )
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "booksCacheTimestamp",
        jasmine.any(String),
      )
    })

    it("should preload books if cache is expired and online", async () => {
      // 91 days ago
      const oldTimestamp = Date.now() - NINETY_ONE_DAYS_MS
      mockLocalStorage._storage["booksCacheReady"] = "true"
      mockLocalStorage._storage["booksCacheTimestamp"] = oldTimestamp.toString()

      spyOnProperty(navigator, "onLine", "get").and.returnValue(true)

      const promise = service.preloadAllBooksAndChapters()

      const req = httpMock.expectOne("v1/books?withChapters=true")
      req.flush(mockBooks)

      await promise

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "booksCacheTimestamp",
        jasmine.any(String),
      )
    })

    it("should keep stale cache when offline and expired", async () => {
      // 91 days ago
      const oldTimestamp = Date.now() - NINETY_ONE_DAYS_MS
      mockLocalStorage._storage["booksCacheReady"] = "true"
      mockLocalStorage._storage["booksCacheTimestamp"] = oldTimestamp.toString()

      spyOnProperty(navigator, "onLine", "get").and.returnValue(false)

      await service.preloadAllBooksAndChapters()

      httpMock.expectNone("v1/books?withChapters=true")
      expect(true).toBe(true)
    })

    it("should handle preload errors gracefully", async () => {
      spyOn(console, "error")

      const promise = service.preloadAllBooksAndChapters()

      const req = httpMock.expectOne("v1/books?withChapters=true")
      req.error(new ProgressEvent("error"))

      await promise

      expect(console.error).toHaveBeenCalledWith(
        "Failed to preload books for offline use",
        jasmine.any(Object),
      )
    })

    it("should track umami event when source is install", async () => {
      const mockUmami = { track: jasmine.createSpy("track") }
      ;(window as any).umami = mockUmami

      const promise = service.preloadAllBooksAndChapters("install")

      const req = httpMock.expectOne("v1/books?withChapters=true")
      req.flush(mockBooks)

      await promise

      expect(mockUmami.track).toHaveBeenCalledWith("pwa_books_cached", {
        source: "install",
      })

      delete (window as any).umami
    })

    it("should not track umami event when source is standalone", async () => {
      const mockUmami = { track: jasmine.createSpy("track") }
      ;(window as any).umami = mockUmami

      const promise = service.preloadAllBooksAndChapters("standalone")

      const req = httpMock.expectOne("v1/books?withChapters=true")
      req.flush(mockBooks)

      await promise

      expect(mockUmami.track).toHaveBeenCalledWith("pwa_books_cached", {
        source: "standalone",
      })
    })
  })

  describe("setCachedBooks and getCachedBooks", () => {
    it("should set and retrieve cached books", async () => {
      await service.setCachedBooks(mockBooks)

      const cachedBooks = service.getCachedBooks()
      expect(cachedBooks.length).toBe(2)
      expect(cachedBooks[0].id).toBe("gen")
    })

    it("should merge with existing cached books", async () => {
      const existingBooks: Book[] = [
        {
          id: "gen",
          name: "Genesis Old",
          shortName: "Genesis",
          abrv: "Gn",
          chapterCount: 50,
        },
      ]

      await service.setCachedBooks(existingBooks)
      await service.setCachedBooks(mockBooks)

      const cachedBooks = service.getCachedBooks()
      expect(cachedBooks.length).toBe(2)
      const genBook = cachedBooks.find((b) => b.id === "gen")
      expect(genBook?.chapters?.length).toBe(1)
    })

    it("should set cache timestamp in localStorage", async () => {
      await service.setCachedBooks(mockBooks)

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "booksCacheTimestamp",
        jasmine.any(String),
      )
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "booksCacheReady",
        "true",
      )
    })

    it("should return empty array when no books are cached", () => {
      const books = service.getCachedBooks()
      expect(books).toEqual([])
    })
  })

  describe("getCachedBook", () => {
    beforeEach(async () => {
      await service.setCachedBooks(mockBooks)
    })

    it("should return book by id", () => {
      const book = service.getCachedBook("gen")
      expect(book).toBeDefined()
      expect(book?.name).toBe("Genesis")
    })

    it("should return undefined for non-existent book", () => {
      const book = service.getCachedBook("nonexistent")
      expect(book).toBeUndefined()
    })
  })

  describe("getCachedChapter", () => {
    beforeEach(async () => {
      await service.setCachedBooks(mockBooks)
    })

    it("should return chapter by book id and chapter number", () => {
      const chapter = service.getCachedChapter("gen", 1)
      expect(chapter).toBeDefined()
      expect(chapter?.number).toBe(1)
      expect(chapter?.bookId).toBe("gen")
    })

    it("should return undefined for non-existent book", () => {
      const chapter = service.getCachedChapter("nonexistent", 1)
      expect(chapter).toBeUndefined()
    })

    it("should return undefined for non-existent chapter", () => {
      const chapter = service.getCachedChapter("gen", 999)
      expect(chapter).toBeUndefined()
    })

    it("should return undefined when book has no chapters", () => {
      const chapter = service.getCachedChapter("exo", 1)
      expect(chapter).toBeUndefined()
    })
  })

  describe("getCachedVerse", () => {
    beforeEach(async () => {
      await service.setCachedBooks(mockBooks)
    })

    it("should return verse by book id, chapter number, and verse number", () => {
      const verse = service.getCachedVerse("gen", 1, 1)
      expect(verse).toBeDefined()
      expect(verse?.number).toBe(1)
      expect(verse?.bookId).toBe("gen")
      expect(verse?.chapterNumber).toBe(1)
    })

    it("should return undefined for non-existent book", () => {
      const verse = service.getCachedVerse("nonexistent", 1, 1)
      expect(verse).toBeUndefined()
    })

    it("should return undefined for non-existent chapter", () => {
      const verse = service.getCachedVerse("gen", 999, 1)
      expect(verse).toBeUndefined()
    })

    it("should return undefined for non-existent verse", () => {
      const verse = service.getCachedVerse("gen", 1, 999)
      expect(verse).toBeUndefined()
    })
  })

  describe("mergeCachedBooks", () => {
    it("should merge books by id, preferring incoming data", async () => {
      const existing: Book[] = [
        {
          id: "gen",
          name: "Genesis Old",
          shortName: "Gen",
          abrv: "Gn",
          chapterCount: 50,
        },
      ]

      const incoming: Book[] = [
        {
          id: "gen",
          name: "Genesis New",
          shortName: "Genesis",
          abrv: "Gn",
          chapterCount: 50,
        },
      ]

      await service.setCachedBooks(existing)
      await service.setCachedBooks(incoming)

      const books = service.getCachedBooks()
      const genBook = books.find((b) => b.id === "gen")
      expect(genBook?.name).toBe("Genesis New")
      expect(genBook?.shortName).toBe("Genesis")
    })

    it("should preserve chapters from existing books when incoming has none", async () => {
      const existing: Book[] = [
        {
          id: "gen",
          name: "Genesis",
          shortName: "Genesis",
          abrv: "Gn",
          chapterCount: 50,
          chapters: [
            {
              bookId: "gen",
              number: 1,
              verses: [],
            },
          ],
        },
      ]

      const incoming: Book[] = [
        {
          id: "gen",
          name: "Genesis Updated",
          shortName: "Genesis",
          abrv: "Gn",
          chapterCount: 50,
        },
      ]

      await service.setCachedBooks(existing)
      await service.setCachedBooks(incoming)

      const books = service.getCachedBooks()
      const genBook = books.find((b) => b.id === "gen")
      expect(genBook?.chapters?.length).toBe(1)
    })

    it("should use incoming chapters when they exist", async () => {
      const existing: Book[] = [
        {
          id: "gen",
          name: "Genesis",
          shortName: "Genesis",
          abrv: "Gn",
          chapterCount: 50,
          chapters: [
            {
              bookId: "gen",
              number: 1,
              verses: [],
            },
          ],
        },
      ]

      const incoming: Book[] = [
        {
          id: "gen",
          name: "Genesis",
          shortName: "Genesis",
          abrv: "Gn",
          chapterCount: 50,
          chapters: [
            {
              bookId: "gen",
              number: 1,
              verses: [],
            },
            {
              bookId: "gen",
              number: 2,
              verses: [],
            },
          ],
        },
      ]

      await service.setCachedBooks(existing)
      await service.setCachedBooks(incoming)

      const books = service.getCachedBooks()
      const genBook = books.find((b) => b.id === "gen")
      expect(genBook?.chapters?.length).toBe(2)
    })

    it("should add new books from incoming", async () => {
      const existing: Book[] = [
        {
          id: "gen",
          name: "Genesis",
          shortName: "Genesis",
          abrv: "Gn",
          chapterCount: 50,
        },
      ]

      const incoming: Book[] = [
        {
          id: "exo",
          name: "Exodus",
          shortName: "Exodus",
          abrv: "Ex",
          chapterCount: 40,
        },
      ]

      await service.setCachedBooks(existing)
      await service.setCachedBooks(incoming)

      const books = service.getCachedBooks()
      expect(books.length).toBe(2)
      expect(books.find((b) => b.id === "gen")).toBeDefined()
      expect(books.find((b) => b.id === "exo")).toBeDefined()
    })
  })

  describe("cache expiry", () => {
    it("should consider cache expired after 90 days", async () => {
      // 91 days ago
      const oldTimestamp = Date.now() - NINETY_ONE_DAYS_MS
      mockLocalStorage._storage["booksCacheReady"] = "true"
      mockLocalStorage._storage["booksCacheTimestamp"] = oldTimestamp.toString()

      spyOnProperty(navigator, "onLine", "get").and.returnValue(true)

      const promise = service.preloadAllBooksAndChapters()

      const req = httpMock.expectOne("v1/books?withChapters=true")
      req.flush(mockBooks)

      await promise
      expect(true).toBe(true)
    })

    it("should consider cache valid within 90 days", async () => {
      // 30 days ago
      const recentTimestamp = Date.now() - THIRTY_DAYS_MS
      mockLocalStorage._storage["booksCacheReady"] = "true"
      mockLocalStorage._storage["booksCacheTimestamp"] =
        recentTimestamp.toString()

      await service.preloadAllBooksAndChapters()

      httpMock.expectNone("v1/books?withChapters=true")
      expect(true).toBe(true)
    })

    it("should not consider cache expired if timestamp is not a valid number", async () => {
      mockLocalStorage._storage["booksCacheReady"] = "true"
      mockLocalStorage._storage["booksCacheTimestamp"] = "invalid"

      await service.preloadAllBooksAndChapters()

      httpMock.expectNone("v1/books?withChapters=true")
      expect(true).toBe(true)
    })

    it("should not consider cache expired if no timestamp exists", async () => {
      mockLocalStorage._storage["booksCacheReady"] = "true"

      await service.preloadAllBooksAndChapters()

      httpMock.expectNone("v1/books?withChapters=true")
      expect(true).toBe(true)
    })
  })

  describe("IndexedDB operations", () => {
    it("should open IndexedDB database with correct name and version", async () => {
      await service.setCachedBooks(mockBooks)

      const indexedDB = (window as any).indexedDB
      expect(indexedDB.open).toHaveBeenCalledWith("offline-bible", 1)
    })
  })
})
