import { Injectable, inject } from "@angular/core"
import { Subscription } from "rxjs"
import {
  bookmarksSheetState,
  canMark,
  sheetPassageLabel,
} from "../utils/bookmarks-sheet"
import { BookService } from "./book.service"
import { BookmarkService } from "./bookmark.service"
import {
  BookmarkRibbonsService,
  type RibbonState,
} from "./bookmark-ribbons.service"
import { NativeChromeService } from "./native-chrome.service"

/**
 * The bookmarks panel as a native sheet in the iOS and Android apps. The sheet only draws
 * and reports taps; the ribbons' rules stay in BookmarkRibbonsService, and
 * the sheet is refreshed whenever the stored bookmarks change.
 */
@Injectable({
  providedIn: "root",
})
export class NativeBookmarksService {
  private readonly nativeChrome = inject(NativeChromeService)
  private readonly ribbonsService = inject(BookmarkRibbonsService)
  private readonly bookmarkService = inject(BookmarkService)
  private readonly bookService = inject(BookService)
  private readonly books = (bookId: string) =>
    this.bookService.findBookById(bookId)
  private session?: Subscription

  /** Opens the sheet for the chapter being read. */
  open(bookId: string, chapter: number): void {
    this.session?.unsubscribe()
    const session = new Subscription()
    this.session = session
    let ribbons: RibbonState[] = []
    const mover = this.ribbonsService.moveTo(bookId, chapter)
    let shown = false
    // Until this sheet is up, a bookmarks-closed is the last one's: the
    // shell waits for a sheet on its way out to go before presenting.
    let presented = false

    session.add(
      this.bookmarkService.bookmarks$.subscribe((bookmarks) => {
        ribbons = this.ribbonsService.ribbons(bookmarks)
        const state = bookmarksSheetState(
          ribbons,
          bookId,
          chapter,
          mover,
          (id, number) => sheetPassageLabel(this.books, id, number),
        )
        if (shown) {
          this.nativeChrome.updateBookmarks(state)
        } else {
          shown = true
          // Over another sheet none comes up, and no bookmarks-closed would
          // end this.
          void this.nativeChrome.showBookmarks(state).then((up) => {
            presented = up
            if (!up) session.unsubscribe()
          })
        }
      }),
    )

    session.add(
      this.nativeChrome.actions$.subscribe((action) => {
        switch (action.id) {
          case "bookmarks-closed":
            if (presented) session.unsubscribe()
            break
          case "bookmark-open":
          case "bookmark-set":
          case "bookmark-remove":
          case "bookmark-move": {
            const ribbon = ribbons.find((r) => r.value === action.color)
            if (!ribbon) return
            if (action.id === "bookmark-open") this.ribbonsService.open(ribbon)
            if (action.id === "bookmark-remove")
              this.ribbonsService.remove(ribbon)
            if (action.id === "bookmark-set" && canMark(bookId))
              this.ribbonsService.assign(ribbon.value, bookId, chapter)
            if (action.id === "bookmark-move" && canMark(bookId))
              mover.move(ribbon)
            break
          }
          case "bookmark-undo":
            mover.undo(action.color)
            break
        }
      }),
    )
  }
}
