import { CommonModule } from "@angular/common"
import {
  ChangeDetectionStrategy,
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
} from "../../services/bookmark-ribbons.service"

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

  private destroyRef = inject(DestroyRef)
  private ribbonsService = inject(BookmarkRibbonsService)

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
