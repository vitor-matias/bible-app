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
import { AutoScrollService } from "../../services/auto-scroll.service"
import { BibleApiService } from "../../services/bible-api.service"
import { BookService } from "../../services/book.service"
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
  showAutoScrollControls = false

  constructor(
    private autoScrollService: AutoScrollService,
    private apiService: BibleApiService,
    private bookService: BookService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    const storedSpeed = localStorage.getItem("autoScrollLinesPerSecond")
    const parsedSpeed = storedSpeed ? Number.parseFloat(storedSpeed) : 0
    if (Number.isFinite(parsedSpeed) && parsedSpeed > 0) {
      this.autoScrollService.setAutoScrollLinesPerSecond(parsedSpeed)
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
    this.updateAutoScrollSpeed(this.autoScrollService.AUTO_SCROLL_STEP)
  }

  decreaseAutoScrollSpeed(): void {
    this.updateAutoScrollSpeed(-this.autoScrollService.AUTO_SCROLL_STEP)
  }

  private updateAutoScrollSpeed(delta: number): void {
    const nextSpeed = this.autoScrollService.updateAutoScrollSpeed(delta)
    localStorage.setItem("autoScrollLinesPerSecond", nextSpeed.toString())
  }

  private startAutoScroll(): void {
    const content = this.container?._content?.getElementRef().nativeElement
    const lineHeightElement = document.querySelector<HTMLElement>(".bookBlock")
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

  get MIN_AUTO_SCROLL_LPS(): number {
    return this.autoScrollService.MIN_AUTO_SCROLL_LPS
  }

  get MAX_AUTO_SCROLL_LPS(): number {
    return this.autoScrollService.MAX_AUTO_SCROLL_LPS
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
