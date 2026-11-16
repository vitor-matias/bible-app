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

  /**
   * Fetches all books and chapters into IndexedDB for offline usage.
   * Subsequent calls are skipped once the data is cached.
   */
  preloadAllBooksAndChapters(): Promise<void> {
    clearTimeout(this.retryTimer)
    this.preloadPromise ??= this.runPreload()
      .then((failed) => this.scheduleRetry(failed))
      .finally(() => {
        this.preloadPromise = null
      })
    return this.preloadPromise
  }

  ngOnDestroy(): void {
    clearTimeout(this.retryTimer)
  }

  /** A failed download is tried again while the app stays open, less and less often. */
  private scheduleRetry(failed: boolean): void {
    if (!failed) {
      this.retryDelayMs = PRELOAD_RETRY_BASE_MS
      return
    }
    this.retryTimer = setTimeout(() => {
      // Offline, the reconnect starts it (NetworkService).
      if (!this.networkService.isOffline) {
        void this.preloadAllBooksAndChapters()
      }
    }, this.retryDelayMs)
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, PRELOAD_RETRY_MAX_MS)
  }

  /**
   * A preload request. Going offline cancels it: a connection that drops
   * mid-download can leave the request hanging until the timeout, and the
   * reconnect would join it instead of starting again.
   */
  private fetch<T>(url: string, headers: Record<string, string> = {}) {
    return firstValueFrom(
      this.http
        .get<T>(url, { headers })
        .pipe(
          timeout(PRELOAD_TIMEOUT_MS),
          takeUntil(this.networkService.isOffline$.pipe(filter(Boolean))),
        ),
    )
  }

  /** Resolves to whether a download failed, and so is worth retrying. */
  private async runPreload(): Promise<boolean> {
    if (typeof window === "undefined") return false

    const migrated = await this.migrateCacheIfNeeded()
    const storage = safeLocalStorage()

    // Flags are untrustworthy after a failed migration (reads fail closed).
    // Without localStorage, infer readiness from the IndexedDB records.
    const fallbackBooks = storage ? null : await this.getCachedBooksAsync()
    // Gated independently so a failed /intros fetch never forces a redownload
    // of the multi-megabyte books payload.
    const booksAlreadyCached =
      migrated &&
      (storage
        ? storage.getItem(this.cacheFlagKey) === "true"
        : (fallbackBooks ?? []).some((book) => !book.introSlug))
    const introsAlreadyCached =
      migrated &&
      (storage
        ? this.areGroupIntrosCached()
        : (fallbackBooks ?? []).some((book) => !!book.introSlug))
    const isExpired = this.isCacheExpired()
    if (booksAlreadyCached && introsAlreadyCached && !isExpired) {
      return false
    }
    if (isExpired && this.networkService.isOffline) {
      // Offline: prefer stale data over losing offline reading.
      return false
    }

    let failed = false
    if (!booksAlreadyCached || isExpired) {
      let books: Book[] | undefined
      try {
        books = await this.fetch<Book[]>(
          `${this.apiBase}/books?withChapters=true`,
          // Native is cross-origin, where a custom header forces a CORS preflight.
          Capacitor.isNativePlatform() ? {} : { "ngsw-bypass": "true" },
        )
      } catch (error) {
        failed = true
        console.error("Failed to preload books for offline use", error)
      }
      // Not retried if storing fails: it would download the Bible again.
      if (books) {
        try {
          await this.setCachedBooks(books)
          this.trackBooksCachedEvent()
        } catch (error) {
          console.error("Failed to preload books for offline use", error)
        }
      }
    }

    // preloadGroupIntros logs instead of throwing, so a bad /intros response
    // never masks a successful books preload.
    if (!introsAlreadyCached || isExpired) {
      failed = !(await this.preloadGroupIntros()) || failed
    }
    return failed
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
    // Prerender workers' Node defines a localStorage whose methods throw.
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

  private trackBooksCachedEvent() {
    void this.analyticsService.track("pwa_books_cached", {
      source: "standalone",
    })
  }
}
