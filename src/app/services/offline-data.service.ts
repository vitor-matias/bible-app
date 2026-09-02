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
  private groupIntrosCacheFlagKey = "groupIntrosCacheReady"
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
    const storage = safeLocalStorage()

    // Stale metadata cannot be trusted after a failed migration: without this
    // gate a lingering "ready" flag would skip the refresh while reads fail
    // closed to an empty cache. Without localStorage the flag can never be
    // written either, so asking for it would answer "not cached" on every
    // launch and re-download the whole Bible each time. IndexedDB holds the
    // books themselves and is the same question one layer down, so fall back
    // to that.
    // Books and introductions are gated independently: a launch where books
    // cached fine but /intros had a transient failure must only retry the
    // (small) introductions fetch, never force a redownload of the entire
    // multi-megabyte books payload just because the flags aren't both set.
    const booksAlreadyCached =
      migrated &&
      (storage
        ? storage.getItem(this.cacheFlagKey) === "true"
        : (await this.getCachedBooksAsync()).length > 0)
    const introsAlreadyCached =
      migrated &&
      (storage
        ? storage.getItem(this.groupIntrosCacheFlagKey) === "true"
        : (await this.getCachedBooksAsync()).length > 0)
    const isExpired = this.isCacheExpired()
    if (booksAlreadyCached && introsAlreadyCached && !isExpired) {
      return
    }
    if (isExpired && this.networkService.isOffline) {
      // Prefer stale data over wiping out offline reading when the refresh window
      // expires but the device has no connection.
      return
    }

    if (!booksAlreadyCached || isExpired) {
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

    // Standalone introductions are optional and fetched separately from the
    // books above, but a /*/intro page the user never visited while online
    // must still work offline — so cache them on the same refresh cycle,
    // independently of whether the books fetch above succeeded.
    // preloadGroupIntros fails closed on its own (logs, does not throw), so
    // a bad /intros response never masks a successful books preload.
    if (!introsAlreadyCached || isExpired) {
      await this.preloadGroupIntros()
    }
  }

  /**
   * Fetches every standalone introduction (whole Bible, testaments, groups
   * of books) and persists them as synthetic book records — id = slug, same
   * shape BookService.toIntroBook() builds — so a /*\/intro page the user
   * never visited while online still renders offline.
   */
  private async preloadGroupIntros(): Promise<void> {
    try {
      const summaries = await firstValueFrom(
        this.http.get<IntroSummary[]>(`${this.apiBase}/intros`),
      )
      // allSettled, not all: one slug failing (a transient error, a bad
      // record) must not throw away the other sixteen that fetched fine.
      const results = await Promise.allSettled(
        summaries.map((summary) =>
          firstValueFrom(
            this.http.get<GroupIntro>(
              `${this.apiBase}/intros/${encodeURIComponent(summary.slug)}`,
            ),
          ),
        ),
      )
      const fulfilled = results.filter(
        (result): result is PromiseFulfilledResult<GroupIntro> =>
          result.status === "fulfilled",
      )
      if (fulfilled.length) {
        const introBooks: Book[] = fulfilled.map(({ value: intro }) => ({
          id: intro.slug,
          name: intro.name,
          shortName: intro.name,
          abrv: intro.slug,
          chapterCount: 0,
          introSlug: intro.slug,
          introduction: intro.introduction,
        }))
        await this.setCachedBooks(introBooks)
      }

      const failedCount = results.length - fulfilled.length
      if (failedCount > 0) {
        console.error(
          `Failed to preload ${failedCount} of ${results.length} standalone introductions for offline use`,
        )
      } else {
        // Every introduction is cached — safe to skip the refetch until the
        // shared 40-day expiry (or a schema migration) clears this flag.
        safeLocalStorage()?.setItem(this.groupIntrosCacheFlagKey, "true")
      }
    } catch (error) {
      console.error(
        "Failed to preload group introductions for offline use",
        error,
      )
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
      // clearAndPutAll has just replaced the store with current-shape records,
      // so the schema is current whether or not the earlier migration managed
      // to clear it. Without this a failed migration leaves the key stale and
      // the next launch wipes these records and re-downloads the Bible.
      storage?.setItem(this.cacheSchemaKey, this.cacheSchemaVersion.toString())
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

  /** Cached listing of the standalone introductions, if any were preloaded. */
  async getCachedGroupIntroSummariesAsync(): Promise<IntroSummary[]> {
    const books = await this.getCachedBooksAsync()
    return books
      .filter((book) => !!book.introSlug)
      .map((book) => ({ slug: book.introSlug as string, name: book.name }))
  }

  /** Cached body of one standalone introduction, if it was preloaded. */
  async getCachedGroupIntroAsync(
    slug: string,
  ): Promise<GroupIntro | undefined> {
    const book = await this.getCachedBookAsync(slug)
    if (!book?.introSlug) return undefined
    return {
      slug: book.introSlug,
      name: book.name,
      introduction: book.introduction ?? [],
    }
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
      const merged: Book = {
        ...current,
        ...book,
        chapters: this.mergeChapterLists(book.chapters, current.chapters),
      }
      // Same protection mergeChapterLists gives a chapter introduction: a
      // shallow payload can carry introduction: [], which the spread would
      // write over an already-loaded body. BookService.toIntroBook() produces
      // exactly that shape, so an empty array is not a hypothetical.
      if (!book.introduction?.length && current.introduction?.length) {
        merged.introduction = current.introduction
      }
      byId.set(book.id, merged)
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

    const cachedByNumber = new Map<number, Chapter>()
    for (const chapter of current) {
      cachedByNumber.set(chapter.number, chapter)
    }

    const merged: Chapter[] = incoming.map((chapter) => {
      const cached = cachedByNumber.get(chapter.number)
      if (!cached) return chapter

      // Field-level merge: the fresh payload wins, except where it is a stub
      // that would drop richer content already cached for this chapter.
      const result: Chapter = { ...cached, ...chapter }
      if ((cached.verses?.length ?? 0) > (chapter.verses?.length ?? 0)) {
        result.verses = cached.verses
      }
      if (!chapter.introduction && cached.introduction) {
        result.introduction = cached.introduction
      }
      return result
    })

    const seen = new Set(incoming.map((chapter) => chapter.number))
    for (const chapter of current) {
      if (!seen.has(chapter.number)) merged.push(chapter)
    }
    // Chapter numbers are inherently ordered and the selector renders this
    // list as-is, so keep it ascending: a partial refresh would otherwise
    // leave cached-only chapters stranded at the end (1, 3, 2).
    return merged.sort((a, b) => a.number - b.number)
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
          // so expose nothing. cachedBooks stays null so the next caller
          // retries the migration instead of latching an empty cache.
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
          storage.removeItem(this.groupIntrosCacheFlagKey)
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
