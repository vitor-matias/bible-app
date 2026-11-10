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
import { BookmarkService } from "../../services/bookmark.service"
import {
  BookmarkRibbonsService,
  RIBBON_COLORS,
  type RibbonMove,
  type RibbonState,
  ribbonColor,
  ribbonToMove,
} from "../../services/bookmark-ribbons.service"

/** The move offered above the ribbons, or, once made, its undo. */
interface MoveOffer {
  color: string
  /** "Mover o marcador vermelho de Mt 5 para Mt 7". */
  label: string
  done: boolean
}

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
  /** "Desfazer: o marcador vermelho volta a Mt 5". */
  label: string
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

  colors = RIBBON_COLORS
  /** Each ribbon in the theme's tone for it. */
  readonly ribbonColor = ribbonColor

  ribbons: RibbonState[] = []

  move?: MoveOffer
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
    this.move = this.moveOffer()
    // Any other change to the removed ribbon (its undo, a new mark) ends the offer.
    const gone = this.removed?.bookmark.color
    if (gone && this.ribbons.find((r) => r.value === gone)?.bookmark) {
      this.removed = undefined
    }
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

  private moveOffer(): MoveOffer | undefined {
    const offer = this.mover.offer(this.ribbons)
    if (!offer) return undefined
    const { from, name, done } = offer
    const fromRef = this.ribbonsService.ref(from.bookId, from.chapter)
    const here = this.ribbonsService.ref(this.data.bookId, this.data.chapter)
    return {
      color: from.color,
      label: done
        ? `Desfazer: o marcador ${name} volta a ${fromRef}`
        : `Mover o marcador ${name} de ${fromRef} para ${here}`,
      done,
    }
  }

  /**
   * Touch has no right-click (iOS Safari sends no contextmenu at all), so a
   * held touch raises the same event the mouse and the ContextMenu key do,
   * which the menu trigger answers.
   */
  pressStart(event: PointerEvent, ribbon: RibbonState): void {
    this.pressEnd()
    if (!ribbon.bookmark || event.pointerType === "mouse") return
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
  removeRibbon(ribbon: RibbonState): void {
    const bookmark = ribbon.bookmark && { ...ribbon.bookmark }
    if (!bookmark) return
    this.ribbonsService.remove(ribbon)
    this.removed = {
      bookmark,
      label: `Desfazer: o marcador ${ribbon.spoken.toLowerCase()} volta a ${this.ribbonsService.ref(bookmark.bookId, bookmark.chapter)}`,
    }
    this.changeDetector.markForCheck()
  }

  undoRemove(): void {
    if (!this.removed) return
    this.ribbonsService.restore(this.removed.bookmark)
    this.removed = undefined
    this.changeDetector.markForCheck()
  }

  get hasMarked(): boolean {
    return this.ribbons.some((ribbon) => ribbon.bookmark)
  }

  handleRibbonClick(ribbon: RibbonState): void {
    // 1. If already assigned elsewhere -> Navigate
    if (ribbon.bookmark) {
      if (this.ribbonsService.open(ribbon)) this.bottomSheetRef.dismiss()
      return
    }

    // 2. If empty -> Assign to current
    this.ribbonsService.assign(
      ribbon.value,
      this.data.bookId,
      this.data.chapter,
    )
  }

  isCurrentLocation(ribbon: RibbonState): boolean {
    return (
      ribbon.bookmark?.bookId === this.data.bookId &&
      ribbon.bookmark?.chapter === this.data.chapter
    )
  }
}
