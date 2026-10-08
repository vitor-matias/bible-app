import { Injectable, inject } from "@angular/core"
import { Subscription } from "rxjs"
import { passageLabel } from "../utils/passage-label"
import { BookService } from "./book.service"
import { BookmarkService } from "./bookmark.service"
import {
  BookmarkRibbonsService,
  RIBBON_COLORS,
  type RibbonState,
} from "./bookmark-ribbons.service"
import {
  type BookmarksSheetState,
  NativeChromeService,
} from "./native-chrome.service"

/**
 * The bookmarks panel as a native sheet in the iOS app. The sheet only draws
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
  private session?: Subscription

  /** Opens the sheet for the chapter being read. */
  open(bookId: string, chapter: number): void {
    this.session?.unsubscribe()
    const session = new Subscription()
    this.session = session
    let ribbons: RibbonState[] = []
    let shown = false

    session.add(
      this.bookmarkService.bookmarks$.subscribe((bookmarks) => {
        ribbons = this.ribbonsService.ribbons(bookmarks)
        const state = this.sheetState(ribbons, bookId, chapter)
        if (shown) {
          this.nativeChrome.updateBookmarks(state)
        } else {
          shown = true
          this.nativeChrome.showBookmarks(state)
        }
      }),
    )

    session.add(
      this.nativeChrome.actions$.subscribe((action) => {
        switch (action.id) {
          case "bookmarks-closed":
            session.unsubscribe()
            break
          case "bookmark-open":
          case "bookmark-set":
          case "bookmark-remove": {
            const ribbon = ribbons.find((r) => r.value === action.color)
            if (!ribbon) return
            if (action.id === "bookmark-open") this.ribbonsService.open(ribbon)
            if (action.id === "bookmark-remove")
              this.ribbonsService.remove(ribbon)
            if (action.id === "bookmark-set")
              this.ribbonsService.assign(ribbon.value, bookId, chapter)
            break
          }
        }
      }),
    )
  }

  private sheetState(
    ribbons: RibbonState[],
    bookId: string,
    chapter: number,
  ): BookmarksSheetState {
    const book = this.bookService.findBookById(bookId) ?? {
      id: bookId,
      shortName: bookId,
    }
    return {
      // As the passage button names it: "Mateus 11", "Salmo 96 (95)".
      currentLabel:
        chapter === 0
          ? `${book.shortName} Introdução`
          : passageLabel(book, chapter),
      ribbons: ribbons.map((ribbon) => ({
        color: ribbon.value,
        name:
          RIBBON_COLORS.find((c) => c.value === ribbon.value)?.spoken ??
          ribbon.name,
        label: ribbon.currentRef ?? null,
        current:
          ribbon.bookmark?.bookId === bookId &&
          ribbon.bookmark?.chapter === chapter,
      })),
    }
  }
}
