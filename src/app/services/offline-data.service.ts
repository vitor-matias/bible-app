// biome-ignore lint/style/useImportType: <explanation>
import { HttpClient } from "@angular/common/http"
import { Injectable } from "@angular/core"
import { firstValueFrom } from "rxjs"

@Injectable({
  providedIn: "root",
})
export class OfflineDataService {
  private cacheFlagKey = "booksCacheReady"
  private cacheDataKey = "booksCacheData"
  private cacheVersionKey = "booksCacheVersion"
  private cachedBooks: Book[] | null = null
  private cachedVersion: string | null = null
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
    if (isAlreadyCached) return

    try {
      const books = await firstValueFrom(
        this.http.get<Book[]>(`${this.apiBase}/books?withChapters=true`),
      )
      this.setCachedBooks(books)
      localStorage.setItem(this.cacheFlagKey, "true")
      this.trackUmamiInstallEvent(source)
    } catch (error) {
      console.error("Failed to preload books for offline use", error)
    }
  }

  setCachedBooks(books: Book[]) {
    const version = this.computeVersion(books)
    if(version.split(":").some(part => Number.isNaN(Number(part)) || Number(part) <= 0)) {
      return
    }
    if (typeof localStorage === "undefined") return
    this.cachedBooks = this.mergeCachedBooks(this.getCachedBooks(), books)
    this.saveBooksToIndexedDb(this.cachedBooks).catch((error) => {
      console.error("Failed to persist cached books to IndexedDB", error)
    })
    try {
      localStorage.setItem(this.cacheFlagKey, "true")
      localStorage.setItem(this.cacheVersionKey, version)
    } catch (error) {
      console.error("Failed to persist cache metadata", error)
    }
  }

  getCachedBooks(): Book[] {
    this.ensureCacheLoaded()
    if (this.cachedBooks) return this.cachedBooks
    if (typeof localStorage === "undefined") return []
    this.cachedVersion = localStorage.getItem(this.cacheVersionKey)
    return []
  }

  getCachedBook(bookId: Book["id"]): Book | undefined {
    return this.getCachedBooks().find((book) => book.id === bookId)
  }

  getCachedChapter(
    bookId: Book["id"],
    chapterNumber: Chapter["number"],
  ): Chapter | undefined {
    const book = this.getCachedBook(bookId)
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
          ? (book.chapters && book.chapters.length > 0
              ? book.chapters
              : current.chapters) ?? []
          : undefined
      byId.set(book.id, { ...current, ...book, chapters })
    }
    return Array.from(byId.values())
  }

  private ensureCacheLoaded(): Promise<void> {
    if (this.cachedBooks) return Promise.resolve()
    if (!this.cacheLoadPromise) {
      this.cacheLoadPromise = this.loadBooksFromIndexedDb().catch((error) => {
        console.error("Failed to load cached books from IndexedDB", error)
      }).then(() => {
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
          this.cachedVersion = localStorage.getItem(this.cacheVersionKey)
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
      store.clear()

      let pending = books.length
      if (pending === 0) {
        resolve()
        return
      }

      const onComplete = () => {
        pending -= 1
        if (pending === 0) {
          const version = this.computeVersion(books)
          try {
            localStorage.setItem(this.cacheVersionKey, version)
          } catch (error) {
            console.error("Failed to persist cache version", error)
          }
          resolve()
        }
      }

      for (const book of books) {
        const request = store.put(book)
        request.onsuccess = onComplete
        request.onerror = () => reject(request.error)
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

  private computeVersion(books: Book[]): string {
    // Simple hash-like version using counts; robust enough to detect changes
    const totalChapters = books.reduce(
      (acc, book) => acc + (book.chapters?.length || 0),
      0,
    )
    const totalVerses = books.reduce(
      (acc, book) =>
        acc +
        (book.chapters?.reduce(
          (cAcc, chapter) => cAcc + (chapter.verses?.length || 0),
          0,
        ) || 0),
      0,
    )
    return `${books.length}:${totalChapters}:${totalVerses}`
  }

  private trackUmamiInstallEvent(source: "install" | "standalone") {
    if (source !== "install") return
    // @ts-ignore
    const umami = typeof window !== "undefined" ? window.umami : undefined
    if (umami?.track) {
      umami.track("pwa_books_cached_after_install")
    }
  }
}
