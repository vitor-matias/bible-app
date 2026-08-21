import { HttpClient } from "@angular/common/http"
import { Injectable } from "@angular/core"
import { firstValueFrom } from "rxjs"
import { apiBaseUrl } from "../config"
import { safeLocalStorage } from "../utils/web-storage"
import { AnalyticsService } from "./analytics.service"
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
  private migrationPromise: Promise<boolean> | null = null

  constructor(
    private http: HttpClient,
    private databaseService: DatabaseService,
    private networkService: NetworkService,
    private analyticsService: AnalyticsService,
  ) {}

  /**
   * Fetches all books and chapters so they are stored by the Service Worker
   * for offline usage. Subsequent calls are skipped once the data is cached.
   */
  async preloadAllBooksAndChapters(
    source: "install" | "standalone" = "standalone",
  ): Promise<void> {
    if (typeof window === "undefined") return

    const migrated = await this.migrateCacheIfNeeded()

    // Stale metadata cannot be trusted after a failed migration: without this
    // gate a lingering "ready" flag would skip the refresh while reads fail
    // closed to an empty cache.
    const isAlreadyCached =
      migrated && safeLocalStorage()?.getItem(this.cacheFlagKey) === "true"
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
      this.trackBooksCachedEvent(source)
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
    // localStorage only holds cache metadata — its absence (privacy modes)
    // must not prevent persisting the books themselves to IndexedDB.
    const storage = safeLocalStorage()

    try {
      await this.saveBooksToIndexedDb(this.cachedBooks)
      storage?.setItem(this.cacheTimestampKey, Date.now().toString())
      storage?.setItem(this.cacheFlagKey, "true")
    } catch (error) {
      console.error("Failed to persist cached books or metadata", error)
      throw error
    }
  }

  getCachedBooks(): Book[] {
    this.ensureCacheLoaded()
    return this.cachedBooks ?? []
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
      byId.set(book.id, {
        ...current,
        ...book,
        chapters: this.mergeChapterLists(book.chapters, current.chapters),
      })
    }
    return Array.from(byId.values())
  }

  /**
   * Merges chapter lists per chapter number, keeping the fuller payload for
   * each chapter, so a partial or shallow refresh (stubs without verses) never
   * drops verse content that is already cached for other chapters.
   */
  private mergeChapterLists(
    incoming?: Chapter[],
    current?: Chapter[],
  ): Chapter[] | undefined {
    if (!incoming?.length) return current?.length ? current : incoming
    if (!current?.length) return incoming

    const byNumber = new Map<number, Chapter>()
    for (const chapter of current) {
      byNumber.set(chapter.number, chapter)
    }
    for (const chapter of incoming) {
      const cached = byNumber.get(chapter.number)
      if (!cached) {
        byNumber.set(chapter.number, chapter)
        continue
      }
      const incomingVerses = chapter.verses?.length ?? 0
      const cachedVerses = cached.verses?.length ?? 0
      if (incomingVerses > cachedVerses) {
        byNumber.set(chapter.number, chapter)
      } else if (incomingVerses === cachedVerses) {
        // On equal verse counts, a stub must not drop a cached chapter's
        // introduction text; otherwise prefer the fresher incoming payload.
        if (chapter.introduction || !cached.introduction) {
          byNumber.set(chapter.number, chapter)
        }
      }
    }
    return Array.from(byNumber.values()).sort((a, b) => a.number - b.number)
  }

  private ensureCacheLoaded(): Promise<void> {
    if (this.cachedBooks) return Promise.resolve()
    if (!this.cacheLoadPromise) {
      // Share one IndexedDB read across concurrent callers during startup.
      // Run the schema migration first so stale-shape records never surface.
      this.cacheLoadPromise = this.migrateCacheIfNeeded()
        .then((migrated) => {
          if (migrated) {
            return this.loadBooksFromIndexedDb()
          }
          // Fail closed: the store still holds incompatible-schema records,
          // so treat the cache as empty rather than expose them.
          this.cachedBooks = []
          return undefined
        })
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
   * Resolves to false when the stale records could not be cleared; callers
   * must then avoid reading the store.
   */
  private migrateCacheIfNeeded(): Promise<boolean> {
    // safeLocalStorage(), not `typeof localStorage`: prerendering workers run
    // on Node versions that define a localStorage global whose methods throw.
    const storage = safeLocalStorage()
    if (!storage) return Promise.resolve(true)
    if (
      storage.getItem(this.cacheSchemaKey) ===
      this.cacheSchemaVersion.toString()
    ) {
      return Promise.resolve(true)
    }
    if (!this.migrationPromise) {
      this.migrationPromise = (async () => {
        try {
          await this.databaseService.clear("books")
          this.cachedBooks = null
          storage.removeItem(this.cacheFlagKey)
          storage.removeItem(this.cacheTimestampKey)
          // Only mark the schema current once the stale records are gone.
          storage.setItem(
            this.cacheSchemaKey,
            this.cacheSchemaVersion.toString(),
          )
          return true
        } catch (error) {
          console.error("Failed to migrate cached books schema", error)
          return false
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
    const ts = safeLocalStorage()?.getItem(this.cacheTimestampKey)
    if (!ts) return false
    const timestamp = Number.parseInt(ts, 10)
    if (!Number.isFinite(timestamp)) return false
    return Date.now() - timestamp > this.cacheMaxAgeMs
  }

  private trackBooksCachedEvent(source: "install" | "standalone") {
    void this.analyticsService.track("pwa_books_cached", { source })
  }
}
