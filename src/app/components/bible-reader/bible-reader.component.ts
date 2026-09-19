import { CommonModule, isPlatformBrowser } from "@angular/common"
import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Injector,
  inject,
  type OnDestroy,
  type OnInit,
  PLATFORM_ID,
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
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar"
import { ActivatedRoute, Router, RouterLink } from "@angular/router"
import { combineLatest, Subject, Subscription } from "rxjs"
import { switchMap, take, takeUntil } from "rxjs/operators"
import {
  PagedNavigationDirective,
  PageState,
} from "../../directives/paged-navigation/paged-navigation.directive"
import { UnifiedGesturesDirective } from "../../directives/unified-gesture.directive"
import { AnalyticsService } from "../../services/analytics.service"
import { AutoScrollService } from "../../services/auto-scroll.service"
import { BibleApiService } from "../../services/bible-api.service"
import { BibleReaderAnimationService } from "../../services/bible-reader-animation.service"
import { BookService } from "../../services/book.service"
import { NetworkService } from "../../services/network.service"
import { PreferencesService } from "../../services/preferences.service"
import { PwaInstallService } from "../../services/pwa-install.service"
import { SeoService } from "../../services/seo.service"
import { isMobileDevice } from "../../utils/mobile-device"
import { AboutComponent } from "../about/about.component"
import { AutoScrollControlsComponent } from "../auto-scroll-controls/auto-scroll-controls.component"
import { BookIntroComponent } from "../book-intro/book-intro.component"
import { BookSelectorComponent } from "../book-selector/book-selector.component"
import { ChapterSelectorComponent } from "../chapter-selector/chapter-selector.component"
import { HeaderComponent } from "../header/header.component"
import { VerseComponent } from "../verse/verse.component"
import { VerseCardsComponent } from "../verse-cards/verse-cards.component"

/**
 * In the card view every verse has a resting position of its own: the top of
 * its card. Aiming a deep link there, rather than centring the verse's text,
 * lands the scroller exactly on a snap point instead of between two — where
 * mandatory snapping settles on whichever is nearer, which can be the next
 * verse — and shows a verse taller than the screen from its first line.
 */
const scrollCardIntoView = (element: HTMLElement): void => {
  ;(element.closest("article") ?? element).scrollIntoView({
    behavior: "smooth",
    block: "start",
  })
}

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
    MatSnackBarModule,
    AboutComponent,
    ChapterSelectorComponent,
    MatIconModule,
    MatButtonModule,
    UnifiedGesturesDirective,
    PagedNavigationDirective,
    AutoScrollControlsComponent,
    BookIntroComponent,
    RouterLink,
    VerseCardsComponent,
  ],
})
export class BibleReaderComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>()
  private chapterSubscription?: Subscription
  private injector = inject(Injector)
  private platformId = inject(PLATFORM_ID)

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
  private autoScrollControlsPreference = false
  viewMode: "scrolling" | "paged" = "scrolling"
  /** The reader turned on BibleScroll, the experimental one-verse-per-card view. */
  cardsView = false
  private isMobile = false

  isNavigatingForwards = false
  isNavigatingBackwards = false
  previousChapterLink: (string | number)[] = []
  nextChapterLink: (string | number)[] = []
  /** The chapter last asked for, which an async load must still match. */
  private pendingChapter?: Chapter["number"]
  isFirstPage = true
  isLastPage = false

  get effectiveViewMode(): "scrolling" | "paged" {
    // The cards ride on the vertical scroller, so they displace paged columns.
    return this.book?.id === "about" || this.showCards
      ? "scrolling"
      : this.viewMode
  }

  /**
   * Where the card view can show at all: it is built around thumb-flicking a
   * phone, and it deals out verses — which the About page and an introduction
   * (prose, not verses) do not have.
   */
  get cardsViewAvailable(): boolean {
    return (
      this.isMobile &&
      !!this.book &&
      this.book.id !== "about" &&
      !this.isIntroChapter
    )
  }

  /**
   * The preference survives where the view cannot show (a desktop, an
   * introduction) and simply takes effect again where it can.
   */
  get showCards(): boolean {
    return this.cardsView && this.cardsViewAvailable
  }

  /** Whether this book has an introduction to read, loaded or not yet fetched. */
  get hasIntro(): boolean {
    return (
      !!this.book?.introduction?.length || !!BookService.introSlugFor(this.book)
    )
  }

  get isIntroChapter(): boolean {
    return this.chapterNumber === 0 && this.hasIntro
  }

  // Memoized: a fresh array per change detection makes Angular recreate the
  // intro row mid-click, swallowing taps on it.
  private chaptersWithIntroCache: {
    book?: Book
    chapters?: Chapter[]
    introduction?: IntroElement[]
    list: Chapter[]
  } = { list: [] }

  get chaptersWithIntro(): Chapter[] {
    const cache = this.chaptersWithIntroCache
    // A Book filled in place keeps its identity, so compare its fields too.
    if (
      cache.book !== this.book ||
      cache.chapters !== this.book?.chapters ||
      cache.introduction !== this.book?.introduction
    ) {
      const chapters = this.book?.chapters || []
      this.chaptersWithIntroCache = {
        book: this.book,
        chapters: this.book?.chapters,
        introduction: this.book?.introduction,
        list: this.hasIntro
          ? [
              { bookId: this.book.id, number: 0, title: "Introdução" },
              ...chapters,
            ]
          : chapters,
      }
    }
    return this.chaptersWithIntroCache.list
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
    private apiService: BibleApiService,
    private bookService: BookService,
    private preferencesService: PreferencesService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute,
    private animationService: BibleReaderAnimationService,
    private analyticsService: AnalyticsService,
    private networkService: NetworkService,
    private snackBar: MatSnackBar,
    private seoService: SeoService,
    private pwaInstallService: PwaInstallService,
  ) {}

  ngOnInit(): void {
    const storedSpeed = this.preferencesService.getAutoScrollSpeed()
    if (storedSpeed) {
      this.autoScrollService.setAutoScrollLinesPerSecond(storedSpeed)
    }

    this.viewMode = this.preferencesService.getViewMode()
    this.cardsView = this.preferencesService.getCardsView()
    this.isMobile = isMobileDevice(this.pwaInstallService)

    this.autoScrollControlsPreference =
      this.preferencesService.getAutoScrollControlsVisible()
    this.showAutoScrollControls =
      this.viewMode === "scrolling" && this.autoScrollControlsPreference
    this.bookService.books$
      .pipe(takeUntil(this.destroy$))
      .subscribe((books) => {
        this.books = books
      })

    // First book list only: loading an introduction body pushes a new list
    // mid-navigation, and re-running this would load the chapter twice.
    this.bookService.books$
      .pipe(
        take(1),
        switchMap(() => {
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

            this.chapterNumber =
              this.bookService.parseChapterUrlSegment(storedChapter)

            const parsedVerseStart = queryParams["verseStart"]
              ? Number.parseInt(queryParams["verseStart"], 10)
              : undefined
            const parsedVerseEnd = queryParams["verseEnd"]
              ? Number.parseInt(queryParams["verseEnd"], 10)
              : undefined

            // Browser-only: while prerendering, this navigation would make
            // Angular emit a "Redirecting" stub instead of the page content.
            if (isPlatformBrowser(this.platformId)) {
              this.router.navigate(
                [
                  this.bookService.getUrlAbrv(this.book),
                  this.bookService.getChapterUrlSegment(this.chapterNumber),
                ],
                {
                  queryParams: Object.keys(queryParams).length
                    ? queryParams
                    : {},
                  replaceUrl: true,
                },
              )
            }
            this.getChapter(
              this.chapterNumber,
              parsedVerseStart,
              parsedVerseEnd,
            )
          }

          return combineLatest([this.route.paramMap, this.route.queryParamMap])
        }),
        takeUntil(this.destroy$),
      )
      .subscribe(([params, queryParams]) => {
        const bookParam = params.get("book") || "about"
        const chapterParam = this.bookService.parseChapterUrlSegment(
          params.get("chapter"),
        )
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
            this.scrollToVerse(verseStartParam, verseEndParam, highlight)
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
    this.chapterSubscription?.unsubscribe()
    this.animationService.cancelPendingRealign()
    // AutoScrollService handles its own cleanup now if we stop it, or the component stopping it
  }

  /** The one place chapter URLs are built, for anchors and navigation alike. */
  private chapterCommands(
    chapter: Chapter["number"],
    absolute = false,
  ): (string | number)[] {
    const commands = [
      this.bookService.getUrlAbrv(this.book),
      this.bookService.getChapterUrlSegment(this.clampChapter(chapter)),
    ]
    return absolute ? ["/", ...commands] : commands
  }

  /** Keeps a target chapter inside the book, so no link can point at /-1. */
  private clampChapter(chapter: Chapter["number"]): Chapter["number"] {
    const highest = this.book?.chapterCount ?? this.minChapter
    return Math.min(Math.max(chapter, this.minChapter), highest)
  }

  // Side effects for the prev/next anchors; RouterLink does the navigation.
  // Skips the clicks RouterLink leaves to the browser: this tab never navigates
  // then, so it would never clear the direction flag.
  prepareChapterNavigation(forwards: boolean, event?: MouseEvent): void {
    if (event && !this.isPlainLeftClick(event)) return

    const target = forwards ? this.chapterNumber + 1 : this.chapterNumber - 1
    // The anchors bypass goToNextChapter/goToPreviousChapter's bounds check.
    if (target !== this.clampChapter(target)) return

    this.autoScrollService.stop()
    this.isNavigatingForwards = forwards
    this.isNavigatingBackwards = !forwards
  }

  private isPlainLeftClick(event: MouseEvent): boolean {
    return (
      event.button === 0 &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      !event.metaKey
    )
  }

  /** Fields, not getters: RouterLink diffs its input by reference. */
  private rebuildChapterLinks(): void {
    this.previousChapterLink = this.chapterCommands(
      this.chapterNumber - 1,
      true,
    )
    this.nextChapterLink = this.chapterCommands(this.chapterNumber + 1, true)
  }

  onSwipeLeft(): void {
    if (this.effectiveViewMode === "paged") {
      this.pagedNav?.nextPage()
    } else {
      this.goToNextChapter()
    }
  }

  onSwipeRight(): void {
    if (this.effectiveViewMode === "paged") {
      this.pagedNav?.prevPage()
    } else {
      this.goToPreviousChapter()
    }
  }

  goToNextChapter(): void {
    if (this.book.chapterCount >= this.chapterNumber + 1) {
      this.prepareChapterNavigation(true)
      this.router.navigate(this.chapterCommands(this.chapterNumber + 1, true))
    }
  }

  private get minChapter(): number {
    return this.hasIntro ? 0 : 1
  }

  goToPreviousChapter(): void {
    if (this.chapterNumber > this.minChapter) {
      this.prepareChapterNavigation(false)
      this.router.navigate(this.chapterCommands(this.chapterNumber - 1, true))
    }
  }

  goToChapter(newChapterNumber: Chapter["number"]): void {
    this.autoScrollService.stop()
    this.router.navigate(this.chapterCommands(newChapterNumber))
  }

  onBookSubmit(event: { bookId: string }) {
    const book = this.bookService.findBook(event.bookId)
    // Chapter 1 rather than the introduction, except for a standalone
    // introduction, which has no chapters.
    this.router.navigate([
      "/",
      this.bookService.getUrlAbrv(book),
      this.bookService.getChapterUrlSegment(book.introSlug ? 0 : 1),
    ])

    this.bookDrawer.close()
  }

  onChapterSubmit(event: { chapterNumber: number }) {
    this.goToChapter(event.chapterNumber)

    this.bookDrawer.close()
  }

  getChapter(
    chapter: Chapter["number"],
    verseStart?: Verse["number"],
    verseEnd?: Verse["number"],
    highlight = true,
  ) {
    this.pendingChapter = chapter

    // The About page is local content with no chapter behind it.
    if (this.book.id === "about") {
      this.chapterSubscription?.unsubscribe()
      this.finalizeChapterTransition(() =>
        this.applyChapter(
          { bookId: "about", number: 1 },
          chapter,
          verseStart,
          verseEnd,
          highlight,
        ),
      )
      return
    }

    // Chapter 0 = book introduction – no API call needed, but cancel any
    // in-flight chapter request so it cannot overwrite the intro view.
    if (chapter === 0) {
      this.chapterSubscription?.unsubscribe()

      // A standalone introduction ships without its body: fetch it first.
      if (
        !this.book.introduction?.length &&
        BookService.introSlugFor(this.book)
      ) {
        const requested = this.book
        const isCurrent = () =>
          this.book.id === requested.id && this.pendingChapter === 0
        this.bookService.loadGroupIntroBody(requested).then(
          (book) => {
            if (!isCurrent()) return
            this.book = book
            this.finalizeChapterTransition(() =>
              this.applyChapter(
                { bookId: this.book.id, number: 0, title: "Introdução" },
                0,
              ),
            )
          },
          (error) => {
            if (isCurrent()) this.handleChapterLoadFailure(error)
          },
        )
        return
      }

      // /intro on a book without introduction: normalize to chapter 1.
      if (!this.book.introduction?.length) {
        // Otherwise a later failed load would revert the URL to /intro.
        this.chapterNumber = 1
        // Browser-only, like the normalizing navigate in ngOnInit.
        if (isPlatformBrowser(this.platformId)) {
          void this.router.navigate(this.chapterCommands(1), {
            replaceUrl: true,
          })
        }
        // The route subscriber discards the navigation above as
        // already-current, so load the chapter here.
        this.getChapter(1, verseStart, verseEnd, highlight)
        return
      }

      this.finalizeChapterTransition(() =>
        this.applyChapter(
          { bookId: this.book.id, number: 0, title: "Introdução" },
          0,
        ),
      )
      return
    }

    this.chapterSubscription?.unsubscribe()
    this.chapterSubscription = this.apiService
      .getChapter(this.book.id, chapter)
      .subscribe({
        next: (res) =>
          this.finalizeChapterTransition(() =>
            this.applyChapter(res, chapter, verseStart, verseEnd, highlight),
          ),
        error: (err) =>
          this.finalizeChapterTransition(() =>
            this.handleChapterLoadFailure(err),
          ),
      })
  }

  // Stay on the chapter shown. A leftover slide direction would open the next
  // load at the bottom.
  private handleChapterLoadFailure(error: unknown): void {
    this.isNavigatingBackwards = false
    this.isNavigatingForwards = false
    this.notifyChapterLoadFailed()
    if (isPlatformBrowser(this.platformId)) {
      this.router.navigate(
        [
          "/",
          this.bookService.getUrlAbrv(this.book),
          this.bookService.getChapterUrlSegment(this.chapterNumber),
        ],
        { replaceUrl: true },
      )
    }
    console.error(error)
  }

  /** Tell the reader why a chapter could not be shown, instead of failing silently. */
  private notifyChapterLoadFailed(): void {
    const message = this.networkService.isOffline
      ? "Sem ligação. Este capítulo ainda não está disponível offline."
      : "Não foi possível carregar o capítulo. Tente novamente."
    this.snackBar.open(message, "OK", { duration: 4000 })
  }

  /** Hide the container BEFORE change detection paints the new chapter. */
  private resetContainerForRepaint(): void {
    // Browser-only: what undoes this (triggerSlideAnimation) never runs on the
    // server, so opacity: 0 would be baked into the prerendered HTML.
    if (!isPlatformBrowser(this.platformId)) return
    const el = this.bookContainer?.nativeElement
    if (el) {
      el.style.transition = "none"
      el.style.opacity = "0"
    }
  }

  /**
   * Run the chapter swap behind the slide-out animation when navigating
   * between chapters; otherwise apply it immediately.
   */
  private finalizeChapterTransition(work: () => void): void {
    const container = this.bookContainer?.nativeElement
    if (
      container &&
      (this.isNavigatingBackwards || this.isNavigatingForwards)
    ) {
      this.animationService
        .triggerSlideOutAnimation(container, this.isNavigatingBackwards)
        .then(work)
    } else {
      work()
    }
  }

  private applyChapter(
    chapterData: Chapter,
    chapter: Chapter["number"],
    verseStart?: Verse["number"],
    verseEnd?: Verse["number"],
    highlight = true,
  ): void {
    this.resetContainerForRepaint()

    this.chapter = chapterData
    this.chapterNumber = chapter
    this.rebuildChapterLinks()
    this.animationService.cancelPendingRealign()

    this.seoService.updateForChapter(
      this.book,
      this.chapterNumber,
      this.chapter,
    )

    this.cdr.detectChanges()

    const startAtBottom = this.isNavigatingBackwards
    this.isNavigatingBackwards = false
    this.isNavigatingForwards = false

    if (!verseStart) {
      this.animationService.scrollToTop(
        this.drawerContent?.nativeElement,
        this.bookContainer?.nativeElement,
        this.effectiveViewMode,
        startAtBottom,
        startAtBottom
          ? () => this.pagedNav?.scrollToEnd()
          : () => this.pagedNav?.ensureAlignedScrollWidth(),
      )
    } else {
      this.scrollToVerse(verseStart, verseEnd, highlight)
    }

    this.preferencesService.setLastBookId(this.book.id)
    this.preferencesService.setLastChapterNumber(this.chapterNumber)
  }

  /** Paged mode scrolls in whole pages, so paged navigation does the scroll. */
  private scrollToVerse(
    verseStart: Verse["number"],
    verseEnd?: Verse["number"],
    highlight = true,
  ): void {
    const pagedNav = this.pagedNav
    this.animationService.scrollToVerseElement(
      this.bookBlock?.nativeElement,
      this.bookContainer?.nativeElement,
      verseStart,
      verseEnd,
      highlight,
      false,
      this.effectiveViewMode === "paged" && pagedNav
        ? (element) => pagedNav.scrollToPage(element)
        : this.showCards
          ? scrollCardIntoView
          : undefined,
    )
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
    this.autoScrollControlsPreference = this.showAutoScrollControls
    this.preferencesService.setAutoScrollControlsVisible(
      this.showAutoScrollControls,
    )
  }

  onToggleViewMode(): void {
    this.viewMode = this.viewMode === "scrolling" ? "paged" : "scrolling"
    this.preferencesService.setViewMode(this.viewMode)

    void this.analyticsService.track("view_mode_toggle", {
      mode: this.viewMode,
      book: this.book?.id,
      chapter: this.chapterNumber,
    })

    this.cdr.markForCheck()
    // Reset scroll when switching to paged? Or keep position?
    // Paged View relies on overflow-x scroll or just columns.
    // If we switch to paged, we might start at page 1 (scrollLeft 0).
    if (this.viewMode === "paged") {
      this.autoScrollService.stop()
      this.showAutoScrollControls = false
      // Reset to the first page once the paged layout has been rendered.
      afterNextRender(
        () => {
          const container = this.bookContainer?.nativeElement
          if (container) {
            container.scrollLeft = 0
          }
        },
        { injector: this.injector },
      )
    }
  }

  onToggleCardsView(): void {
    this.cardsView = !this.cardsView
    this.preferencesService.setCardsView(this.cardsView)

    void this.analyticsService.track("biblescroll_toggle", {
      enabled: this.cardsView,
      book: this.book?.id,
      chapter: this.chapterNumber,
    })

    // Auto-scroll would fight the snapping, one verse per swipe.
    this.autoScrollService.stop()
    // detectChanges rather than markForCheck: the scroller below has to be
    // measured against the layout it is switching to.
    this.cdr.detectChanges()
    // Either layout starts from the top: a scroll offset means nothing once
    // the content under it has been replaced.
    this.drawerContent?.nativeElement.scrollTo({ top: 0 })
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

  onIncreaseFontSize(): void {
    this.gestures.increaseFontSize()
  }

  onDecreaseFontSize(): void {
    this.gestures.decreaseFontSize()
  }

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
}
