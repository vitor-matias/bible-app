import { CommonModule } from "@angular/common"
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
} from "@angular/core"
import { MatBottomSheetModule } from "@angular/material/bottom-sheet"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import {
  type MatDrawer,
  type MatDrawerContainer,
  MatSidenavModule,
} from "@angular/material/sidenav"
import { ActivatedRoute, Router } from "@angular/router"
import { combineLatest } from "rxjs"
import { UnifiedGesturesDirective } from "../../directives/unified-gesture.directive"
import { AutoScrollService } from "../../services/auto-scroll.service"
import { BibleApiService } from "../../services/bible-api.service"
import { BookService } from "../../services/book.service"
import { PreferencesService } from "../../services/preferences.service"
import { AboutComponent } from "../about/about.component"
import { BookSelectorComponent } from "../book-selector/book-selector.component"
import { ChapterSelectorComponent } from "../chapter-selector/chapter-selector.component"
import { HeaderComponent } from "../header/header.component"
import { VerseComponent } from "../verse/verse.component"

@Component({
  selector: "bible-reader",
  templateUrl: "./bible-reader.component.html",
  styleUrl: "./bible-reader.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    CommonModule,
    VerseComponent,
    HeaderComponent,
    BookSelectorComponent,
    MatSidenavModule,
    MatBottomSheetModule,
    AboutComponent,
    ChapterSelectorComponent,
    MatIconModule,
    MatButtonModule,
    UnifiedGesturesDirective,
  ],
})
export class BibleReaderComponent implements OnDestroy {
  @ViewChild("bookDrawer")
  bookDrawer!: MatDrawer

  @ViewChild("container")
  container!: MatDrawerContainer

  @ViewChild(UnifiedGesturesDirective) gestures!: UnifiedGesturesDirective

  @ViewChild("bookDrawerCloseButton") bookDrawerCloseButton!: ElementRef
  @ViewChild("chapterDrawerCloseButton") chapterDrawerCloseButton!: ElementRef
  @ViewChild("bookContainer") bookContainer!: ElementRef

  @ViewChild("bookBlock") bookBlock!: ElementRef

  book!: Book
  chapterNumber = 1
  chapter!: Chapter

  bookParam: string | null = null
  chapterParam: string | null = null
  showBooks = true
  showAutoScrollControls = false
  viewMode: "scrolling" | "paged" = "scrolling"

  constructor(
    private autoScrollService: AutoScrollService,
    private apiService: BibleApiService,
    private bookService: BookService,
    private preferencesService: PreferencesService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    const storedSpeed = this.preferencesService.getAutoScrollSpeed()
    if (storedSpeed) {
      this.autoScrollService.setAutoScrollLinesPerSecond(storedSpeed)
    }

    this.viewMode = this.preferencesService.getViewMode()

    this.showAutoScrollControls =
      this.preferencesService.getAutoScrollControlsVisible()
    this.bookService.books$.subscribe((_books) => {
      if (_books.length === 0)
        alert("No books available. Please check your API connection.")
      this.bookParam =
        this.router.routerState.snapshot.root.firstChild?.params[
          "book"
        ]?.toLowerCase()
      this.chapterParam =
        this.router.routerState.snapshot.root.firstChild?.params["chapter"]

      const verseStartParam =
        this.router.routerState.snapshot.root.firstChild?.queryParams[
          "verseStart"
        ]
      const verseEndParam =
        this.router.routerState.snapshot.root.firstChild?.queryParams[
          "verseEnd"
        ]

      const storedBook =
        this.bookParam || this.preferencesService.getLastBookId() || "about"
      const storedChapter =
        this.chapterParam ||
        this.preferencesService.getLastChapterNumber()?.toString() ||
        "1"

      if (storedBook && storedChapter) {
        this.book = this.bookService.findBook(storedBook)

        this.chapterNumber = Number.parseInt(storedChapter, 10)
        this.router.navigate(
          [this.bookService.getUrlAbrv(this.book), this.chapterNumber],
          {
            queryParams: verseStartParam
              ? { verseStart: verseStartParam, verseEnd: verseEndParam }
              : {},
            replaceUrl: true,
          },
        )
        this.getChapter(this.chapterNumber, verseStartParam, verseEndParam)
      }

      combineLatest([this.route.paramMap, this.route.queryParamMap]).subscribe(
        ([params, queryParams]) => {
          const bookParam = params.get("book") || "about"
          const chapterParam = Number.parseInt(params.get("chapter") || "1", 10)
          const verseStartParam = queryParams.get("verseStart")
            ? Number.parseInt(queryParams.get("verseStart") || "1", 10)
            : undefined
          const verseEndParam = queryParams.get("verseEnd")
            ? Number.parseInt(queryParams.get("verseEnd") || "1", 10)
            : undefined

          const highlight =
            queryParams.get("highlight") === null
              ? true
              : queryParams.get("highlight") === "true"

          const tempBook = this.bookService.findBook(bookParam)

          if (
            this.book.id === tempBook.id &&
            this.chapterNumber === chapterParam
          ) {
            this.scrollToVerseElement(
              verseStartParam || 1,
              verseEndParam,
              highlight,
            )
            return
          }

          this.book = tempBook
          this.getChapter(
            chapterParam,
            verseStartParam,
            verseEndParam,
            highlight,
          )
          this.bookDrawer?.close()
        },
      )
    })
  }

  ngOnDestroy(): void {
    this.stopAutoScroll()
  }

  nextPage(): void {
    if (this.viewMode !== "paged") return
    const block = this.bookBlock?.nativeElement
    const container = this.bookContainer?.nativeElement
    if (!container || !block) return

    const style = window.getComputedStyle(block)
    const gap = parseFloat(style.columnGap) || 0
    const paddingLeft = parseFloat(style.paddingLeft) || 0
    const paddingRight = parseFloat(style.paddingRight) || 0

    // Gap only matters when more than 1 column is shown
    const advanceWidth = block.clientWidth - (paddingLeft + paddingRight) + gap

    const scrollLeft = container.scrollLeft
    const scrollWidth = container.scrollWidth
    const maxScroll = scrollWidth - container.clientWidth

    // If we are close to the end (or no scrollable area), go to next chapter
    if (maxScroll <= 0 || scrollLeft >= maxScroll - 5) {
      if (this.chapterNumber < this.book.chapterCount) {
        this.goToNextChapter()
      }
    } else {
      // Snap to the next "slot"
      const currentPageIndex = Math.round(scrollLeft / advanceWidth)
      const nextScrollLeft = (currentPageIndex + 1) * advanceWidth

      container.scrollTo({ left: nextScrollLeft, behavior: "smooth" })
    }
  }

  prevPage(): void {
    if (this.viewMode !== "paged") return
    const block = this.bookBlock?.nativeElement
    const container = this.bookContainer?.nativeElement
    if (!container || !block) return

    const style = window.getComputedStyle(block)
    const gap = parseFloat(style.columnGap) || 0
    const paddingLeft = parseFloat(style.paddingLeft) || 0
    const paddingRight = parseFloat(style.paddingRight) || 0

    // Gap only matters when more than 1 column is shown
    const advanceWidth = block.clientWidth - (paddingLeft + paddingRight) + gap

    const scrollLeft = container.scrollLeft

    // If we are close to the start, go to previous chapter
    if (scrollLeft <= 5) {
      if (this.chapterNumber > 1) {
        this.goToPreviousChapter()
      }
    } else {
      // Snap to the previous "slot", clamped to 0
      const currentPageIndex = Math.round(scrollLeft / advanceWidth)
      const prevScrollLeft = Math.max(0, (currentPageIndex - 1) * advanceWidth)

      container.scrollTo({ left: prevScrollLeft, behavior: "smooth" })
    }
  }

  private resizeTimeout: any

  @HostListener("window:resize")
  onWindowResize(): void {
    if (this.viewMode === "paged") {
      clearTimeout(this.resizeTimeout)
      this.resizeTimeout = setTimeout(() => {
        this.snapToNearestPage()
      }, 150)
    }
  }

  private snapToNearestPage(): void {
    const container = this.bookContainer?.nativeElement
    const block = this.bookBlock?.nativeElement
    if (!container || !block) return

    const style = window.getComputedStyle(block)
    const gap = parseFloat(style.columnGap) || 0
    const paddingLeft = parseFloat(style.paddingLeft) || 0
    const paddingRight = parseFloat(style.paddingRight) || 0
    const advanceWidth = block.clientWidth - (paddingLeft + paddingRight) + gap

    const scrollLeft = container.scrollLeft

    const pageIndex = Math.round(scrollLeft / advanceWidth)
    container.scrollTo({ left: pageIndex * advanceWidth, behavior: "smooth" })
  }

  onSwipeLeft(): void {
    if (this.viewMode === "paged") {
      this.nextPage()
    } else {
      this.goToNextChapter()
    }
  }

  onSwipeRight(): void {
    if (this.viewMode === "paged") {
      this.prevPage()
    } else {
      this.goToPreviousChapter()
    }
  }

  goToNextChapter(): void {
    if (this.book.chapterCount >= this.chapterNumber + 1) {
      this.stopAutoScroll()
      this.router.navigate([
        this.bookService.getUrlAbrv(this.book),
        this.chapterNumber + 1,
      ])
    }
  }

  goToPreviousChapter(): void {
    if (this.chapterNumber > 1) {
      this.stopAutoScroll()
      this.router.navigate([
        this.bookService.getUrlAbrv(this.book),
        this.chapterNumber - 1,
      ])
    }
  }

  goToChapter(newChapterNumber: Chapter["number"]): void {
    this.stopAutoScroll()
    this.router.navigate([
      this.bookService.getUrlAbrv(this.book),
      newChapterNumber,
    ])
  }

  onBookSubmit(event: { bookId: string }) {
    const book = this.bookService.findBook(event.bookId)
    this.router.navigate(["/", this.bookService.getUrlAbrv(book), 1])

    this.bookDrawer.close()
  }

  onChapterSubmit(event: { chapterNumber: number }) {
    this.goToChapter(event.chapterNumber)

    this.bookDrawer.close()
  }

  getBook(book: string) {
    this.apiService.getBook(book).subscribe({
      next: (res) => {
        this.book = res
      },
      error: (err) => console.error(err),
    })
  }

  getChapter(
    chapter: Chapter["number"],
    verseStart?: Verse["number"],
    verseEnd?: Verse["number"],
    highlight = true,
  ) {
    this.apiService.getChapter(this.book.id, chapter).subscribe({
      next: (res) => {
        this.chapter = res
        this.chapterNumber = chapter

        this.cdr.detectChanges()

        if (!verseStart) {
          this.scrollToTop()
        } else {
          this.scrollToVerseElement(verseStart, verseEnd, highlight)
        }

        this.preferencesService.setLastBookId(this.book.id)
        this.preferencesService.setLastChapterNumber(this.chapterNumber)
      },
      error: (err) => {
        if (this.book.id === "about") {
          this.chapter = { bookId: "about", number: 1 }
          this.chapterNumber = chapter

          this.cdr.detectChanges()
          if (!verseStart) {
            this.scrollToTop()
          } else {
            this.scrollToVerseElement(verseStart, verseEnd, highlight)
          }

          this.preferencesService.setLastBookId(this.book.id)
          this.preferencesService.setLastChapterNumber(this.chapterNumber)
        } else {
          this.router.navigate(["/", this.bookService.getUrlAbrv(this.book), 1])
        }
        console.error(err)
      },
    })
  }

  scrollToTop() {
    setTimeout(() => {
      this.container._content.scrollTo({ top: 0, behavior: "smooth" })
      if (this.viewMode === "paged") {
        const container = this.bookContainer?.nativeElement
        if (container) {
          container.scrollLeft = 0
        }
      }
    }, 0)
  }

  scrollToVerseElement(
    verseStart: number,
    verseEnd?: number,
    highlight = true,
  ) {
    setTimeout(() => {
      let scrolled = false
      const container = this.bookBlock?.nativeElement
      if (!container) return

      for (let i = verseStart; i <= (verseEnd || verseStart); i++) {
        // Scope search to the book block
        const element = container.querySelector(`[id="${i}"]`) as HTMLElement
        if (element) {
          if (!scrolled) {
            element.scrollIntoView({
              behavior: "smooth",
              block: "center",
              inline: "nearest",
            })
            scrolled = true
          }
          if (highlight) {
            element.style.transition = "background-color 0.5s ease"
            element.style.backgroundColor = "var(--highlight-color)"
            setTimeout(() => {
              element.style.backgroundColor = ""
            }, 2500)
          }
        }
      }
    }, 0)
  }

  openBookDrawer(event: { open: boolean }) {
    if (this.showBooks) {
      this.bookDrawer.toggle().finally(() => {
        this.focusCloseButton()
      })
    } else {
      this.bookDrawer.close().finally(() => {
        this.showBooks = true
        this.bookDrawer.toggle().finally(() => {
          this.focusCloseButton()
        })
      })
    }
  }

  private focusCloseButton() {
    // Optional: could use ViewChild if the button is always present,
    // but since it's inside conditional templates or drawers, querySelector is sometimes pragmatic.
    // However, let's try to trust the user's focus management or leave it for now.
    // I will leave it as is to avoid breaking focus logic without testing,
    // but the prompt asked to replace direct DOM queries.
    // Let's use the nativeElement of the component to scope it at least.
    const closeButton = this.bookDrawerCloseButton?.nativeElement as HTMLElement
    if (closeButton) {
      closeButton.blur()
    }
  }

  openChapterDrawer(event: { open: boolean }) {
    if (!this.showBooks) {
      this.bookDrawer.toggle().finally(() => {
        this.focusCloseButton()
      })
    } else {
      this.bookDrawer.close().finally(() => {
        this.showBooks = false
        this.bookDrawer.toggle().finally(() => {
          this.focusCloseButton()
        })
      })
    }
  }

  dismissBookDrawer(): void {
    this.bookDrawer.close()
  }

  toggleAutoScrollControlsVisibility(): void {
    this.showAutoScrollControls = !this.showAutoScrollControls
    this.preferencesService.setAutoScrollControlsVisible(
      this.showAutoScrollControls,
    )
    this.stopAutoScroll()
  }

  onToggleViewMode(): void {
    this.viewMode = this.viewMode === "scrolling" ? "paged" : "scrolling"
    this.preferencesService.setViewMode(this.viewMode)
    this.cdr.markForCheck()
    // Reset scroll when switching to paged? Or keep position?
    // Paged View relies on overflow-x scroll or just columns.
    // If we switch to paged, we might start at page 1 (scrollLeft 0).
    if (this.viewMode === "paged") {
      this.stopAutoScroll()
      this.showAutoScrollControls = false
      this.preferencesService.setAutoScrollControlsVisible(false)
      // Wait for render
      setTimeout(() => {
        // Maybe scroll to start? Or try to map current scroll position to page?
        // Mapping is hard. Let's start at beginning or keep as is.
        // CSS columns usually start at top left.
        const container = this.bookContainer?.nativeElement
        if (container) {
          container.scrollLeft = 0
        }
      }, 0)
    }
  }

  toggleAutoScroll(): void {
    if (!this.autoScrollEnabled) {
      this.startAutoScroll()
      return
    }

    this.stopAutoScroll()
  }

  increaseAutoScrollSpeed(): void {
    this.updateAutoScrollSpeed(this.autoScrollService.AUTO_SCROLL_STEP)
  }

  decreaseAutoScrollSpeed(): void {
    this.updateAutoScrollSpeed(-this.autoScrollService.AUTO_SCROLL_STEP)
  }

  private updateAutoScrollSpeed(delta: number): void {
    const nextSpeed = this.autoScrollService.updateAutoScrollSpeed(delta)
    this.preferencesService.setAutoScrollSpeed(nextSpeed)
  }

  private startAutoScroll(): void {
    const content = this.container?._content?.getElementRef().nativeElement
    const lineHeightElement = this.bookBlock?.nativeElement
    this.autoScrollService.start({
      scrollElement: content,
      lineHeightElement,
      onStop: () => {
        this.safeMarkForCheck()
      },
    })
  }

  private stopAutoScroll(): void {
    this.autoScrollService.stop()
    this.safeMarkForCheck()
  }

  private safeMarkForCheck(): void {
    try {
      this.cdr.markForCheck()
    } catch {
      // Safely ignore errors if change detection cannot be triggered (e.g., component destroyed)
    }
  }

  get autoScrollEnabled(): boolean {
    return this.autoScrollService.autoScrollEnabled
  }

  get autoScrollLinesPerSecond(): number {
    return this.autoScrollService.autoScrollLinesPerSecond
  }

  get autoScrollSpeedLabel(): string {
    return this.autoScrollService.getAutoScrollSpeedLabel(
      this.autoScrollLinesPerSecond,
    )
  }

  get MIN_AUTO_SCROLL_LPS(): number {
    return this.autoScrollService.MIN_AUTO_SCROLL_LPS
  }

  get MAX_AUTO_SCROLL_LPS(): number {
    return this.autoScrollService.MAX_AUTO_SCROLL_LPS
  }

  @HostListener("window:keydown", ["$event"])
  onArrowPress(event: KeyboardEvent): void {
    if (event.key === "ArrowLeft") {
      this.viewMode === "paged" ? this.prevPage() : this.goToPreviousChapter()
    }
    if (event.key === "ArrowRight") {
      this.viewMode === "paged" ? this.nextPage() : this.goToNextChapter()
    }
  }

  getBooks() {
    return this.bookService.getBooks()
  }

  onIncreaseFontSize(): void {
    this.gestures.increaseFontSize()
  }

  onDecreaseFontSize(): void {
    this.gestures.decreaseFontSize()
  }
}
