import { CommonModule } from "@angular/common"
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  Inject,
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
import { BookmarkService } from "../../services/bookmark.service"
import {
  BookmarkRibbonsService,
  RIBBON_COLORS,
  type RibbonState,
  ribbonToMove,
} from "../../services/bookmark-ribbons.service"

/** The move offered above the ribbons, or, once made, its undo. */
interface MoveOffer {
  color: string
  /** "Mover o marcador vermelho de Mt 5 para Mt 7". */
  label: string
  done: boolean
}

@Component({
  selector: "app-bookmark-selector",
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: "./bookmark-selector.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ["./bookmark-selector.component.css"],
})
export class BookmarkSelectorComponent implements OnInit {
  colors = RIBBON_COLORS

  ribbons: RibbonState[] = []

  move?: MoveOffer

  /** Where a ribbon moved here was, while the panel offers to undo it. */
  private moved?: Bookmark

  private destroyRef = inject(DestroyRef)
  private ribbonsService = inject(BookmarkRibbonsService)
  private changeDetector = inject(ChangeDetectorRef)

  constructor(
    private bottomSheetRef: MatBottomSheetRef<BookmarkSelectorComponent>,
    @Inject(MAT_BOTTOM_SHEET_DATA)
    public data: { bookId: string; chapter: number },
    private bookmarkService: BookmarkService,
  ) {}

  isDeleteMode = false

  toggleDeleteMode() {
    this.isDeleteMode = !this.isDeleteMode
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
    this.changeDetector.markForCheck()
  }

  /** Moves the ribbon read on from to this chapter, or undoes that. */
  moveOrUndo(): void {
    const { bookId, chapter } = this.data
    if (this.moved) {
      this.ribbonsService.restore(this.moved)
      this.moved = undefined
      return
    }
    const ribbon = ribbonToMove(this.ribbons, bookId, chapter)
    if (ribbon) this.moved = this.ribbonsService.move(ribbon, bookId, chapter)
  }

  private moveOffer(): MoveOffer | undefined {
    const { bookId, chapter } = this.data
    const from =
      this.moved ?? ribbonToMove(this.ribbons, bookId, chapter)?.bookmark
    if (!from) return undefined
    const color = (
      RIBBON_COLORS.find((c) => c.value === from.color)?.spoken ?? from.color
    ).toLowerCase()
    const fromRef = this.ribbonsService.ref(from.bookId, from.chapter)
    return {
      color: from.color,
      label: this.moved
        ? `Desfazer: o marcador ${color} volta a ${fromRef}`
        : `Mover o marcador ${color} de ${fromRef} para ${this.ribbonsService.ref(bookId, chapter)}`,
      done: !!this.moved,
    }
  }

  handleRibbonClick(ribbon: RibbonState): void {
    if (this.isDeleteMode) {
      this.ribbonsService.remove(ribbon)
      return
    }

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
