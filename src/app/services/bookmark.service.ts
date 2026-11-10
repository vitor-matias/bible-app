import { Injectable, inject } from "@angular/core"
import { BehaviorSubject, type Observable } from "rxjs"
import { map } from "rxjs/operators"
import { DatabaseService } from "./database.service"

@Injectable({
  providedIn: "root",
})
export class BookmarkService {
  private databaseService = inject(DatabaseService)

  private bookmarksSubject = new BehaviorSubject<Bookmark[]>([])
  bookmarks$ = this.bookmarksSubject.asObservable()
  private updatePromise: Promise<void>
  initialized: Promise<void>

  constructor() {
    this.initialized = this.init()
    this.updatePromise = this.initialized
  }

  private async init() {
    await this.loadBookmarks()
  }

  private async loadBookmarks() {
    try {
      const bookmarks = await this.databaseService.getAll<Bookmark>("bookmarks")
      this.bookmarksSubject.next(bookmarks || [])
    } catch (error) {
      console.error("Failed to load bookmarks from database:", error)
      this.bookmarksSubject.next([])
    }
  }

  getBookmarksForBook(bookId: string): Observable<Bookmark[]> {
    return this.bookmarks$.pipe(
      map((bookmarks) => bookmarks.filter((b) => b.bookId === bookId)),
    )
  }

  getBookmark(bookId: string, chapter: number): Bookmark | undefined {
    const found = this.bookmarksSubject.value.find(
      (b) => b.bookId === bookId && b.chapter === chapter,
    )
    return found ? { ...found } : undefined
  }

  addBookmark(bookId: string, chapter: number, color: string): Promise<void> {
    return this.save((currentBookmarks) => {
      // A colour marks one chapter, and a chapter carries one colour.
      const bookmarksWithoutConflict = currentBookmarks.filter(
        (b) => b.color !== color,
      )
      const existingIndex = bookmarksWithoutConflict.findIndex(
        (b) => b.bookId === bookId && b.chapter === chapter,
      )
      const newBookmark: Bookmark = {
        bookId,
        chapter,
        color,
        timestamp: Date.now(),
      }
      if (existingIndex === -1) {
        return [...bookmarksWithoutConflict, newBookmark]
      }
      const updatedBookmarks = [...bookmarksWithoutConflict]
      updatedBookmarks[existingIndex] = newBookmark
      return updatedBookmarks
    })
  }

  removeBookmark(bookId: string, chapter: number): Promise<void> {
    return this.save((currentBookmarks) =>
      currentBookmarks.filter(
        (b) => !(b.bookId === bookId && b.chapter === chapter),
      ),
    )
  }

  /**
   * Applies `change` to the ribbons as stored, not as this tab last saw them:
   * another tab, or a load that failed, would otherwise leave a stale list
   * deciding which records go.
   */
  private save(change: (bookmarks: Bookmark[]) => Bookmark[]): Promise<void> {
    this.updatePromise = this.updatePromise
      .catch(() => {})
      .then(async () => {
        try {
          const saved =
            (await this.databaseService.update<Bookmark>(
              "bookmarks",
              (b) => [b.bookId, b.chapter],
              change,
            )) ?? change(this.bookmarksSubject.value)
          this.bookmarksSubject.next(saved)
        } catch (error) {
          console.error("Failed to save bookmarks to database:", error)
          throw error
        }
      })
    return this.updatePromise
  }
}
