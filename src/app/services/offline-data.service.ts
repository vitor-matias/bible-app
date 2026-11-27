import { HttpClient } from "@angular/common/http"
import { Injectable, inject, type OnDestroy } from "@angular/core"
import { Capacitor } from "@capacitor/core"
import { filter, firstValueFrom, takeUntil, timeout } from "rxjs"
import { apiBaseUrl } from "../config"
import { safeLocalStorage } from "../utils/web-storage"
import { AnalyticsService } from "./analytics.service"
import { DatabaseService } from "./database.service"
import { NetworkService } from "./network.service"

/**
 * Long, for the whole Bible on a slow connection; but a stalled request must
 * end, as later preloads wait for the one under way.
 */
export const PRELOAD_TIMEOUT_MS = 5 * 60_000

/** First wait before a failed download is tried again; it doubles each time. */
export const PRELOAD_RETRY_BASE_MS = 30_000
export const PRELOAD_RETRY_MAX_MS = 30 * 60_000

@Injectable({
  providedIn: "root",
})
export class OfflineDataService implements OnDestroy {
  private http = inject(HttpClient)
  private databaseService = inject(DatabaseService)
  private networkService = inject(NetworkService)
  private analyticsService = inject(AnalyticsService)

  private cacheFlagKey = "booksCacheReady"
  private groupIntrosCacheFlagKey = "groupIntrosCacheReady"
  private cacheTimestampKey = "booksCacheTimestamp"
  // The API's hash of the catalog the cache holds (/v1/books/hash).
  private cacheHashKey = "booksCacheHash"
  private cacheSchemaKey = "booksCacheSchemaVersion"
  // Bump when the persisted Book/Chapter/Verse shape changes incompatibly, so
  // stale IndexedDB records are dropped and re-cached.
  private readonly cacheSchemaVersion = 2
  private cacheMaxAgeMs = 1000 * 60 * 60 * 24 * 40 // 40 days
  private cachedBooks: Book[] | null = null
  private apiBase = apiBaseUrl
  private cacheLoadPromise: Promise<void> | null = null
  private migrationPromise: Promise<boolean> | null = null
  private preloadPromise: Promise<void> | null = null
  private retryTimer?: ReturnType<typeof setTimeout>
  private retryDelayMs = PRELOAD_RETRY_BASE_MS
  /** IndexedDB refused a write: downloading again would only fail to store it. */
  private storageFailed = false
  /** The last introductions download left some out; the flag can't say so without localStorage. */
  private introsIncomplete = false
  /** Torn down: a late failure or a refresh in flight must not arm another retry. */
  private destroyed = false

  /**
   * Fetches all books and chapters into IndexedDB for offline usage.
   * Subsequent calls are skipped once the data is cached.
   */
  preloadAllBooksAndChapters(): Promise<void> {
    // Joining a run that is ending must not cancel the retry it just armed.
    if (this.preloadPromise) return this.preloadPromise
    clearTimeout(this.retryTimer)
    this.preloadPromise = this.runPreload()
      .then((failed) => this.scheduleRetry(failed))
      .finally(() => {
        this.preloadPromise = null
      })
    return this.preloadPromise
  }

  /** Whether the Bible was downloaded on an earlier visit, by its flag: reading the records takes a while. */
  isBibleDownloaded(): boolean {
    return safeLocalStorage()?.getItem(this.cacheFlagKey) === "true"
  }

  ngOnDestroy(): void {
    this.destroyed = true
    clearTimeout(this.retryTimer)
  }

  /** A failed download is tried again while the app stays open, less and less often. */
  private scheduleRetry(failed: boolean): void {
    if (!failed || this.storageFailed) {
      this.retryDelayMs = PRELOAD_RETRY_BASE_MS
      return
    }
    this.armRetry(this.retryDelayMs)
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, PRELOAD_RETRY_MAX_MS)
  }

  private armRetry(delayMs: number): void {
    if (this.destroyed) return
    this.retryTimer = setTimeout(async () => {
      // In the background the listener can miss a reconnect: ask, and while
      // offline keep asking.
      await this.networkService.refresh()
      if (this.destroyed) return
      if (this.networkService.isOffline) this.armRetry(delayMs)
      else void this.preloadAllBooksAndChapters()
    }, delayMs)
  }

  /**
   * A preload request. Going offline cancels it: a connection that drops
   * mid-download can leave the request hanging until the timeout, and the
   * reconnect would join it instead of starting again.
   */
  private fetch<T>(url: string) {
    return firstValueFrom(
      this.http
        .get<T>(url, { headers: this.preloadHeaders() })
        .pipe(
          timeout(PRELOAD_TIMEOUT_MS),
          takeUntil(this.networkService.isOffline$.pipe(filter(Boolean))),
        ),
    )
  }

  /** Resolves to whether a download failed, and so is worth retrying. */
  private async runPreload(): Promise<boolean> {
    // Until the next launch: each try would download the Bible again.
    if (typeof window === "undefined" || this.storageFailed) return false
    // Without localStorage nothing could tell when the cache went stale (its
    // age, the catalog's hash), so there is none: chapters come from the API.
    const storage = safeLocalStorage()
    if (!storage) return false

    const migrated = await this.migrateCacheIfNeeded()

    // Flags are untrustworthy after a failed migration (reads fail closed).
    // They also outlive records wiped from IndexedDB alone, so they count
    // only while the records are there; a store that can't be read leaves
    // them the last word, or every launch would download the Bible again.
    await this.ensureCacheLoaded()
    const records = this.cachedBooks
    const holds = (intro: boolean) =>
      records ? records.some((book) => !!book.introSlug === intro) : true
    // Gated independently so a failed /intros fetch never forces a redownload
    // of the multi-megabyte books payload.
    const booksAlreadyCached =
      migrated && storage.getItem(this.cacheFlagKey) === "true" && holds(false)
    const introsAlreadyCached =
      migrated &&
      !this.introsIncomplete &&
      this.areGroupIntrosCached() &&
      holds(true)
    const isExpired = this.isCacheExpired()
    if (isExpired && this.networkService.isOffline) {
      // Offline: prefer stale data over losing offline reading.
      return false
    }
    // A reimport that changed the data (Ester's numbered additions, say)
    // reaches a cache before it expires. Offline, or with no answer, the
    // cache is kept.
    const hash = this.networkService.isOffline
      ? undefined
      : await this.fetchCatalogHash()
    const catalogChanged = !!hash && storage.getItem(this.cacheHashKey) !== hash
    if (
      booksAlreadyCached &&
      introsAlreadyCached &&
      !isExpired &&
      !catalogChanged
    ) {
      return false
    }

    let failed = false
    // The introductions are fetched again too: the books restart the shared
    // 40-day clock, and a reimport may have changed them.
    const refreshIntros = isExpired || catalogChanged
    if (!booksAlreadyCached || refreshIntros) {
      let books: Book[] | undefined
      try {
        books = await this.fetch<Book[]>(
          `${this.apiBase}/books?withChapters=true`,
        )
        // An empty 200 parses as null: a failed download, worth retrying.
        if (!Array.isArray(books) || !books.length) {
          books = undefined
          throw new Error("Unexpected response for the books download")
        }
      } catch (error) {
        failed = true
        console.error("Failed to preload books for offline use", error)
      }
      // Not retried if storing fails (setCachedBooks): it would download
      // the Bible again.
      if (books) {
        try {
          // Until this run fetches them again: an app closed before then
          // would keep the old ones under the restarted clock.
          if (refreshIntros) storage.removeItem(this.groupIntrosCacheFlagKey)
          await this.setCachedBooks(books)
          this.storeCatalogHash(storage, hash)
          this.trackBooksCachedEvent()
        } catch (error) {
          console.error("Failed to preload books for offline use", error)
        }
      }
    }

    // preloadGroupIntros logs instead of throwing, so a bad /intros response
    // never masks a successful books preload.
    if (!introsAlreadyCached || refreshIntros) {
      this.introsIncomplete = !(await this.preloadGroupIntros())
      failed = this.introsIncomplete || failed
    }
    return failed
  }

  /** The API's hash of the catalog, or undefined when it has none to give. */
  fetchCatalogHash(): Promise<string | undefined> {
    return this.fetch<{ hash?: string }>(`${this.apiBase}/books/hash`).then(
      (answer) => answer?.hash || undefined,
      () => undefined,
    )
  }

  /**
   * The hash of the books just stored, or none when it wasn't retrieved: the
   * replaced catalog's hash would vouch for them if the API went back to it.
   * A failed write stops further downloads this session, as setCachedBooks
   * does: each one would find the same mismatch.
   */
  private storeCatalogHash(storage: Storage, hash: string | undefined) {
    try {
      if (hash) storage.setItem(this.cacheHashKey, hash)
      else storage.removeItem(this.cacheHashKey)
    } catch (error) {
      this.storageFailed = true
      throw error
    }
  }

  /** Past the service worker, which would answer from its own copy. */
  private preloadHeaders(): Record<string, string> {
    // Native is cross-origin, where a custom header forces a CORS preflight.
    return Capacitor.isNativePlatform() ? {} : { "ngsw-bypass": "true" }
  }

  /** Whether the last introductions preload cached every one of them. */
  areGroupIntrosCached(): boolean {
    return safeLocalStorage()?.getItem(this.groupIntrosCacheFlagKey) === "true"
  }

  /**
   * Caches every standalone introduction as a synthetic book record (id =
   * slug, same shape as BookService.toIntroBook()) for offline /intro pages.
   * Resolves to whether every one of them was fetched.
   */
  private async preloadGroupIntros(): Promise<boolean> {
    try {
      const summaries = await this.fetch<IntroSummary[]>(
        `${this.apiBase}/intros`,
      )
      // allSettled: one failing slug must not discard the rest.
      const results = await Promise.allSettled(
        summaries.map((summary) =>
          this.fetch<GroupIntro>(
            `${this.apiBase}/intros/${encodeURIComponent(summary.slug)}`,
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
        // Intro-only write: must not mark the (possibly never-fetched) books
        // as cached and fresh.
        await this.setCachedBooks(introBooks, { markBooksReady: false })
      }

      const failedCount = results.length - fulfilled.length
      if (failedCount > 0) {
        // A flag left over from an earlier complete preload would vouch for
        // this incomplete refresh.
        safeLocalStorage()?.removeItem(this.groupIntrosCacheFlagKey)
        console.error(
          `Failed to preload ${failedCount} of ${results.length} standalone introductions for offline use`,
        )
        return false
      }
      safeLocalStorage()?.setItem(this.groupIntrosCacheFlagKey, "true")
      return true
    } catch (error) {
      // An expired refresh stores the books with a new timestamp: a flag left
      // from before would make the retry skip the introductions.
      safeLocalStorage()?.removeItem(this.groupIntrosCacheFlagKey)
      console.error(
        "Failed to preload group introductions for offline use",
        error,
      )
      return false
    }
  }

  async setCachedBooks(
    books: Book[],
    { markBooksReady = true }: { markBooksReady?: boolean } = {},
  ): Promise<void> {
    // Merge into whatever IndexedDB already holds; the load never rejects.
    await this.ensureCacheLoaded()

    const existingBooks = this.cachedBooks ?? []
    this.cachedBooks = [
      ...new Map(
        [...existingBooks, ...books].map((book) => [book.id, book]),
      ).values(),
    ]
    // localStorage only holds metadata; without it, still persist to IndexedDB.
    const storage = safeLocalStorage()

    try {
      await this.saveBooksToIndexedDb(this.cachedBooks)
      // The store now holds current-shape records even if the migration
      // failed; a stale key would make the next launch wipe them.
      storage?.setItem(this.cacheSchemaKey, this.cacheSchemaVersion.toString())
      if (markBooksReady) {
        storage?.setItem(this.cacheTimestampKey, Date.now().toString())
        storage?.setItem(this.cacheFlagKey, "true")
      }
    } catch (error) {
      this.storageFailed = true
      console.error("Failed to persist cached books or metadata", error)
      throw error
    }
  }

  async getCachedBooksAsync(): Promise<Book[]> {
    await this.ensureCacheLoaded()
    return this.cachedBooks ?? []
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

  async getCachedChapterAsync(
    bookId: Book["id"],
    chapterNumber: Chapter["number"],
  ): Promise<Chapter | undefined> {
    const book = await this.getCachedBookAsync(bookId)
    return book?.chapters?.find((chapter) => chapter.number === chapterNumber)
  }

  async getCachedVerseAsync(
    bookId: Book["id"],
    chapterNumber: Chapter["number"],
    verseNumber: Verse["number"],
  ): Promise<Verse | undefined> {
    const chapter = await this.getCachedChapterAsync(bookId, chapterNumber)
    return chapter?.verses?.find((verse) => verse.number === verseNumber)
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
          // Fail closed on stale-schema records; cachedBooks stays null so the
          // next caller retries the migration.
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
   * Drops persisted books written with an incompatible Book shape. Resolves to
   * false when they could not be cleared; callers must then not read the store.
   */
  private migrateCacheIfNeeded(): Promise<boolean> {
    // Without localStorage (as in prerender workers, whose Node defines one
    // whose methods throw) the store is not read: it could be any age.
    const storage = safeLocalStorage()
    if (!storage) return Promise.resolve(false)
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
          storage.removeItem(this.cacheHashKey)
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

  private trackBooksCachedEvent() {
    void this.analyticsService.track("pwa_books_cached", {
      source: "standalone",
    })
  }
}
