import { Injectable, inject } from "@angular/core"
import { Subscription } from "rxjs"
import { passageLabel } from "../utils/passage-label"
import { BookService } from "./book.service"
import { BookmarkService } from "./bookmark.service"
import {
  BookmarkRibbonsService,
  RIBBON_COLORS,
  type RibbonState,
  ribbonToMove,
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
    // Where a ribbon moved here was, while the sheet offers to undo it.
    let moved: Bookmark | undefined
    let shown = false

    session.add(
      this.bookmarkService.bookmarks$.subscribe((bookmarks) => {
        ribbons = this.ribbonsService.ribbons(bookmarks)
        const state = this.sheetState(ribbons, bookId, chapter, moved)
        if (shown) {
          this.nativeChrome.updateBookmarks(state)
        } else {
          shown = true
          // Over another sheet none comes up, and no bookmarks-closed would
          // end this.
          void this.nativeChrome.showBookmarks(state).then((presented) => {
            if (!presented) session.unsubscribe()
          })
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
          case "bookmark-remove":
          case "bookmark-move": {
            const ribbon = ribbons.find((r) => r.value === action.color)
            if (!ribbon) return
            if (action.id === "bookmark-open") this.ribbonsService.open(ribbon)
            if (action.id === "bookmark-remove")
              this.ribbonsService.remove(ribbon)
            if (action.id === "bookmark-set")
              this.ribbonsService.assign(ribbon.value, bookId, chapter)
            if (action.id === "bookmark-move")
              moved = this.ribbonsService.move(ribbon, bookId, chapter)
            break
          }
          case "bookmark-undo":
            if (moved?.color !== action.color) return
            this.ribbonsService.restore(moved)
            moved = undefined
            break
        }
      }),
    )
  }

  private sheetState(
    ribbons: RibbonState[],
    bookId: string,
    chapter: number,
    moved: Bookmark | undefined,
  ): BookmarksSheetState {
    const spoken = (color: string) =>
      RIBBON_COLORS.find((c) => c.value === color)?.spoken
    const toMove = moved ? undefined : ribbonToMove(ribbons, bookId, chapter)
    const from = moved ?? toMove?.bookmark
    return {
      currentLabel: this.label(bookId, chapter),
      ribbons: ribbons.map((ribbon) => ({
        color: ribbon.value,
        name: spoken(ribbon.value) ?? ribbon.name,
        label: ribbon.currentRef ?? null,
        current:
          ribbon.bookmark?.bookId === bookId &&
          ribbon.bookmark?.chapter === chapter,
      })),
      move: from
        ? {
            color: from.color,
            name: (spoken(from.color) ?? from.color).toLowerCase(),
            from: this.label(from.bookId, from.chapter),
            done: !!moved,
          }
        : null,
    }
  }

  /** As the passage button names it: "Mateus 11", "Salmo 96 (95)". */
  private label(bookId: string, chapter: number): string {
    const book = this.bookService.findBookById(bookId) ?? {
      id: bookId,
      shortName: bookId,
    }
    return chapter === 0
      ? `${book.shortName} Introdução`
      : passageLabel(book, chapter)
  }
}
