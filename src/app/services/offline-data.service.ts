import { HttpClient } from "@angular/common/http"
import { Injectable } from "@angular/core"
import { firstValueFrom } from "rxjs"
import { apiBaseUrl } from "../config"
import { DatabaseService } from "./database.service"
import { NetworkService } from "./network.service"

@Injectable({
  providedIn: "root",
})
export class OfflineDataService {
  private cacheFlagKey = "booksCacheReady"
  private cacheTimestampKey = "booksCacheTimestamp"
  private cacheSchemaKey = "booksCacheSchemaVersion"
  // Bump whenever the persisted Book/Chapter/Verse shape changes incompatibly
  // (e.g. book introductions, required normalizedText) so stale IndexedDB
  // records from older app versions are dropped and re-cached.
  private readonly cacheSchemaVersion = 2
  private cacheMaxAgeMs = 1000 * 60 * 60 * 24 * 40 // 40 days
  private cachedBooks: Book[] | null = null
  private apiBase = apiBaseUrl
  private cacheLoadPromise: Promise<void> | null = null
  private migrationPromise: Promise<void> | null = null

  constructor(
    private http: HttpClient,
    private databaseService: DatabaseService,
    private networkService: NetworkService,
  ) {}

  /**
   * Fetches all books and chapters so they are stored by the Service Worker
   * for offline usage. Subsequent calls are skipped once the data is cached.
   */
  async preloadAllBooksAndChapters(
    source: "install" | "standalone" = "standalone",
  ): Promise<void> {
    if (typeof window === "undefined") return

    await this.migrateCacheIfNeeded()

    const isAlreadyCached = localStorage.getItem(this.cacheFlagKey) === "true"
    const isExpired = this.isCacheExpired()
    if (isAlreadyCached && !isExpired) {
      return
    }
    if (isExpired && this.networkService.isOffline) {
      // Prefer stale data over wiping out offline reading when the refresh window
      // expires but the device has no connection.
      return
    }

    try {
      const books = await firstValueFrom(
        this.http.get<Book[]>(`${this.apiBase}/books?withChapters=true`),
      )
      await this.setCachedBooks(books)
      this.trackUmamiInstallEvent(source)
    } catch (error) {
      console.error("Failed to preload books for offline use", error)
    }
  }

  async setCachedBooks(books: Book[]): Promise<void> {
    // Ensure any in-progress cache load from IndexedDB has completed
    // before we merge in the new books.
    if (this.cacheLoadPromise) {
      try {
        await this.cacheLoadPromise
      } catch (error) {
        console.error(
          "Failed to load existing cached books before merge",
          error,
        )
      }
    } else {
      // Kick off a load if it has not been started yet.
      this.ensureCacheLoaded()
      if (this.cacheLoadPromise) {
        try {
          await this.cacheLoadPromise
        } catch (error) {
          console.error(
            "Failed to load existing cached books before merge",
            error,
          )
        }
      }
    }

    const existingBooks = this.cachedBooks ?? []
    this.cachedBooks = this.mergeCachedBooks(existingBooks, books)
    if (typeof localStorage === "undefined") {
      // In non-browser environments, skip persistence and metadata.
      return
    }

    try {
      await this.saveBooksToIndexedDb(this.cachedBooks)
      localStorage.setItem(this.cacheTimestampKey, Date.now().toString())
      localStorage.setItem(this.cacheFlagKey, "true")
    } catch (error) {
      console.error("Failed to persist cached books or metadata", error)
    }
  }

  getCachedBooks(): Book[] {
    this.ensureCacheLoaded()
    if (this.cachedBooks) return this.cachedBooks
    if (typeof localStorage === "undefined") return []
    return []
  }

  async getCachedBooksAsync(): Promise<Book[]> {
    await this.ensureCacheLoaded()
    return this.cachedBooks ?? []
  }

  getCachedBook(bookId: Book["id"]): Book | undefined {
    return this.getCachedBooks().find((book) => book.id === bookId)
  }

  async getCachedBookAsync(bookId: Book["id"]): Promise<Book | undefined> {
    const books = await this.getCachedBooksAsync()
    return books.find((book) => book.id === bookId)
  }

  getCachedChapter(
    bookId: Book["id"],
    chapterNumber: Chapter["number"],
  ): Chapter | undefined {
    const book = this.getCachedBook(bookId)
    return book?.chapters?.find((chapter) => chapter.number === chapterNumber)
  }

  async getCachedChapterAsync(
    bookId: Book["id"],
    chapterNumber: Chapter["number"],
  ): Promise<Chapter | undefined> {
    const book = await this.getCachedBookAsync(bookId)
    return book?.chapters?.find((chapter) => chapter.number === chapterNumber)
  }

  getCachedVerse(
    bookId: Book["id"],
    chapterNumber: Chapter["number"],
    verseNumber: Verse["number"],
  ): Verse | undefined {
    const chapter = this.getCachedChapter(bookId, chapterNumber)
    return chapter?.verses?.find((verse) => verse.number === verseNumber)
  }

  async getCachedVerseAsync(
    bookId: Book["id"],
    chapterNumber: Chapter["number"],
    verseNumber: Verse["number"],
  ): Promise<Verse | undefined> {
    const chapter = await this.getCachedChapterAsync(bookId, chapterNumber)
    return chapter?.verses?.find((verse) => verse.number === verseNumber)
  }

  private mergeCachedBooks(existing: Book[], incoming: Book[]): Book[] {
    const byId = new Map<string, Book>()
    for (const book of existing) {
      byId.set(book.id, { ...book })
    }
    for (const book of incoming) {
      const current = byId.get(book.id)
      if (!current) {
        byId.set(book.id, book)
        continue
      }
      // Keep whichever side has the fuller chapter payload so a shallow refresh
      // (chapter stubs without verses) does not overwrite chapters that were
      // already cached locally with their verse content.
      const chapterPayloadScore = (chapters?: Chapter[]) =>
        (chapters ?? []).reduce(
          (score, chapter) => score + (chapter.verses?.length ?? 0),
          0,
        )
      const incomingScore = chapterPayloadScore(book.chapters)
      const currentScore = chapterPayloadScore(current.chapters)
      let chapters: Chapter[] | undefined
      if (incomingScore !== currentScore) {
        chapters =
          incomingScore > currentScore ? book.chapters : current.chapters
      } else {
        chapters =
          (book.chapters?.length ?? 0) >= (current.chapters?.length ?? 0)
            ? book.chapters
            : current.chapters
      }
      byId.set(book.id, { ...current, ...book, chapters })
    }
    return Array.from(byId.values())
  }

  private ensureCacheLoaded(): Promise<void> {
    if (this.cachedBooks) return Promise.resolve()
    if (!this.cacheLoadPromise) {
      // Share one IndexedDB read across concurrent callers during startup.
      // Run the schema migration first so stale-shape records never surface.
      this.cacheLoadPromise = this.migrateCacheIfNeeded()
        .then(() => this.loadBooksFromIndexedDb())
        .catch((error) => {
          console.error("Failed to load cached books from IndexedDB", error)
        })
        .then(() => {
          this.cacheLoadPromise = null
        })
    }
    return this.cacheLoadPromise || Promise.resolve()
  }

  /**
   * Drops persisted books when they were written by an app version with an
   * incompatible Book shape, so callers never read records that are missing
   * newer required fields (introduction elements, normalizedText, …).
   */
  private migrateCacheIfNeeded(): Promise<void> {
    if (typeof localStorage === "undefined") return Promise.resolve()
    if (
      localStorage.getItem(this.cacheSchemaKey) ===
      this.cacheSchemaVersion.toString()
    ) {
      return Promise.resolve()
    }
    if (!this.migrationPromise) {
      this.migrationPromise = (async () => {
        try {
          await this.databaseService.clear("books")
          this.cachedBooks = null
          localStorage.removeItem(this.cacheFlagKey)
          localStorage.removeItem(this.cacheTimestampKey)
          localStorage.setItem(
            this.cacheSchemaKey,
            this.cacheSchemaVersion.toString(),
          )
        } catch (error) {
          console.error("Failed to migrate cached books schema", error)
        } finally {
          this.migrationPromise = null
        }
      })()
    }
    return this.migrationPromise
  }

  private async loadBooksFromIndexedDb(): Promise<void> {
    const records = await this.databaseService.getAll<Book>("books")
    // Cache the empty result too so repeat callers don't re-hit IndexedDB.
    this.cachedBooks = records ?? []
  }

  private async saveBooksToIndexedDb(books: Book[]): Promise<void> {
    await this.databaseService.clearAndPutAll("books", books)
  }

  private isCacheExpired(): boolean {
    if (typeof localStorage === "undefined") return false
    const ts = localStorage.getItem(this.cacheTimestampKey)
    if (!ts) return false
    const timestamp = Number.parseInt(ts, 10)
    if (!Number.isFinite(timestamp)) return false
    return Date.now() - timestamp > this.cacheMaxAgeMs
  }

  private trackUmamiInstallEvent(source: "install" | "standalone") {
    const umami = typeof window !== "undefined" ? window.umami : undefined
    if (umami?.track) {
      umami.track("pwa_books_cached", { source })
    }
  }
}
