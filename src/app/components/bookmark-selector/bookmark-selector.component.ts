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

@Component({
  selector: "app-bookmark-selector",
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
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

  private destroyRef = inject(DestroyRef)
  private ribbonsService = inject(BookmarkRibbonsService)
  private changeDetector = inject(ChangeDetectorRef)
  private readonly mover: RibbonMove

  constructor() {
    const data = this.data

    this.mover = this.ribbonsService.moveTo(data.bookId, data.chapter)
  }

  isDeleteMode = false

  toggleDeleteMode() {
    this.isDeleteMode = !this.isDeleteMode
  }

  close(): void {
    this.bottomSheetRef.dismiss()
  }

  /** Editing is for taking ribbons off: nothing to do while none is on. */
  get hasUsedRibbon(): boolean {
    return this.ribbons.some((ribbon) => ribbon.bookmark)
  }

  get hint(): string {
    return this.state ? bookmarksHint(this.state, this.isDeleteMode) : ""
  }

  /** As a screen reader should say a tile: its colour, where it is, whether it is here. */
  spoken(tile: BookmarksSheetState["ribbons"][number]): string {
    return `${tile.name}, ${tile.label ?? "livre"}${tile.current ? ", este capítulo" : ""}`
  }

  onTile(color: string): void {
    const ribbon = this.ribbons.find((r) => r.value === color)
    if (ribbon) this.handleRibbonClick(ribbon)
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
    if (!this.hasUsedRibbon) this.isDeleteMode = false
    this.state = bookmarksSheetState(
      this.ribbons,
      this.data.bookId,
      this.data.chapter,
      this.mover,
      (bookId, chapter) =>
        sheetPassageLabel(
          (id) => this.bookService.findBookById(id),
          bookId,
          chapter,
        ),
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
    if (this.isDeleteMode) {
      this.ribbonsService.remove(ribbon)
      return
    }

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
