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

/** Whether `color` is one of the ribbons, rather than a colour stored before them. */
export function isRibbonColor(color: string | null | undefined): boolean {
  return RIBBON_COLORS.some((ribbon) => ribbon.value === color)
}

/**
 * The CSS colour to paint a ribbon in: its tone for the theme's surfaces
 * (`--ribbon-<color>` in styles.css), or, with `surface: "light"`, the tone
 * for a surface that stays light in both themes (the web header's buttons).
 * Null for no ribbon; an unknown colour is painted as stored.
 */
export function ribbonColor(
  color: string | null | undefined,
  surface: "theme" | "light" = "theme",
): string | null {
  if (!color) return null
  if (!isRibbonColor(color)) return color
  return surface === "light"
    ? `var(--ribbon-light-${color})`
    : `var(--ribbon-${color})`
}

/** A ribbon's spoken name ("Vermelho"), by the colour a bookmark stores. */
export function spokenRibbonName(color: string): string | undefined {
  return RIBBON_COLORS.find((ribbon) => ribbon.value === color)?.spoken
}

export interface RibbonState {
  name: string
  value: string
  /** Its name read out, in Portuguese ("Vermelho"). */
  spoken: string
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

/** The move a panel offers above the ribbons, or, once made, its undo. */
export interface RibbonMoveOffer {
  /** Where the ribbon is, or was before the move. */
  from: Bookmark
  /** As the ribbon's adjective: "vermelho". */
  name: string
  /** Moved: the offer is to undo it. */
  done: boolean
}

/**
 * One panel's offer to move a ribbon to the chapter being read (ribbonToMove)
 * and, once it moved, to move it back: the web panel and the iOS sheet each
 * hold one while open, and only word and draw it their own way.
 */
export class RibbonMove {
  /** Where the ribbon moved here was, while the offer is to undo it. */
  private moved?: Bookmark

  constructor(
    private readonly service: BookmarkRibbonsService,
    private readonly bookId: string,
    private readonly chapter: number,
  ) {}

  /** What to offer, given the ribbons as they are now. */
  offer(ribbons: RibbonState[]): RibbonMoveOffer | undefined {
    const from =
      this.moved ?? ribbonToMove(ribbons, this.bookId, this.chapter)?.bookmark
    if (!from) return undefined
    return {
      from,
      name: (spokenRibbonName(from.color) ?? from.color).toLowerCase(),
      done: !!this.moved,
    }
  }

  /**
   * Moves the ribbon here. Undo then undoes the latest move, as the offer
   * names it; a move that did nothing leaves the last one's undo in place.
   */
  move(ribbon: RibbonState): void {
    this.moved =
      this.service.move(ribbon, this.bookId, this.chapter) ?? this.moved
  }

  /** Puts the moved ribbon back; false when there is no move (of `color`) to undo. */
  undo(color?: string): boolean {
    if (!this.moved || (color !== undefined && this.moved.color !== color)) {
      return false
    }
    this.service.restore(this.moved)
    this.moved = undefined
    return true
  }
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

  /** A panel's move offer for the chapter it was opened on (RibbonMove). */
  moveTo(bookId: string, chapter: number): RibbonMove {
    return new RibbonMove(this, bookId, chapter)
  }

  /** Every colour, with the passage it marks if it is in use. */
  ribbons(bookmarks: Bookmark[]): RibbonState[] {
    return RIBBON_COLORS.map(({ name, value, spoken }) => {
      const bookmark = bookmarks.find((b) => b.color === value)
      const currentRef = bookmark && this.ref(bookmark.bookId, bookmark.chapter)
      return { name, value, spoken, bookmark, currentRef }
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
