import { Injectable, inject } from "@angular/core"
import { Subscription } from "rxjs"
import { passageLabel } from "../utils/passage-label"
import { BookService } from "./book.service"
import { BookmarkService } from "./bookmark.service"
import {
  BookmarkRibbonsService,
  type RibbonMove,
  type RibbonState,
  spokenRibbonName,
} from "./bookmark-ribbons.service"
import {
  type BookmarksSheetState,
  NativeChromeService,
} from "./native-chrome.service"

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
        const state = this.sheetState(ribbons, bookId, chapter, mover)
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
            if (action.id === "bookmark-move") mover.move(ribbon)
            break
          }
          case "bookmark-undo":
            mover.undo(action.color)
            break
        }
      }),
    )
  }

  private sheetState(
    ribbons: RibbonState[],
    bookId: string,
    chapter: number,
    mover: RibbonMove,
  ): BookmarksSheetState {
    const offer = canMark(bookId) ? mover.offer(ribbons) : null
    return {
      currentLabel: this.label(bookId, chapter),
      canMark: canMark(bookId),
      ribbons: ribbons.map((ribbon) => ({
        color: ribbon.value,
        name: spokenRibbonName(ribbon.value) ?? ribbon.name,
        label: ribbon.currentRef ?? null,
        current:
          ribbon.bookmark?.bookId === bookId &&
          ribbon.bookmark?.chapter === chapter,
      })),
      move: offer
        ? {
            color: offer.from.color,
            name: offer.name,
            from: this.label(offer.from.bookId, offer.from.chapter),
            done: offer.done,
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
    // The About page has no chapters: "Sobre a Bíblia", not "… 1".
    if (!canMark(bookId)) return book.shortName
    return chapter === 0
      ? `${book.shortName} Introdução`
      : passageLabel(book, chapter)
  }
}

/** The About page can't be marked: a ribbon there would lead nowhere to read. */
function canMark(bookId: string): boolean {
  return bookId !== "about"
}
