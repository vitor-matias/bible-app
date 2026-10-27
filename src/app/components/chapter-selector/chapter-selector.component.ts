import { CommonModule } from "@angular/common"
import {
  AfterViewInit,
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Injector,
  Input,
  inject,
  OnChanges,
  Output,
  SimpleChanges,
} from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { MatListModule } from "@angular/material/list"
import { MatTreeModule } from "@angular/material/tree"
import { of } from "rxjs"
import { map } from "rxjs/operators"
import { BookmarkService } from "../../services/bookmark.service"
import {
  isRibbonColor,
  ribbonColor,
} from "../../services/bookmark-ribbons.service"
import { scrollOnDrawerOpen } from "../../utils/drawer-scroll"

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
  changeDetection: ChangeDetectionStrategy.OnPush,
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

  bookmarks$ = of(new Map<number, string>()) // map chapter -> color

  /** Each ribbon in the theme's tone for it. */
  readonly ribbonColor = ribbonColor
  readonly isRibbonColor = isRibbonColor

  private injector = inject(Injector)

  /** In the reader's drawer, which scrolls to the chapter each time it opens:
   *  reopening it reuses this list, scrolled wherever it was left. */
  private inDrawer = scrollOnDrawerOpen(() => this.scrollToSelectedChapter())

  constructor(
    private elementRef: ElementRef,
    private bookmarkService: BookmarkService,
  ) {}

  submit(id: Chapter["number"]) {
    this.selectedChapter = id
    this.submitData.emit({ chapterNumber: id })
  }

  onKeyPress(event: KeyboardEvent, id: Chapter["number"]): void {
    this.submit(id)
  }

  getChapterDisplay(chapter: Chapter): string {
    return chapter.title
      ? chapter.number > 0
        ? ` - ${chapter.title}`
        : chapter.title
      : ""
  }

  getChapterLabel(chapter: Chapter): string {
    return chapter.number === 0 ? "" : chapter.number.toString()
  }

  ngAfterViewInit(): void {
    if (this.inDrawer) return
    // Runs while prerendering too, where the DOM has no scrollIntoView;
    // afterNextRender is browser-only.
    afterNextRender(() => this.scrollToSelectedChapter(), {
      injector: this.injector,
    })
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["selectedChapter"] && !changes["selectedChapter"].firstChange) {
      // Scroll once the changed chapter list has actually been rendered.
      afterNextRender(() => this.scrollToSelectedChapter(), {
        injector: this.injector,
      })
    }
    if (changes["bookId"] && this.bookId) {
      this.bookmarks$ = this.bookmarkService
        .getBookmarksForBook(this.bookId)
        .pipe(
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
