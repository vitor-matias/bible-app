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
import { AnalyticsService } from "../../services/analytics.service"
import { AutoScrollService } from "../../services/auto-scroll.service"
import { BibleReaderAnimationService } from "../../services/bible-reader-animation.service"
import { BookService } from "../../services/book.service"
import {
  ChapterContainers,
  ChapterLoaderService,
} from "../../services/chapter-loader.service"
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

  @ViewChild("bookDrawer") bookDrawer!: MatDrawer
  @ViewChild("container") container!: MatDrawerContainer
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

  showBooks = true
  showAutoScrollControls = false
  private autoScrollControlsPreference = false
  viewMode: "scrolling" | "paged" = "scrolling"

  isFirstPage = true
  isLastPage = false

  get effectiveViewMode(): "scrolling" | "paged" {
    return this.book?.id === "about" ? "scrolling" : this.viewMode
  }

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
    private bookService: BookService,
    private preferencesService: PreferencesService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute,
    private animationService: BibleReaderAnimationService,
    private analyticsService: AnalyticsService,
    private chapterLoader: ChapterLoaderService,
  ) {}

  ngOnInit(): void {
    const storedSpeed = this.preferencesService.getAutoScrollSpeed()
    if (storedSpeed) {
      this.autoScrollService.setAutoScrollLinesPerSecond(storedSpeed)
    }

    this.viewMode = this.preferencesService.getViewMode()
    this.autoScrollControlsPreference =
      this.preferencesService.getAutoScrollControlsVisible()
    this.showAutoScrollControls =
      this.viewMode === "scrolling" && this.autoScrollControlsPreference

    /**
     * Primary State Machine Stream:
     * Listens to the global books payload and intercepts URL params (`book`, `chapter`, `verseStart`).
     * It maps the active params to the loaded books and forces a redirect if the URL is missing params
     * or uses legacy preferences. Finally, it chains into the query param map to reactively update the UI.
     */
    this.bookService.books$
      .pipe(
        takeUntil(this.destroy$),
        switchMap((_books) => {
          this.books = _books
          const bookParam =
            this.router.routerState.snapshot.root.firstChild?.params[
              "book"
            ]?.toLowerCase()
          const chapterParam =
            this.router.routerState.snapshot.root.firstChild?.params["chapter"]
          const queryParams =
            this.router.routerState.snapshot.root.firstChild?.queryParams || {}

          const storedBook =
            bookParam || this.preferencesService.getLastBookId() || "about"
          const storedChapter =
            chapterParam ||
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
        this.bookDrawer?.close?.()
      })
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
    this.chapterLoader.cancel()
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  onSwipeLeft(): void {
    this.effectiveViewMode === "paged"
      ? this.pagedNav?.nextPage()
      : this.goToNextChapter()
  }

  onSwipeRight(): void {
    this.effectiveViewMode === "paged"
      ? this.pagedNav?.prevPage()
      : this.goToPreviousChapter()
  }

  goToNextChapter(): void {
    if (this.book.chapterCount >= this.chapterNumber + 1) {
      this.autoScrollService.stop()
      this.chapterLoader.isNavigatingForwards = true
      this.router.navigate([
        this.bookService.getUrlAbrv(this.book),
        this.chapterNumber + 1,
      ])
    }
  }

  goToPreviousChapter(): void {
    if (this.chapterNumber > 1) {
      this.autoScrollService.stop()
      this.chapterLoader.isNavigatingBackwards = true
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

  @HostListener("window:keydown", ["$event"])
  onArrowPress(event: KeyboardEvent): void {
    if (event.key === "ArrowLeft") {
      this.effectiveViewMode === "paged"
        ? this.pagedNav?.prevPage()
        : this.goToPreviousChapter()
    }
    if (event.key === "ArrowRight") {
      this.effectiveViewMode === "paged"
        ? this.pagedNav?.nextPage()
        : this.goToNextChapter()
    }
  }

  // ── Drawer management ──────────────────────────────────────────────────────

  onBookSubmit(event: { bookId: string }) {
    const book = this.bookService.findBook(event.bookId)
    this.router.navigate(["/", this.bookService.getUrlAbrv(book), 1])
    this.bookDrawer.close()
  }

  onChapterSubmit(event: { chapterNumber: number }) {
    this.goToChapter(event.chapterNumber)
    this.bookDrawer.close()
  }

  openBookDrawer(_event: { open: boolean }) {
    if (this.showBooks) {
      this.bookDrawer.toggle().finally(() => this.blurCloseButton())
    } else {
      this.bookDrawer.close().finally(() => {
        this.showBooks = true
        this.bookDrawer.toggle().finally(() => this.blurCloseButton())
      })
    }
  }

  openChapterDrawer(_event: { open: boolean }) {
    if (!this.showBooks) {
      this.bookDrawer.toggle().finally(() => this.blurCloseButton())
    } else {
      this.bookDrawer.close().finally(() => {
        this.showBooks = false
        this.bookDrawer.toggle().finally(() => this.blurCloseButton())
      })
    }
  }

  dismissBookDrawer(): void {
    this.bookDrawer.close()
  }

  /**
   * Removes focus from the close button to prevent a lingering focus ring
   * on the mobile drawer UI after interaction.
   */
  private blurCloseButton(): void {
    const btn = this.bookDrawerCloseButton?.nativeElement as HTMLElement
    btn?.blur()
  }

  // ── View mode & auto-scroll ────────────────────────────────────────────────

  onToggleViewMode(): void {
    this.viewMode = this.viewMode === "scrolling" ? "paged" : "scrolling"
    this.preferencesService.setViewMode(this.viewMode)

    void this.analyticsService.track("view_mode_toggle", {
      mode: this.viewMode,
      book: this.book?.id,
      chapter: this.chapterNumber,
    })

    this.cdr.markForCheck()

    if (this.viewMode === "paged") {
      this.autoScrollService.stop()
      this.showAutoScrollControls = false
      setTimeout(() => {
        const container = this.bookContainer?.nativeElement
        if (container) container.scrollLeft = 0
      }, 0)
    }
  }

  toggleAutoScrollControlsVisibility(): void {
    this.showAutoScrollControls = !this.showAutoScrollControls
    this.autoScrollControlsPreference = this.showAutoScrollControls
    this.preferencesService.setAutoScrollControlsVisible(
      this.showAutoScrollControls,
    )
  }

  // ── Font size ──────────────────────────────────────────────────────────────

  onIncreaseFontSize(): void {
    this.gestures.increaseFontSize()
  }

  onDecreaseFontSize(): void {
    this.gestures.decreaseFontSize()
  }

  // ── Verse helpers ──────────────────────────────────────────────────────────

  checkIfNextVerseStartsWithQuote(index: number): boolean {
    if (!this.chapter?.verses) return false
    const nextVerse = this.chapter.verses[index + 1]
    if (!nextVerse?.text || nextVerse.text.length === 0) return false

    const firstDisplayableIdx = nextVerse.text.findIndex(
      (t) => t.type !== "footnote" && t.type !== "references",
    )
    if (firstDisplayableIdx === -1) return false
    return nextVerse.text[firstDisplayableIdx].type === "quote"
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private getChapter(
    chapter: Chapter["number"],
    verseStart?: Verse["number"],
    verseEnd?: Verse["number"],
    highlight = true,
  ): void {
    const containers: ChapterContainers = {
      bookBlock: this.bookBlock?.nativeElement ?? undefined,
      bookContainer: this.bookContainer?.nativeElement ?? undefined,
      drawerContent: this.drawerContent?.nativeElement ?? undefined,
      effectiveViewMode: this.effectiveViewMode,
      pagedNav: this.pagedNav,
    }

    this.chapterLoader.loadChapter(
      this.book,
      chapter,
      containers,
      (loadedChapter, loadedChapterNumber) => {
        this.chapter = loadedChapter
        this.chapterNumber = loadedChapterNumber
        this.cdr.detectChanges()
      },
      { verseStart, verseEnd, highlight },
    )
  }
}
