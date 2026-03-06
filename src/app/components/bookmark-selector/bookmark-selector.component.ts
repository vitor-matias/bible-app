import { CommonModule } from "@angular/common"
import { Component, DestroyRef, Inject, inject, OnInit } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
} from "@angular/material/bottom-sheet"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { Router } from "@angular/router"
import { BookService } from "../../services/book.service"
import { BookmarkService } from "../../services/bookmark.service"

interface RibbonState {
  name: string
  value: string
  currentRef?: string
  bookmark?: Bookmark
}

@Component({
  selector: "app-bookmark-selector",
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: "./bookmark-selector.component.html",
  styleUrls: ["./bookmark-selector.component.css"],
})
export class BookmarkSelectorComponent implements OnInit {
  colors = [
    { name: "Red", value: "red" },
    { name: "Orange", value: "orange" },
    { name: "Teal", value: "teal" },
    { name: "Green", value: "green" },
    { name: "Blue", value: "blue" },
    { name: "Indigo", value: "indigo" },
    { name: "Violet", value: "violet" },
    { name: "Grey", value: "grey" },
  ]

  ribbons: RibbonState[] = []

  private destroyRef = inject(DestroyRef)

  constructor(
    private bottomSheetRef: MatBottomSheetRef<BookmarkSelectorComponent>,
    @Inject(MAT_BOTTOM_SHEET_DATA)
    public data: { bookId: string; chapter: number },
    private bookmarkService: BookmarkService,
    private bookService: BookService,
    private router: Router,
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
    this.ribbons = this.colors.map((c) => {
      const bookmark = allBookmarks.find((b) => b.color === c.value)
      let currentRef: string | undefined
      if (bookmark) {
        const book = this.bookService.findBookById(bookmark.bookId)
        currentRef = book
          ? `${book.abrv} ${bookmark.chapter}`
          : `${bookmark.bookId} ${bookmark.chapter}`
      }
      return {
        ...c,
        bookmark,
        currentRef,
      }
    })
  }

  handleRibbonClick(ribbon: RibbonState): void {
    if (this.isDeleteMode) {
      if (ribbon.bookmark) {
        this.bookmarkService.removeBookmark(
          ribbon.bookmark.bookId,
          ribbon.bookmark.chapter,
        )
      }
      return
    }

    // 1. If already assigned elsewhere -> Navigate
    if (ribbon.bookmark) {
      const book = this.bookService.findBookById(ribbon.bookmark.bookId)
      if (book) {
        this.router.navigate([
          this.bookService.getUrlAbrv(book),
          ribbon.bookmark.chapter,
        ])
        this.bottomSheetRef.dismiss()
      } else {
        console.warn(
          `Bookmark references unknown book: ${ribbon.bookmark.bookId}`,
        )
      }
      return
    }

    // 2. If empty -> Assign to current
    this.bookmarkService.addBookmark(
      this.data.bookId,
      this.data.chapter,
      ribbon.value,
    )
  }

  isCurrentLocation(ribbon: RibbonState): boolean {
    return (
      ribbon.bookmark?.bookId === this.data.bookId &&
      ribbon.bookmark?.chapter === this.data.chapter
    )
  }
}
