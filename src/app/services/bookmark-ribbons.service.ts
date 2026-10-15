import { Injectable, inject } from "@angular/core"
import { Router } from "@angular/router"
import { cleanAbbreviation } from "../utils/passage-label"
import { AnalyticsService } from "./analytics.service"
import { BookService } from "./book.service"
import { BookmarkService } from "./bookmark.service"
import { HapticsService } from "./haptics.service"

/** The eight ribbons, keyed by the CSS colour name a bookmark stores. */
export const RIBBON_COLORS = [
  { name: "Red", value: "red", spoken: "Vermelho" },
  { name: "Orange", value: "orange", spoken: "Laranja" },
  { name: "Teal", value: "teal", spoken: "Azul-petróleo" },
  { name: "Green", value: "green", spoken: "Verde" },
  { name: "Blue", value: "blue", spoken: "Azul" },
  { name: "Indigo", value: "indigo", spoken: "Índigo" },
  { name: "Violet", value: "violet", spoken: "Violeta" },
  { name: "Grey", value: "grey", spoken: "Cinzento" },
]

export interface RibbonState {
  name: string
  value: string
  /** The passage the ribbon marks, e.g. "Mc 2". */
  currentRef?: string
  bookmark?: Bookmark
}

/**
 * The ribbon to offer moving to this chapter: of those in the same book, the
 * nearest one behind it, which is where a reader who read on from a ribbon
 * left it. None when the chapter already carries a ribbon, as moving one
 * here would take that one off.
 */
export function ribbonToMove(
  ribbons: RibbonState[],
  bookId: string,
  chapter: number,
): RibbonState | undefined {
  let nearest: RibbonState | undefined
  for (const ribbon of ribbons) {
    const marked = ribbon.bookmark
    if (marked?.bookId !== bookId) continue
    if (marked.chapter === chapter) return undefined
    if (
      marked.chapter < chapter &&
      marked.chapter > (nearest?.bookmark?.chapter ?? -1)
    ) {
      nearest = ribbon
    }
  }
  return nearest
}

/**
 * What the bookmark ribbons do, shared by the web panel
 * (BookmarkSelectorComponent) and the iOS native sheet: each colour marks at
 * most one chapter, and a chapter carries at most one colour.
 */
@Injectable({
  providedIn: "root",
})
export class BookmarkRibbonsService {
  private readonly bookmarkService = inject(BookmarkService)
  private readonly bookService = inject(BookService)
  private readonly router = inject(Router)
  private readonly analyticsService = inject(AnalyticsService)
  private readonly haptics = inject(HapticsService)

  /** Every colour, with the passage it marks if it is in use. */
  ribbons(bookmarks: Bookmark[]): RibbonState[] {
    return RIBBON_COLORS.map(({ name, value }) => {
      const bookmark = bookmarks.find((b) => b.color === value)
      const currentRef = bookmark && this.ref(bookmark.bookId, bookmark.chapter)
      return { name, value, bookmark, currentRef }
    })
  }

  /** A ribbon's short name for a chapter, e.g. "Mc 2". */
  ref(bookId: string, chapter: number): string {
    const book = this.bookService.findBookById(bookId)
    // Chapter 0 is the book introduction
    const chapterLabel = chapter === 0 ? "Introdução" : `${chapter}`
    return book
      ? `${cleanAbbreviation(book.abrv)} ${chapterLabel}`
      : `${bookId} ${chapterLabel}`
  }

  /** Opens the ribbon's passage. False when it marks a book that is unknown. */
  open(ribbon: RibbonState): boolean {
    if (!ribbon.bookmark) return false
    const book = this.bookService.findBookById(ribbon.bookmark.bookId)
    if (!book) {
      console.warn(
        `Bookmark references unknown book: ${ribbon.bookmark.bookId}`,
      )
      return false
    }
    void this.analyticsService.track("bookmark_use", {
      book: ribbon.bookmark.bookId,
      chapter: ribbon.bookmark.chapter,
      color: ribbon.value,
    })
    this.router.navigate([
      this.bookService.getUrlAbrv(book),
      this.bookService.getChapterUrlSegment(ribbon.bookmark.chapter),
    ])
    return true
  }

  /** Marks the chapter with the colour. */
  assign(color: string, bookId: string, chapter: number): void {
    this.bookmarkService.addBookmark(bookId, chapter, color)
    this.haptics.success()
    void this.analyticsService.track("bookmark_create", {
      book: bookId,
      chapter,
      color,
    })
  }

  /**
   * Moves a used ribbon to the chapter, as one moves a ribbon in a printed
   * Bible on reading further. Returns where it was, for `restore`.
   */
  move(
    ribbon: RibbonState,
    bookId: string,
    chapter: number,
  ): Bookmark | undefined {
    const from = ribbon.bookmark
    if (!from) return undefined
    this.bookmarkService.addBookmark(bookId, chapter, ribbon.value)
    this.haptics.success()
    void this.analyticsService.track("bookmark_move", {
      book: bookId,
      chapter,
      color: ribbon.value,
      fromBook: from.bookId,
      fromChapter: from.chapter,
    })
    return { ...from }
  }

  /** Undoes a move: the ribbon goes back to where it was. */
  restore(previous: Bookmark): void {
    this.bookmarkService.addBookmark(
      previous.bookId,
      previous.chapter,
      previous.color,
    )
  }

  remove(ribbon: RibbonState): void {
    if (!ribbon.bookmark) return
    this.bookmarkService.removeBookmark(
      ribbon.bookmark.bookId,
      ribbon.bookmark.chapter,
    )
    void this.analyticsService.track("bookmark_delete", {
      book: ribbon.bookmark.bookId,
      chapter: ribbon.bookmark.chapter,
      color: ribbon.value,
    })
  }
}
