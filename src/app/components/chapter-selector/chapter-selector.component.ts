import { CommonModule } from "@angular/common"
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { MatListModule } from "@angular/material/list"
import { MatTreeModule } from "@angular/material/tree"
import { BookmarkService } from "../../services/bookmark.service"
import { map } from "rxjs/operators"
import { Observable } from "rxjs"

@Component({
  selector: "chapter-selector",
  imports: [
    CommonModule,
    MatListModule,
    MatTreeModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: "./chapter-selector.component.html",
  styleUrl: "./chapter-selector.component.css",
})
export class ChapterSelectorComponent implements AfterViewInit, OnChanges {
  @Input()
  chapters: Chapter[] = []

  @Input()
  selectedChapter: Chapter["number"] = 1

  @Output() submitData = new EventEmitter<{
    chapterNumber: Chapter["number"]
  }>()

  @Input()
  bookId!: string

  bookmarks$!: Observable<Map<number, string>> // map chapter -> color

  constructor(
    private elementRef: ElementRef,
    private bookmarkService: BookmarkService,
  ) { }

  submit(id: Chapter["number"]) {
    this.selectedChapter = id
    this.submitData.emit({ chapterNumber: id })
  }

  onKeyPress(event: KeyboardEvent, id: Chapter["number"]): void {
    this.submit(id)
  }

  getChapterDisplay(chapter: Chapter): string {
    return (chapter.title ? ` - ${chapter.title}` : "")
  }

  ngAfterViewInit(): void {
    this.scrollToSelectedChapter()
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["selectedChapter"] && !changes["selectedChapter"].firstChange) {
      setTimeout(() => this.scrollToSelectedChapter(), 100)
    }
    if (changes["bookId"] && this.bookId) {
      this.bookmarks$ = this.bookmarkService.getBookmarksForBook(this.bookId).pipe(
        map((bookmarks) => {
          const map = new Map<number, string>()
          bookmarks.forEach((b) => {
            map.set(b.chapter, b.color)
          })
          return map
        }),
      )
    }
  }

  private scrollToSelectedChapter(): void {
    const element = this.elementRef.nativeElement.querySelector(".highlight")
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }
}
