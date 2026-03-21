import { Injectable } from "@angular/core"
import { BehaviorSubject, type Observable } from "rxjs"
import { map } from "rxjs/operators"
import { DatabaseService } from "./database.service"

@Injectable({
  providedIn: "root",
})
export class BookmarkService {
  private bookmarksSubject = new BehaviorSubject<Bookmark[]>([])
  bookmarks$ = this.bookmarksSubject.asObservable()
  private updatePromise: Promise<void> = Promise.resolve()
  initialized: Promise<void>

  constructor(private databaseService: DatabaseService) {
    this.initialized = this.init()
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

  getBookmarks(): Bookmark[] {
    return [...this.bookmarksSubject.value]
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

  isBookmarked(bookId: string, chapter: number): boolean {
    return !!this.getBookmark(bookId, chapter)
  }

  async addBookmark(
    bookId: string,
    chapter: number,
    color: string,
  ): Promise<void> {
    this.updatePromise = this.updatePromise.then(async () => {
      const currentBookmarks = this.bookmarksSubject.value
      // Filter out any existing bookmark with the same color
      const bookmarksWithoutConflict = currentBookmarks.filter(
        (b) => b.color !== color,
      )

      // Check if we are updating an existing bookmark (same location)
      const existingIndex = bookmarksWithoutConflict.findIndex(
        (b) => b.bookId === bookId && b.chapter === chapter,
      )

      const newBookmark: Bookmark = {
        bookId,
        chapter,
        color,
        timestamp: Date.now(),
      }

      let updatedBookmarks: Bookmark[]

      if (existingIndex > -1) {
        // Update existing bookmark (e.g. changing color, though color is unique now, so this path is technically assigning a new unique color to an existing location)
        updatedBookmarks = [...bookmarksWithoutConflict]
        updatedBookmarks[existingIndex] = newBookmark
      } else {
        // Add new bookmark
        updatedBookmarks = [...bookmarksWithoutConflict, newBookmark]
      }

      await this.saveBookmarks(updatedBookmarks)
    })
    return this.updatePromise
  }

  async removeBookmark(bookId: string, chapter: number): Promise<void> {
    this.updatePromise = this.updatePromise.then(async () => {
      const currentBookmarks = this.bookmarksSubject.value
      const updatedBookmarks = currentBookmarks.filter(
        (b) => !(b.bookId === bookId && b.chapter === chapter),
      )
      await this.saveBookmarks(updatedBookmarks)
    })
    return this.updatePromise
  }

  private async saveBookmarks(bookmarks: Bookmark[]) {
    try {
      await this.databaseService.clearAndPutAll("bookmarks", bookmarks)
      this.bookmarksSubject.next(bookmarks)
    } catch (error) {
      console.error("Failed to save bookmarks to database:", error)
      throw error
    }
  }
}
