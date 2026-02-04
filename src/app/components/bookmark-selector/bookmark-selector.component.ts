import { CommonModule } from "@angular/common"
import { Component, Inject } from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
} from "@angular/material/bottom-sheet"
import { MatIconModule } from "@angular/material/icon"
import { BookmarkService } from "../../services/bookmark.service"
import { BookService } from "../../services/book.service"
import { Router } from "@angular/router"
import { OnInit } from "@angular/core"

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
    { name: "Red", value: "#F44336" },
    { name: "Orange", value: "#FF9800" },
    { name: "Teal", value: "#009688" },
    { name: "Green", value: "#4CAF50" },
    { name: "Blue", value: "#2196F3" },
    { name: "Indigo", value: "#3F51B5" },
    { name: "Violet", value: "#9C27B0" },
    { name: "Grey", value: "#9E9E9E" },
  ]

  ribbons: RibbonState[] = []

  constructor(
    private bottomSheetRef: MatBottomSheetRef<BookmarkSelectorComponent>,
    @Inject(MAT_BOTTOM_SHEET_DATA) public data: { bookId: string; chapter: number },
    private bookmarkService: BookmarkService,
    private bookService: BookService,
    private router: Router,
  ) { }

  isDeleteMode = false

  toggleDeleteMode() {
    this.isDeleteMode = !this.isDeleteMode
  }

  ngOnInit(): void {
    this.updateRibbons()
  }

  updateRibbons() {
    const allBookmarks = this.bookmarkService.getBookmarks()
    this.ribbons = this.colors.map(c => {
      const bookmark = allBookmarks.find(b => b.color === c.value)
      let currentRef = undefined
      if (bookmark) {
        const book = this.bookService.findBook(bookmark.bookId)
        currentRef = book ? `${book.abrv} ${bookmark.chapter}` : `${bookmark.bookId} ${bookmark.chapter}`
      }
      return {
        ...c,
        bookmark,
        currentRef
      }
    })
  }

  handleRibbonClick(ribbon: RibbonState): void {
    if (this.isDeleteMode) {
      if (ribbon.bookmark) {
        this.bookmarkService.removeBookmark(ribbon.bookmark.bookId, ribbon.bookmark.chapter)
        // Refresh ribbons to show it's gone
        this.updateRibbons()
      }
      return
    }

    // 1. If assigned to current chapter -> Remove (Toggle Off)
    if (this.isCurrentLocation(ribbon)) {
      this.bookmarkService.removeBookmark(this.data.bookId, this.data.chapter)
      this.updateRibbons()
      return
    }

    // 2. If already assigned elsewhere -> Navigate
    if (ribbon.bookmark) {
      const book = this.bookService.findBook(ribbon.bookmark.bookId)
      if (book) {
        this.router.navigate([this.bookService.getUrlAbrv(book), ribbon.bookmark.chapter])
        this.bottomSheetRef.dismiss()
      }
      return
    }

    // 3. If empty -> Assign to current
    this.bookmarkService.addBookmark(this.data.bookId, this.data.chapter, ribbon.value)
    this.updateRibbons()
  }

  isCurrentLocation(ribbon: RibbonState): boolean {
    return ribbon.bookmark?.bookId === this.data.bookId && ribbon.bookmark?.chapter === this.data.chapter
  }
}
