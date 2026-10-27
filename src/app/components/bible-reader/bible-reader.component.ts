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
import { ActivatedRoute, Router, RouterLink } from "@angular/router"
import { Capacitor } from "@capacitor/core"
import { combineLatest, Subject, Subscription } from "rxjs"
import { switchMap, take, takeUntil } from "rxjs/operators"
import { nextCanonBook } from "../../bible-canon"
import {
  PagedNavigationDirective,
  PageState,
} from "../../directives/paged-navigation/paged-navigation.directive"
import {
  type TextSize,
  UnifiedGesturesDirective,
} from "../../directives/unified-gesture.directive"
import { AnalyticsService } from "../../services/analytics.service"
import { AutoScrollService } from "../../services/auto-scroll.service"
import { BackButtonService } from "../../services/back-button.service"
import { BibleApiService } from "../../services/bible-api.service"
import { BibleReaderAnimationService } from "../../services/bible-reader-animation.service"
import { BookService } from "../../services/book.service"
import { HapticsService } from "../../services/haptics.service"
import { NativeChromeService } from "../../services/native-chrome.service"
import { NetworkService } from "../../services/network.service"
import { PreferencesService } from "../../services/preferences.service"
import { PwaInstallService } from "../../services/pwa-install.service"
import { SeoService } from "../../services/seo.service"
import { ToastService } from "../../services/toast.service"
import { isMobileDevice } from "../../utils/mobile-device"
import { introductionTitle, passageLabel } from "../../utils/passage-label"
import { AboutComponent } from "../about/about.component"
import { AutoScrollControlsComponent } from "../auto-scroll-controls/auto-scroll-controls.component"
import { BookIntroComponent } from "../book-intro/book-intro.component"
import { BookSelectorComponent } from "../book-selector/book-selector.component"
import { ChapterSelectorComponent } from "../chapter-selector/chapter-selector.component"
import { HeaderComponent } from "../header/header.component"
import { VerseComponent } from "../verse/verse.component"
import { endOfBookLabel } from "../verse-cards/verse-cards"
import { VerseCardsComponent } from "../verse-cards/verse-cards.component"

/**
 * In the card view every verse has a resting position of its own: the top of
 * its card. Aiming a deep link there, rather than centring the verse's text,
 * lands the scroller exactly on a snap point instead of between two — where
 * mandatory snapping settles on whichever is nearer, which can be the next
 * verse — and shows a verse taller than the screen from its first line.
 *
 * A jump rather than the smooth scroll the running text gets: gliding there
 * would flick through every full-screen verse on the way.
 */
const scrollCardIntoView = (element: HTMLElement): void => {
  ;(element.closest("article") ?? element).scrollIntoView({ block: "start" })
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
  private haptics = inject(HapticsService)
  private nativeChrome = inject(NativeChromeService)
  /**
   * The Android app's chapter cards, for what its corner arrows don't reach:
   * the introduction, above chapter 1, and the next book, after a book's last
   * chapter. The next chapter is the › arrow's alone.
   */
  readonly chapterCards = this.nativeChrome.android

  /** In scrolling mode, once the chapter is in: pages turn into the next one. */
  get showChapterCards(): boolean {
    return (
      this.chapterCards &&
      !!this.chapter &&
      this.effectiveViewMode === "scrolling"
    )
  }
  private toast = inject(ToastService)
  private stopTrackingScroll?: () => void
  private unregisterBackCloser = inject(BackButtonService).register(() => {
    if (!this.bookDrawer?.opened) return false
    this.bookDrawer.close()
    return true
  })

  @ViewChild("bookDrawer")
  bookDrawer!: MatDrawer

  @ViewChild("container")
  container!: MatDrawerContainer

  private drawerContentRef?: ElementRef<HTMLElement>

  /** The text's scroller, which also hides the iOS bars as it scrolls. */
  @ViewChild(MatDrawerContent, { read: ElementRef })
  set drawerContent(content: ElementRef<HTMLElement> | undefined) {
    if (content?.nativeElement === this.drawerContentRef?.nativeElement) return
    this.drawerContentRef = content
    this.stopTrackingScroll?.()
    this.stopTrackingScroll = content
      ? this.nativeChrome.trackScroll(content.nativeElement)
      : undefined
  }
  get drawerContent(): ElementRef<HTMLElement> {
    return this.drawerContentRef as ElementRef<HTMLElement>
  }

  @ViewChild(UnifiedGesturesDirective) gestures!: UnifiedGesturesDirective
  @ViewChild(PagedNavigationDirective) pagedNav?: PagedNavigationDirective

  @ViewChild("bookDrawerCloseButton") bookDrawerCloseButton!: ElementRef
  @ViewChild("chapterDrawerCloseButton") chapterDrawerCloseButton!: ElementRef
  @ViewChild("bookContainer") bookContainer!: ElementRef

  @ViewChild("bookBlock") bookBlock!: ElementRef

  book!: Book
  books: Book[] = []
  /** The book list could not be loaded and nothing is cached. */
  booksUnavailable = false
  retryingBooks = false
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
   * What lies past the last verse, for the card view's closing stop: scrolling
   * onto it moves on to that chapter. Nothing past the last chapter of a book.
   */
  get nextChapterLabel(): string | undefined {
    return this.book && this.chapterNumber < this.book.chapterCount
      ? `${this.book.shortName} ${this.chapterNumber + 1}`
      : undefined
  }

  /**
   * The same, the other way: scrolling up past the first verse goes back a
   * chapter. It stops at chapter 1 rather than running on into the
   * introduction, which is prose and would drop the reader out of the cards.
   */
  get previousChapterLabel(): string | undefined {
    return this.book && this.chapterNumber > 1
      ? `${this.book.shortName} ${this.chapterNumber - 1}`
      : undefined
  }

  /** Closes the book under the last verse of its last chapter. */
  get endOfBookLabel(): string | undefined {
    return this.book && this.chapterNumber === this.book.chapterCount
      ? endOfBookLabel(this.book)
      : undefined
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
    this.bookService.booksUnavailable$
      .pipe(takeUntil(this.destroy$))
      .subscribe((unavailable) => {
        this.booksUnavailable = unavailable
        this.cdr.markForCheck()
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
    this.unregisterBackCloser()
    this.destroy$.next()
    this.destroy$.complete()
    this.chapterSubscription?.unsubscribe()
    this.animationService.cancelPendingRealign()
    this.stopTrackingScroll?.()
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
    const nextId =
      this.book && this.chapterNumber >= this.book.chapterCount
        ? nextCanonBook(this.book.id)
        : undefined
    this.nextBook = nextId ? this.bookService.findBookById(nextId) : undefined
    this.nextBookLink = this.nextBook
      ? [
          "/",
          this.bookService.getUrlAbrv(this.nextBook),
          this.bookService.getChapterUrlSegment(1),
        ]
      : []
  }

  /**
   * At a book's last chapter, the next book in the edition's order (Malaquias
   * leads to Mateus); none after Apocalipse. Its chapter 1, as a link.
   */
  nextBook?: Book
  nextBookLink: (string | number)[] = []

  /** Following the "Livro seguinte" card: reading hands-free stops there. */
  prepareBookNavigation(event: MouseEvent): void {
    if (!this.isPlainLeftClick(event)) return
    this.autoScrollService.stop()
  }

  onSwipeLeft(): void {
    this.stepForward()
  }

  onSwipeRight(): void {
    this.stepBackward()
  }

  /** In paged mode the page follows the finger; chapters only turn on release. */
  onSwipeMove(dx: number): void {
    if (this.effectiveViewMode === "paged") this.pagedNav?.dragBy(dx)
  }

  onSwipeCancel(): void {
    this.pagedNav?.cancelDrag()
  }

  /** A page forward in paged mode, else the next chapter. */
  stepForward(): void {
    if (this.effectiveViewMode === "paged") {
      this.pagedNav?.nextPage()
    } else {
      this.goToNextChapter()
    }
  }

  stepBackward(): void {
    if (this.effectiveViewMode === "paged") {
      this.pagedNav?.prevPage()
    } else {
      this.goToPreviousChapter()
    }
  }

  /** Whether stepping back goes anywhere: the previous page, else chapter. */
  get canGoPrevious(): boolean {
    if (this.book?.id === "about" || !this.chapter) return false
    return (
      this.chapter.number > this.minChapter ||
      (this.effectiveViewMode === "paged" && !this.isFirstPage)
    )
  }

  /** A chapter card's passage: "Êxodo 1", "Salmo 23 (22)", or the introduction. */
  chapterCardLabel(chapter: number, book: Book = this.book): string {
    return chapter === 0 ? "Introdução" : passageLabel(book, chapter)
  }

  /**
   * Chapter 1 of a book with an introduction: the card above the text leads
   * to it, which only the picker otherwise shows. Elsewhere ‹ is at hand at a
   * chapter's top, where the bars always show.
   */
  get introCard(): boolean {
    return (
      this.book?.id !== "about" && this.chapterNumber === 1 && this.hasIntro
    )
  }

  /** The introduction card's title: "Introdução ao Livro do Génesis". */
  get introCardTitle(): string {
    return introductionTitle(this.book)
  }

  get canGoNext(): boolean {
    if (this.book?.id === "about" || !this.chapter) return false
    return (
      this.chapter.number < this.book.chapterCount ||
      (this.effectiveViewMode === "paged" && !this.isLastPage)
    )
  }

  /**
   * A chapter is already on its way: a second step would ask for the same
   * one again (chapterNumber changes only once it has loaded), doing nothing
   * but buzz.
   */
  private get changingChapter(): boolean {
    return this.isNavigatingForwards || this.isNavigatingBackwards
  }

  goToNextChapter(): void {
    if (this.changingChapter) return
    if (this.book.chapterCount >= this.chapterNumber + 1) {
      this.haptics.light()
      this.prepareChapterNavigation(true)
      this.navigateToAdjacentChapter(this.chapterNumber + 1)
    }
  }

  private get minChapter(): number {
    return this.hasIntro ? 0 : 1
  }

  goToPreviousChapter(): void {
    if (this.changingChapter) return
    if (this.chapterNumber > this.minChapter) {
      this.haptics.light()
      this.prepareChapterNavigation(false)
      this.navigateToAdjacentChapter(this.chapterNumber - 1)
    }
  }

  async retryBooks(): Promise<void> {
    this.retryingBooks = true
    this.cdr.markForCheck()
    try {
      await this.bookService.retryBooks()
    } finally {
      this.retryingBooks = false
      this.cdr.markForCheck()
    }
  }

  /**
   * Whether stepping to the previous or next chapter (swipe, keys, or the
   * prev/next anchors) replaces the history entry. In the native apps it
   * does, so the back button leaves the reader instead of walking back
   * through every chapter read; on the web it adds one, as a page change does.
   */
  get replaceChapterHistory(): boolean {
    return Capacitor.isNativePlatform()
  }

  private navigateToAdjacentChapter(chapter: Chapter["number"]): void {
    const commands = this.chapterCommands(chapter, true)
    const navigated = this.replaceChapterHistory
      ? this.router.navigate(commands, { replaceUrl: true })
      : this.router.navigate(commands)
    // No chapter will load to clear the slide: the next step mustn't wait on it.
    void navigated.then(
      (ok) => {
        if (!ok) this.clearChapterSlide()
      },
      () => this.clearChapterSlide(),
    )
  }

  private clearChapterSlide(): void {
    this.isNavigatingForwards = false
    this.isNavigatingBackwards = false
  }

  goToChapter(newChapterNumber: Chapter["number"]): void {
    this.autoScrollService.stop()
    this.router.navigate(this.chapterCommands(newChapterNumber))
  }

  onBookSubmit(event: { bookId: string }) {
    this.goToPassage(event)
    this.bookDrawer.close()
  }

  /** Without a chapter: chapter 1 rather than the introduction, except for
   *  a standalone introduction, which has no chapters. Stops auto-scroll, as
   *  goToChapter does: the new book opened partway down, still scrolling. */
  goToPassage({ bookId, chapter }: { bookId: string; chapter?: number }): void {
    this.autoScrollService.stop()
    const book = this.bookService.findBook(bookId)
    this.router.navigate([
      "/",
      this.bookService.getUrlAbrv(book),
      this.bookService.getChapterUrlSegment(
        chapter ?? (book.introSlug ? 0 : 1),
      ),
    ])
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
    this.toast.show(message, { action: "OK", duration: 4000 })
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
      // The card view places itself, and keeps the scroller away from the
      // service: its smooth scroll to the very top would run back through
      // every card of the new chapter and come to rest on the leading stop —
      // which asks for the chapter before this one.
      if (this.showCards) this.restOnCard(startAtBottom ? "last" : "first")
      this.animationService.scrollToTop(
        this.showCards ? undefined : this.drawerContent?.nativeElement,
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
    // Either layout starts from its beginning: a scroll offset means nothing
    // once the content under it has been replaced.
    if (this.showCards) {
      this.restOnCard("first")
    } else {
      this.drawerContent?.nativeElement.scrollTo({ top: 0 })
    }
  }

  /**
   * Rests the card view on the chapter's first verse — or its last, when the
   * reader came to it backwards, so that reading on upwards is continuous.
   * Never on scroll offset 0: from chapter 2 on that is the leading stop, and
   * resting there goes back a chapter. Instant and synchronous on purpose: it
   * has to be in place before the stops' observers take their first reading.
   */
  private restOnCard(edge: "first" | "last"): void {
    const cards = this.bookBlock?.nativeElement.querySelectorAll("article")
    const card = edge === "first" ? cards?.[0] : cards?.[cards.length - 1]

    // A touch fling still in flight would carry on to the offset it was
    // heading for in the previous chapter, straight over this placement. A
    // scroller that cannot scroll has its animations cancelled, but only if
    // the compositor gets to see it that way — hence the two frames.
    const scroller = this.drawerContent?.nativeElement
    if (scroller && isPlatformBrowser(this.platformId)) {
      scroller.style.overflowY = "hidden"
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          scroller.style.overflowY = ""
        }),
      )
    }

    card?.scrollIntoView({ block: "start" })
  }

  @HostListener("window:keydown", ["$event"])
  onArrowPress(event: KeyboardEvent): void {
    if (!this.arrowsTurnPages(event)) return
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

  /**
   * The arrows belong to what has focus: a text field's caret, the drawer, an
   * open menu, sheet or dialog, whose chapter would change underneath it. With
   * a modifier they are the browser's or the system's (Alt+← is Back).
   */
  private arrowsTurnPages(event: KeyboardEvent): boolean {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return false
    }
    const target = event.target
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.closest(
          "input, textarea, select, mat-drawer, .cdk-overlay-container",
        ))
    ) {
      return false
    }
    if (this.bookDrawer?.opened) return false
    // A sheet or dialog may leave focus on the page behind it. Only a backdrop
    // still showing: a closed one stays in the page while it fades out, and
    // an arrow pressed then did nothing.
    return !document.querySelector(".cdk-overlay-backdrop-showing")
  }

  onIncreaseFontSize(step?: number): void {
    this.gestures.increaseFontSize(step)
  }

  onDecreaseFontSize(step?: number): void {
    this.gestures.decreaseFontSize(step)
  }

  onResetFontSize(): void {
    this.gestures.resetFontSize()
  }

  /** The text's size, which the header passes to the Android app's text sheet. */
  textSize: TextSize | null = null

  onTextSizeChange(size: TextSize): void {
    this.textSize = size
    this.cdr.markForCheck()
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
