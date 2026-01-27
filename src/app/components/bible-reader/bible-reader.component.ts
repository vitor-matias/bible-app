import { animate, state, style, transition, trigger } from "@angular/animations"
import { CommonModule } from "@angular/common"
// biome-ignore lint/style/useImportType: <explanation>
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
import type { Subscription } from "rxjs"
import { combineLatest } from "rxjs"
import { UnifiedGesturesDirective } from "../../directives/unified-gesture.directive"
import { BibleApiService } from "../../services/bible-api.service"
import { BookService } from "../../services/book.service"
import { KeepAwakeService } from "../../services/keep-awake.service"
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

  @ViewChild("bookDrawerCloseButton") bookDrawerCloseButton!: ElementRef
  @ViewChild("chapterDrawerCloseButton") chapterDrawerCloseButton!: ElementRef

  private routeSub: Subscription | undefined

  book!: Book
  chapterNumber = 1
  chapter!: Chapter
  scrolled!: boolean
  bookParam: string | null = null
  chapterParam: string | null = null
  showBooks = true
  autoScrollEnabled = false
  autoScrollLinesPerSecond = 1
  readonly MIN_AUTO_SCROLL_LPS = 0.25
  readonly MAX_AUTO_SCROLL_LPS = 4
  private readonly AUTO_SCROLL_STEP = 0.25
  showAutoScrollControls = false
  private autoScrollFrame?: number
  private lastAutoScrollTimestamp?: number
  private accumulatedScrollDelta = 0
  private cachedLineHeight = 24
  private lineHeightObserver?: ResizeObserver

  constructor(
    private apiService: BibleApiService,
    private bookService: BookService,
    private cdr: ChangeDetectorRef,
    private keepAwakeService: KeepAwakeService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    const storedSpeed = localStorage.getItem("autoScrollLinesPerSecond")
    const parsedSpeed = storedSpeed ? Number.parseFloat(storedSpeed) : 0
    if (Number.isFinite(parsedSpeed) && parsedSpeed > 0) {
      this.autoScrollLinesPerSecond = Math.min(
        this.MAX_AUTO_SCROLL_LPS,
        Math.max(this.MIN_AUTO_SCROLL_LPS, parsedSpeed),
      )
    }
    const storedControls = localStorage.getItem("autoScrollControlsVisible")
    if (storedControls !== null) {
      this.showAutoScrollControls = storedControls === "true"
    }
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
        this.bookParam || localStorage.getItem("book") || "about"
      const storedChapter =
        this.chapterParam || localStorage.getItem("chapter") || "1"

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

      this.routeSub = combineLatest([
        this.route.paramMap,
        this.route.queryParamMap,
      ]).subscribe(([params, queryParams]) => {
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
        this.getChapter(chapterParam, verseStartParam, verseEndParam, highlight)
      })
    })
  }

  ngOnDestroy(): void {
    this.stopAutoScroll()
    this.cleanupLineHeightObserver()
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

        localStorage.setItem("book", this.book.id)
        localStorage.setItem("chapter", this.chapterNumber.toString())
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

          localStorage.setItem("book", this.book.id)
          localStorage.setItem("chapter", this.chapterNumber.toString())
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
    }, 0)
  }

  scrollToVerseElement(
    verseStart: number,
    verseEnd?: number,
    highlight = true,
  ) {
    setTimeout(() => {
      let scrolled = false
      for (let i = verseStart; i <= (verseEnd || verseStart); i++) {
        const element = document.getElementById(`${i}`)
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
        const closeButton = document.querySelector(
          ".bookSelector .dismiss-button",
        ) as HTMLElement
        if (closeButton) {
          closeButton.blur()
        }
      })
    } else {
      this.bookDrawer.close().finally(() => {
        this.showBooks = true
        this.bookDrawer.toggle().finally(() => {
          const closeButton = document.querySelector(
            ".bookSelector .dismiss-button",
          ) as HTMLElement
          if (closeButton) {
            closeButton.blur()
          }
        })
      })
    }
  }

  openChapterDrawer(event: { open: boolean }) {
    if (!this.showBooks) {
      this.bookDrawer.toggle().finally(() => {
        const closeButton = document.querySelector(
          ".bookSelector .dismiss-button",
        ) as HTMLElement
        if (closeButton) {
          closeButton.blur()
        }
      })
    } else {
      this.bookDrawer.close().finally(() => {
        this.showBooks = false
        this.bookDrawer.toggle().finally(() => {
          const closeButton = document.querySelector(
            ".bookSelector .dismiss-button",
          ) as HTMLElement
          if (closeButton) {
            closeButton.blur()
          }
        })
      })
    }
  }

  dismissBookDrawer(): void {
    this.bookDrawer.close()
  }

  toggleAutoScrollControlsVisibility(): void {
    this.showAutoScrollControls = !this.showAutoScrollControls
    localStorage.setItem(
      "autoScrollControlsVisible",
      this.showAutoScrollControls.toString(),
    )
    this.stopAutoScroll()
  }

  toggleAutoScroll(): void {
    if (!this.autoScrollEnabled) {
      this.startAutoScroll()
      return
    }

    this.stopAutoScroll()
  }

  increaseAutoScrollSpeed(): void {
    this.updateAutoScrollSpeed(this.AUTO_SCROLL_STEP)
  }

  decreaseAutoScrollSpeed(): void {
    this.updateAutoScrollSpeed(-this.AUTO_SCROLL_STEP)
  }

  private updateAutoScrollSpeed(delta: number): void {
    const nextSpeed = Math.min(
      this.MAX_AUTO_SCROLL_LPS,
      Math.max(this.MIN_AUTO_SCROLL_LPS, this.autoScrollLinesPerSecond + delta),
    )
    this.autoScrollLinesPerSecond = Number(nextSpeed.toFixed(2))
    localStorage.setItem(
      "autoScrollLinesPerSecond",
      this.autoScrollLinesPerSecond.toString(),
    )
  }

  private startAutoScroll(): void {
    this.stopAutoScroll()
    if (!this.container?._content) {
      this.autoScrollEnabled = false
      return
    }

    this.lastAutoScrollTimestamp = undefined
    this.accumulatedScrollDelta = 0
    this.autoScrollEnabled = true
    this.keepAwakeService.start()
    this.setupLineHeightObserver()
    this.autoScrollFrame = window.requestAnimationFrame((timestamp) => {
      this.stepAutoScroll(timestamp)
    })
  }

  private stopAutoScroll(): void {
    this.autoScrollEnabled = false
    if (this.autoScrollFrame) {
      window.cancelAnimationFrame(this.autoScrollFrame)
      this.autoScrollFrame = undefined
    }
    this.lastAutoScrollTimestamp = undefined
    this.cleanupLineHeightObserver()
    this.keepAwakeService.stop()
    try {
      this.cdr.markForCheck()
    } catch {
      // Safely ignore errors if change detection cannot be triggered (e.g., component destroyed)
    }
  }

  private stepAutoScroll(timestamp: number): void {
    const content = this.container?._content?.getElementRef().nativeElement
    if (!content) {
      this.autoScrollEnabled = false
      this.stopAutoScroll()
      return
    }

    if (this.lastAutoScrollTimestamp === undefined) {
      this.lastAutoScrollTimestamp = timestamp
    }

    const deltaSeconds = Math.min(
      0.1,
      (timestamp - this.lastAutoScrollTimestamp) / 1000,
    )
    const lineHeight = this.cachedLineHeight
    const scrollDelta =
      lineHeight * this.autoScrollLinesPerSecond * deltaSeconds

    // Accumulate scroll delta to avoid micro-scrolls at very slow speeds
    this.accumulatedScrollDelta += scrollDelta

    // Only apply scroll when accumulated delta is at least 0.5px to prevent jank
    if (Math.abs(this.accumulatedScrollDelta) >= 0.5) {
      const nextTop = Math.min(
        content.scrollHeight - content.clientHeight,
        content.scrollTop + this.accumulatedScrollDelta,
      )

      content.scrollTop = nextTop
      this.accumulatedScrollDelta = 0
    }

    this.lastAutoScrollTimestamp = timestamp

    if (content.scrollTop + 5 >= content.scrollHeight - content.clientHeight) {
      this.stopAutoScroll()
      return
    }

    if (this.autoScrollEnabled) {
      this.autoScrollFrame = window.requestAnimationFrame((nextTimestamp) => {
        this.stepAutoScroll(nextTimestamp)
      })
    }
  }

  private getLineHeight(): number {
    const container = document.querySelector<HTMLElement>(".bookBlock")
    if (!container) {
      return 24
    }

    const computed = window.getComputedStyle(container)
    const fontSize = Number.parseFloat(computed.fontSize || "16")
    const lineHeightValue = computed.lineHeight
    const lineHeight = Number.parseFloat(lineHeightValue)
    if (Number.isFinite(lineHeight)) {
      return lineHeight
    }

    return fontSize
  }

  private setupLineHeightObserver(): void {
    this.cleanupLineHeightObserver()

    const container = document.querySelector<HTMLElement>(".bookBlock")
    if (!container) {
      this.cachedLineHeight = 24
      return
    }

    // Initialize cached line height
    this.cachedLineHeight = this.getLineHeight()

    // Create ResizeObserver to detect font size changes
    this.lineHeightObserver = new ResizeObserver(() => {
      this.cachedLineHeight = this.getLineHeight()
    })

    this.lineHeightObserver.observe(container)
  }

  private cleanupLineHeightObserver(): void {
    if (this.lineHeightObserver) {
      this.lineHeightObserver.disconnect()
      this.lineHeightObserver = undefined
    }
  }

  @HostListener("window:keydown", ["$event"])
  onArrowPress(event: KeyboardEvent): void {
    if (event.key === "ArrowLeft") {
      this.goToPreviousChapter()
    }
    if (event.key === "ArrowRight") {
      this.goToNextChapter()
    }
  }

  getBooks() {
    return this.bookService.getBooks()
  }
}
