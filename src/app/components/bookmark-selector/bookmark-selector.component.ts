import { CommonModule } from "@angular/common"
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
} from "@angular/material/bottom-sheet"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { MatMenuModule } from "@angular/material/menu"
import { BookService } from "../../services/book.service"
import { BookmarkService } from "../../services/bookmark.service"
import {
  BookmarkRibbonsService,
  RIBBON_COLORS,
  type RibbonMove,
  type RibbonState,
  ribbonColor,
  ribbonToMove,
} from "../../services/bookmark-ribbons.service"
import type { BookmarksSheetState } from "../../services/native-chrome.types"
import {
  bookmarksHint,
  bookmarksSheetState,
  canMark,
  sheetPassageLabel,
} from "../../utils/bookmarks-sheet"

/** A touch held this long on a marked ribbon opens its menu. */
const LONG_PRESS_MS = 500
/** A finger that travels further than this is scrolling, not pressing. */
const LONG_PRESS_SLOP_PX = 10

/**
 * Lifting the finger after a long press still clicks, on whatever is under
 * it by then: the menu just opened there, which a click closes. That click is
 * dropped; the next touch is a new gesture and keeps its own.
 */
function swallowNextClick(): void {
  const swallow = (event: Event) => {
    event.stopPropagation()
    event.preventDefault()
  }
  const options = { capture: true, once: true }
  document.addEventListener("click", swallow, options)
  document.addEventListener(
    "pointerdown",
    () => document.removeEventListener("click", swallow, options),
    options,
  )
}

/** The removal offered, once made, as its undo. */
interface RemoveOffer {
  bookmark: Bookmark
  /** As the ribbon's adjective: "vermelho". */
  name: string
  /** Where it was: "Mateus 5". */
  from: string
}

@Component({
  selector: "app-bookmark-selector",
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: "./bookmark-selector.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ["./bookmark-selector.component.css"],
})
export class BookmarkSelectorComponent implements OnInit {
  private bottomSheetRef =
    inject<MatBottomSheetRef<BookmarkSelectorComponent>>(MatBottomSheetRef)
  data = inject<{
    bookId: string
    chapter: number
  }>(MAT_BOTTOM_SHEET_DATA)
  private bookmarkService = inject(BookmarkService)
  private bookService = inject(BookService)

  colors = RIBBON_COLORS
  /** Each ribbon in the theme's tone for it. */
  readonly ribbonColor = ribbonColor

  ribbons: RibbonState[] = []

  /** What the tiles, the move row and the hint show: see bookmarks-sheet.ts. */
  state?: BookmarksSheetState
  removed?: RemoveOffer
  private pressTimer?: ReturnType<typeof setTimeout>
  private pressOrigin?: { x: number; y: number }

  private destroyRef = inject(DestroyRef)
  private ribbonsService = inject(BookmarkRibbonsService)
  private changeDetector = inject(ChangeDetectorRef)
  private readonly mover: RibbonMove

  constructor() {
    const data = this.data

    this.mover = this.ribbonsService.moveTo(data.bookId, data.chapter)
    // A press still held as the sheet goes would fire into a dead view and
    // drop the next click on the page.
    this.destroyRef.onDestroy(() => this.pressEnd())
  }

  close(): void {
    this.bottomSheetRef.dismiss()
  }

  get hasMarked(): boolean {
    return this.ribbons.some((ribbon) => ribbon.bookmark)
  }

  get hint(): string {
    return this.state ? bookmarksHint(this.state) : ""
  }

  /** As a screen reader should say a tile: its colour, where it is, whether it is here. */
  spoken(tile: BookmarksSheetState["ribbons"][number]): string {
    return `${tile.name}, ${tile.label ?? "livre"}${tile.current ? ", este capítulo" : ""}`
  }

  onTile(color: string): void {
    const ribbon = this.ribbons.find((r) => r.value === color)
    if (ribbon) this.handleRibbonClick(ribbon)
  }

  /**
   * Touch has no right-click (iOS Safari sends no contextmenu at all), so a
   * held touch raises the same event the mouse and the ContextMenu key do,
   * which the menu trigger answers.
   */
  pressStart(event: PointerEvent, color: string): void {
    this.pressEnd()
    const marked = this.ribbons.find((r) => r.value === color)?.bookmark
    if (!marked || event.pointerType === "mouse") return
    const target = event.currentTarget as HTMLElement
    const { clientX, clientY } = event
    this.pressOrigin = { x: clientX, y: clientY }
    this.pressTimer = setTimeout(() => {
      swallowNextClick()
      target.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX,
          clientY,
        }),
      )
    }, LONG_PRESS_MS)
  }

  pressMove(event: PointerEvent): void {
    const origin = this.pressOrigin
    if (
      origin &&
      Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >
        LONG_PRESS_SLOP_PX
    ) {
      this.pressEnd()
    }
  }

  pressEnd(): void {
    clearTimeout(this.pressTimer)
    this.pressTimer = undefined
  }

  /** The menu's "Remover marcador"; the sheet then offers to put it back. */
  removeRibbon(color: string): void {
    const ribbon = this.ribbons.find((r) => r.value === color)
    const bookmark = ribbon?.bookmark && { ...ribbon.bookmark }
    if (!ribbon || !bookmark) return
    // A removal that could not be saved has nothing to take back.
    this.ribbonsService.remove(ribbon, () => {
      this.removed = undefined
      this.changeDetector.markForCheck()
    })
    this.removed = {
      bookmark,
      name: ribbon.spoken.toLowerCase(),
      from: this.passageLabel(bookmark.bookId, bookmark.chapter),
    }
    this.changeDetector.markForCheck()
  }

  undoRemove(): void {
    if (!this.removed) return
    this.ribbonsService.restore(this.removed.bookmark)
    this.removed = undefined
    this.changeDetector.markForCheck()
  }

  private passageLabel(bookId: string, chapter: number): string {
    return sheetPassageLabel(
      (id) => this.bookService.findBookById(id),
      bookId,
      chapter,
    )
  }

  ngOnInit(): void {
    this.bookmarkService.bookmarks$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((bookmarks) => {
        this.updateRibbons(bookmarks)
      })
  }

  updateRibbons(allBookmarks: Bookmark[]) {
    this.ribbons = this.ribbonsService.ribbons(allBookmarks)
    // The offer ends when the removed ribbon is marked again (its undo, a new
    // mark) or another ribbon takes its chapter: a chapter holds one ribbon,
    // so putting this one back would delete that other one.
    const gone = this.removed?.bookmark
    if (
      gone &&
      allBookmarks.some(
        (b) =>
          b.color === gone.color ||
          (b.bookId === gone.bookId && b.chapter === gone.chapter),
      )
    ) {
      this.removed = undefined
    }
    this.state = bookmarksSheetState(
      this.ribbons,
      this.data.bookId,
      this.data.chapter,
      this.mover,
      (bookId, chapter) => this.passageLabel(bookId, chapter),
    )
    this.changeDetector.markForCheck()
  }

  /** Moves the ribbon read on from to this chapter, or undoes that. */
  moveOrUndo(): void {
    if (this.mover.undo()) return
    const ribbon = ribbonToMove(
      this.ribbons,
      this.data.bookId,
      this.data.chapter,
    )
    if (ribbon) this.mover.move(ribbon)
  }

  handleRibbonClick(ribbon: RibbonState): void {
    // 1. If already assigned elsewhere -> Navigate
    if (ribbon.bookmark) {
      if (this.ribbonsService.open(ribbon)) this.bottomSheetRef.dismiss()
      return
    }

    // 2. If empty -> Assign to current, where there is a chapter to mark
    if (!canMark(this.data.bookId)) return
    this.ribbonsService.assign(
      ribbon.value,
      this.data.bookId,
      this.data.chapter,
    )
  }
}
