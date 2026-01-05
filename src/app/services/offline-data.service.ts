import { Injectable } from "@angular/core"
import { firstValueFrom } from "rxjs"
import { BibleApiService } from "./bible-api.service"

@Injectable({
  providedIn: "root",
})
export class OfflineDataService {
  private cacheFlagKey = "booksCacheReady"
  private cacheDataKey = "booksCacheData"
  private cacheVersionKey = "booksCacheVersion"
  private cachedBooks: Book[] | null = null
  private cachedVersion: string | null = null

  constructor(private bibleApiService: BibleApiService) {}

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
        this.bibleApiService.getAllBooksAndChapters(),
      )
      this.setCachedBooks(books)
      localStorage.setItem(this.cacheFlagKey, "true")
      this.trackUmamiInstallEvent(source)
    } catch (error) {
      console.error("Failed to preload books for offline use", error)
    }
  }

  setCachedBooks(books: Book[]) {
    if (typeof localStorage === "undefined") return
    this.cachedBooks = this.mergeCachedBooks(this.getCachedBooks(), books)
    try {
      localStorage.setItem(this.cacheDataKey, JSON.stringify(this.cachedBooks))
      localStorage.setItem(this.cacheFlagKey, "true")
      localStorage.setItem(this.cacheVersionKey, this.computeVersion(this.cachedBooks))
    } catch (error) {
      console.error("Failed to persist cached books", error)
    }
  }

  getCachedBooks(): Book[] {
    if (this.cachedBooks) return this.cachedBooks
    if (typeof localStorage === "undefined") return []
    const raw = localStorage.getItem(this.cacheDataKey)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw) as Book[]
      this.cachedBooks = parsed
      this.cachedVersion = localStorage.getItem(this.cacheVersionKey)
      return parsed
    } catch (error) {
      console.error("Failed to parse cached books", error)
      return []
    }
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
