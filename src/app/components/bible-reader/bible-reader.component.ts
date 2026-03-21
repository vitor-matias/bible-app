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
  MatDrawerContent,
  MatSidenavModule,
} from "@angular/material/sidenav"
import { ActivatedRoute, Router } from "@angular/router"
import { combineLatest, Subject } from "rxjs"
import { switchMap, takeUntil } from "rxjs/operators"
import {
  PagedNavigationDirective,
  PageState,
} from "../../directives/paged-navigation/paged-navigation.directive"
import { UnifiedGesturesDirective } from "../../directives/unified-gesture.directive"
import { AutoScrollService } from "../../services/auto-scroll.service"
import { BibleApiService } from "../../services/bible-api.service"
import { BibleReaderAnimationService } from "../../services/bible-reader-animation.service"
import { BookService } from "../../services/book.service"
import { PreferencesService } from "../../services/preferences.service"
import { AboutComponent } from "../about/about.component"
import { AutoScrollControlsComponent } from "../auto-scroll-controls/auto-scroll-controls.component"
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
    PagedNavigationDirective,
    AutoScrollControlsComponent,
  ],
})
export class BibleReaderComponent implements OnDestroy {
  private destroy$ = new Subject<void>()

  @ViewChild("bookDrawer")
  bookDrawer!: MatDrawer

  @ViewChild("container")
  container!: MatDrawerContainer

  @ViewChild(MatDrawerContent, { read: ElementRef })
  drawerContent!: ElementRef<HTMLElement>

  @ViewChild(UnifiedGesturesDirective) gestures!: UnifiedGesturesDirective
  @ViewChild(PagedNavigationDirective) pagedNav?: PagedNavigationDirective

  @ViewChild("bookDrawerCloseButton") bookDrawerCloseButton!: ElementRef
  @ViewChild("chapterDrawerCloseButton") chapterDrawerCloseButton!: ElementRef
  @ViewChild("bookContainer") bookContainer!: ElementRef

  @ViewChild("bookBlock") bookBlock!: ElementRef

  book!: Book
  books: Book[] = []
  chapterNumber = 1
  chapter!: Chapter

  bookParam: string | null = null
  chapterParam: string | null = null
  showBooks = true
  showAutoScrollControls = false
  viewMode: "scrolling" | "paged" = "scrolling"

  isNavigatingForwards = false
  isNavigatingBackwards = false
  isFirstPage = true
  isLastPage = false

  onPageStateChange(state: PageState): void {
    if (
      this.isFirstPage !== state.isFirstPage ||
      this.isLastPage !== state.isLastPage
    ) {
      this.isFirstPage = state.isFirstPage
      this.isLastPage = state.isLastPage
      this.cdr.markForCheck()
    }
  }

  constructor(
    private autoScrollService: AutoScrollService,
    private apiService: BibleApiService,
    private bookService: BookService,
    private preferencesService: PreferencesService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute,
    private animationService: BibleReaderAnimationService,
  ) {}

  ngOnInit(): void {
    const storedSpeed = this.preferencesService.getAutoScrollSpeed()
    if (storedSpeed) {
      this.autoScrollService.setAutoScrollLinesPerSecond(storedSpeed)
    }

    this.viewMode = this.preferencesService.getViewMode()

    this.showAutoScrollControls =
      this.preferencesService.getAutoScrollControlsVisible()
    this.bookService.books$
      .pipe(
        takeUntil(this.destroy$),
        switchMap((_books) => {
          this.books = _books
          this.bookParam =
            this.router.routerState.snapshot.root.firstChild?.params[
              "book"
            ]?.toLowerCase()
          this.chapterParam =
            this.router.routerState.snapshot.root.firstChild?.params["chapter"]

          const queryParams =
            this.router.routerState.snapshot.root.firstChild?.queryParams || {}

          const storedBook =
            this.bookParam || this.preferencesService.getLastBookId() || "about"
          const storedChapter =
            this.chapterParam ||
            this.preferencesService.getLastChapterNumber()?.toString() ||
            "1"

          if (storedBook && storedChapter) {
            this.book = this.bookService.findBook(storedBook)

            this.chapterNumber = Number.parseInt(storedChapter, 10)

            const parsedVerseStart = queryParams["verseStart"]
              ? Number.parseInt(queryParams["verseStart"], 10)
              : undefined
            const parsedVerseEnd = queryParams["verseEnd"]
              ? Number.parseInt(queryParams["verseEnd"], 10)
              : undefined

            this.router.navigate(
              [this.bookService.getUrlAbrv(this.book), this.chapterNumber],
              {
                queryParams: Object.keys(queryParams).length ? queryParams : {},
                replaceUrl: true,
              },
            )
            this.getChapter(
              this.chapterNumber,
              parsedVerseStart,
              parsedVerseEnd,
            )
          }

          return combineLatest([this.route.paramMap, this.route.queryParamMap])
        }),
      )
      .subscribe(([params, queryParams]) => {
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
          if (verseStartParam !== undefined) {
            this.animationService.scrollToVerseElement(
              this.bookBlock?.nativeElement,
              this.bookContainer?.nativeElement,
              verseStartParam,
              verseEndParam,
              highlight,
            )
          }
          return
        }

        this.book = tempBook
        this.getChapter(chapterParam, verseStartParam, verseEndParam, highlight)
        this.bookDrawer?.close()
      })
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
    // AutoScrollService handles its own cleanup now if we stop it, or the component stopping it
  }

  onSwipeLeft(): void {
    if (this.viewMode === "paged") {
      this.pagedNav?.nextPage()
    } else {
      this.goToNextChapter()
    }
  }

  onSwipeRight(): void {
    if (this.viewMode === "paged") {
      this.pagedNav?.prevPage()
    } else {
      this.goToPreviousChapter()
    }
  }

  goToNextChapter(): void {
    if (this.book.chapterCount >= this.chapterNumber + 1) {
      this.autoScrollService.stop()
      this.isNavigatingForwards = true

      this.router.navigate([
        this.bookService.getUrlAbrv(this.book),
        this.chapterNumber + 1,
      ])
    }
  }

  goToPreviousChapter(): void {
    if (this.chapterNumber > 1) {
      this.autoScrollService.stop()
      this.isNavigatingBackwards = true

      this.router.navigate([
        this.bookService.getUrlAbrv(this.book),
        this.chapterNumber - 1,
      ])
    }
  }

  goToChapter(newChapterNumber: Chapter["number"]): void {
    this.autoScrollService.stop()
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
        const finalize = () => {
          if (this.bookContainer?.nativeElement) {
            // Hide BEFORE change detection paints the new chapter
            this.bookContainer.nativeElement.style.transition = "none"
            this.bookContainer.nativeElement.style.opacity = "0"
          }

          this.chapter = res
          this.chapterNumber = chapter

          this.cdr.detectChanges()

          const startAtBottom = this.isNavigatingBackwards
          this.isNavigatingBackwards = false
          this.isNavigatingForwards = false

          if (!verseStart) {
            this.animationService.scrollToTop(
              this.drawerContent?.nativeElement,
              this.bookContainer?.nativeElement,
              this.viewMode,
              startAtBottom,
              () => this.pagedNav?.ensureAlignedScrollWidth(),
            )
          } else {
            this.animationService.scrollToVerseElement(
              this.bookBlock?.nativeElement,
              this.bookContainer?.nativeElement,
              verseStart,
              verseEnd,
              highlight,
            )
          }

          this.preferencesService.setLastBookId(this.book.id)
          this.preferencesService.setLastChapterNumber(this.chapterNumber)
        }

        const container = this.bookContainer?.nativeElement
        if (
          container &&
          (this.isNavigatingBackwards || this.isNavigatingForwards)
        ) {
          this.animationService
            .triggerSlideOutAnimation(container, this.isNavigatingBackwards)
            .then(() => finalize())
        } else {
          finalize()
        }
      },
      error: (err) => {
        const finalizeError = () => {
          if (this.bookContainer?.nativeElement) {
            this.bookContainer.nativeElement.style.transition = "none"
            this.bookContainer.nativeElement.style.opacity = "0"
          }

          if (this.book.id === "about") {
            this.chapter = { bookId: "about", number: 1 }
            this.chapterNumber = chapter

            this.cdr.detectChanges()

            const startAtBottom = this.isNavigatingBackwards
            this.isNavigatingBackwards = false
            this.isNavigatingForwards = false

            if (!verseStart) {
              this.animationService.scrollToTop(
                this.drawerContent?.nativeElement,
                this.bookContainer?.nativeElement,
                this.viewMode,
                startAtBottom,
                () => this.pagedNav?.ensureAlignedScrollWidth(),
              )
            } else {
              this.animationService.scrollToVerseElement(
                this.bookBlock?.nativeElement,
                this.bookContainer?.nativeElement,
                verseStart,
                verseEnd,
                highlight,
              )
            }

            this.preferencesService.setLastBookId(this.book.id)
            this.preferencesService.setLastChapterNumber(this.chapterNumber)
          } else {
            this.router.navigate([
              "/",
              this.bookService.getUrlAbrv(this.book),
              1,
            ])
          }
          console.error(err)
        }

        const container = this.bookContainer?.nativeElement
        if (
          container &&
          (this.isNavigatingBackwards || this.isNavigatingForwards)
        ) {
          this.animationService
            .triggerSlideOutAnimation(container, this.isNavigatingBackwards)
            .then(() => finalizeError())
        } else {
          finalizeError()
        }
      },
    })
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
  }

  onToggleViewMode(): void {
    this.viewMode = this.viewMode === "scrolling" ? "paged" : "scrolling"
    this.preferencesService.setViewMode(this.viewMode)

    if (globalThis.umami) {
      globalThis.umami.track("view_mode_toggle", {
        mode: this.viewMode,
        book: this.book?.id,
        chapter: this.chapterNumber,
      })
    }

    this.cdr.markForCheck()
    // Reset scroll when switching to paged? Or keep position?
    // Paged View relies on overflow-x scroll or just columns.
    // If we switch to paged, we might start at page 1 (scrollLeft 0).
    if (this.viewMode === "paged") {
      this.autoScrollService.stop()
      this.showAutoScrollControls = false
      this.preferencesService.setAutoScrollControlsVisible(false)
      // Wait for render
      setTimeout(() => {
        const container = this.bookContainer?.nativeElement
        if (container) {
          container.scrollLeft = 0
        }
      }, 0)
    }
  }

  @HostListener("window:keydown", ["$event"])
  onArrowPress(event: KeyboardEvent): void {
    if (event.key === "ArrowLeft") {
      this.viewMode === "paged"
        ? this.pagedNav?.prevPage()
        : this.goToPreviousChapter()
    }
    if (event.key === "ArrowRight") {
      this.viewMode === "paged"
        ? this.pagedNav?.nextPage()
        : this.goToNextChapter()
    }
  }

  onIncreaseFontSize(): void {
    this.gestures.increaseFontSize()
  }

  onDecreaseFontSize(): void {
    this.gestures.decreaseFontSize()
  }

  checkIfNextVerseStartsWithQuote(index: number): boolean {
    if (!this.chapter || !this.chapter.verses) return false
    const nextVerse = this.chapter.verses[index + 1]
    if (!nextVerse || !nextVerse.text || nextVerse.text.length === 0)
      return false

    const firstDisplayableIdx = nextVerse.text.findIndex(
      (t) => t.type !== "footnote" && t.type !== "references",
    )

    if (firstDisplayableIdx === -1) return false

    return nextVerse.text[firstDisplayableIdx].type === "quote"
  }
}
