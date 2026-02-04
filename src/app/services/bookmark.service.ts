import { Injectable } from "@angular/core"
import { BehaviorSubject, type Observable } from "rxjs"
import { map } from "rxjs/operators"
import { PreferencesService } from "./preferences.service"

@Injectable({
  providedIn: "root",
})
export class BookmarkService {
  private bookmarksSubject = new BehaviorSubject<Bookmark[]>([])
  bookmarks$ = this.bookmarksSubject.asObservable()

  constructor(private preferencesService: PreferencesService) {
    this.loadBookmarks()
  }

  private loadBookmarks() {
    const bookmarks = this.preferencesService.getBookmarks()
    this.bookmarksSubject.next(bookmarks)
  }

  getBookmarks(): Bookmark[] {
    return this.bookmarksSubject.value
  }

  getBookmarksForBook(bookId: string): Observable<Bookmark[]> {
    return this.bookmarks$.pipe(
      map((bookmarks) => bookmarks.filter((b) => b.bookId === bookId)),
    )
  }

  getBookmark(bookId: string, chapter: number): Bookmark | undefined {
    return this.bookmarksSubject.value.find(
      (b) => b.bookId === bookId && b.chapter === chapter,
    )
  }

  isBookmarked(bookId: string, chapter: number): boolean {
    return !!this.getBookmark(bookId, chapter)
  }

  addBookmark(bookId: string, chapter: number, color: string): void {
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

    this.saveBookmarks(updatedBookmarks)
  }

  removeBookmark(bookId: string, chapter: number): void {
    const currentBookmarks = this.bookmarksSubject.value
    const updatedBookmarks = currentBookmarks.filter(
      (b) => !(b.bookId === bookId && b.chapter === chapter),
    )
    this.saveBookmarks(updatedBookmarks)
  }

  private saveBookmarks(bookmarks: Bookmark[]) {
    this.preferencesService.setBookmarks(bookmarks)
    this.bookmarksSubject.next(bookmarks)
  }
}
