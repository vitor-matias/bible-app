// biome-ignore lint/style/useImportType: HttpClient must be imported as a value for Angular DI in constructor
import { HttpClient } from "@angular/common/http"
import { Injectable } from "@angular/core"
import { firstValueFrom } from "rxjs"

@Injectable({
  providedIn: "root",
})
export class OfflineDataService {
  private cacheFlagKey = "booksCacheReady"
  private cacheTimestampKey = "booksCacheTimestamp"
  private cacheMaxAgeMs = 1000 * 60 * 60 * 24 * 90 // 90 days
  private cachedBooks: Book[] | null = null
  private apiBase = "v1"
  private cacheLoadPromise: Promise<void> | null = null

  constructor(private http: HttpClient) {}

  /**
   * Fetches all books and chapters so they are stored by the Service Worker
   * for offline usage. Subsequent calls are skipped once the data is cached.
   */
  async preloadAllBooksAndChapters(
    source: "install" | "standalone" = "standalone",
  ): Promise<void> {
    if (typeof window === "undefined") return

    const isAlreadyCached = localStorage.getItem(this.cacheFlagKey) === "true"
    const isExpired = this.isCacheExpired()
    if (isAlreadyCached && !isExpired) {
      return
    }
    if (isExpired && typeof navigator !== "undefined" && !navigator.onLine) {
      // Keep using stale cache until we can refresh online
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
      const chapters =
        book.chapters?.length || current.chapters?.length
          ? ((book.chapters && book.chapters.length > 0
              ? book.chapters
              : current.chapters) ?? [])
          : undefined
      byId.set(book.id, { ...current, ...book, chapters })
    }
    return Array.from(byId.values())
  }

  private ensureCacheLoaded(): Promise<void> {
    if (this.cachedBooks) return Promise.resolve()
    if (!this.cacheLoadPromise) {
      this.cacheLoadPromise = this.loadBooksFromIndexedDb()
        .catch((error) => {
          console.error("Failed to load cached books from IndexedDB", error)
        })
        .then(() => {
          this.cacheLoadPromise = null
        })
    }
    return this.cacheLoadPromise || Promise.resolve()
  }

  private async loadBooksFromIndexedDb(): Promise<void> {
    if (typeof indexedDB === "undefined") return
    const db = await this.openDatabase()
    if (!db) return

    await new Promise<void>((resolve) => {
      const transaction = db.transaction("books", "readonly")
      const store = transaction.objectStore("books")
      const request = store.getAll()
      request.onsuccess = () => {
        const records = request.result as Book[]
        if (records?.length) {
          this.cachedBooks = records
        }
        resolve()
      }
      request.onerror = () => resolve()
    })
  }

  private async saveBooksToIndexedDb(books: Book[]): Promise<void> {
    if (typeof indexedDB === "undefined") return
    const db = await this.openDatabase()
    if (!db) return

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("books", "readwrite")
      const store = transaction.objectStore("books")
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)

      store.clear()
      for (const book of books) {
        store.put(book)
      }
    })
  }

  private openDatabase(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
      const request = indexedDB.open("offline-bible", 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains("books")) {
          db.createObjectStore("books", { keyPath: "id" })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    })
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
    // @ts-expect-error: `umami` is injected on `window` by the Umami analytics script at runtime
    const umami = typeof window !== "undefined" ? window.umami : undefined
    if (umami?.track) {
      umami.track("pwa_books_cached", { source })
    }
  }
}
