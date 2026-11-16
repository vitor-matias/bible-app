import { CommonModule } from "@angular/common"
import {
  AfterViewInit,
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  Injector,
  inject,
  input,
  linkedSignal,
  OnChanges,
  output,
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
  private elementRef = inject(ElementRef)
  private bookmarkService = inject(BookmarkService)

  readonly chapters = input<Chapter[]>([])

  readonly selectedChapter = input<Chapter["number"]>(1)

  /** The highlighted chapter: follows the input, and a tap moves it at once. */
  protected readonly highlighted = linkedSignal(() => this.selectedChapter())

  /** The chapter last focused, which keeps the list's one tab stop. */
  protected readonly focused = linkedSignal(() => this.highlighted())
  protected readonly tabStop = computed(() => {
    const chapters = this.chapters()
    const focused = this.focused()
    return chapters.some((chapter) => chapter.number === focused)
      ? focused
      : chapters[0]?.number
  })

  readonly submitData = output<{
    chapterNumber: Chapter["number"]
  }>()

  readonly bookId = input.required<string>()

  bookmarks$ = of(new Map<number, string>()) // map chapter -> color

  /** Each ribbon in the theme's tone for it. */
  readonly ribbonColor = ribbonColor
  readonly isRibbonColor = isRibbonColor

  private injector = inject(Injector)

  /** In the reader's drawer, which scrolls to the chapter each time it opens:
   *  reopening it reuses this list, scrolled wherever it was left. */
  private inDrawer = scrollOnDrawerOpen(() => this.scrollToSelectedChapter())

  submit(id: Chapter["number"]) {
    this.highlighted.set(id)
    this.submitData.emit({ chapterNumber: id })
  }

  onKeyPress(event: KeyboardEvent, id: Chapter["number"]): void {
    this.submit(id)
  }

  /** A list, one chapter per row: Up and Left go back one, Down and Right on. */
  moveFocus(event: KeyboardEvent): void {
    const buttons: HTMLElement[] = Array.from(
      this.elementRef.nativeElement.querySelectorAll(".chapterSelectorButton"),
    )
    const index = buttons.indexOf(event.target as HTMLElement)
    if (index === -1) return
    const target = (<Record<string, number>>{
      ArrowUp: index - 1,
      ArrowLeft: index - 1,
      ArrowDown: index + 1,
      ArrowRight: index + 1,
      Home: 0,
      End: buttons.length - 1,
    })[event.key]
    if (target === undefined) return
    event.preventDefault()
    const next = buttons[Math.max(0, Math.min(target, buttons.length - 1))]
    // At once, not at the next check: a Tab right after leaves from here.
    buttons[index].tabIndex = -1
    next.tabIndex = 0
    next.focus()
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
    const bookId = this.bookId()
    if (changes["bookId"] && bookId) {
      this.bookmarks$ = this.bookmarkService.getBookmarksForBook(bookId).pipe(
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
