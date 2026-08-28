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
import { switchMap, takeUntil } from "rxjs/operators"
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
import {
  type HighlightColor,
  HighlightService,
} from "../../services/highlight.service"
import { NetworkService } from "../../services/network.service"
import {
  PreferencesService,
  type StudyColumnWidths,
} from "../../services/preferences.service"
import {
  ReadingTrailService,
  type TrailEntry,
} from "../../services/reading-trail.service"
import { SeoService } from "../../services/seo.service"
import { StudyModeService } from "../../services/study-mode.service"
import { AboutComponent } from "../about/about.component"
import { AutoScrollControlsComponent } from "../auto-scroll-controls/auto-scroll-controls.component"
import { BookIntroComponent } from "../book-intro/book-intro.component"
import { BookSelectorComponent } from "../book-selector/book-selector.component"
import { ChapterSelectorComponent } from "../chapter-selector/chapter-selector.component"
import { HeaderComponent } from "../header/header.component"
import { SelectionActionsComponent } from "../selection-actions/selection-actions.component"
import {
  type ParallelRequest,
  StudyPanelComponent,
} from "../study-panel/study-panel.component"
import { StudySidebarComponent } from "../study-sidebar/study-sidebar.component"
import { StudyTrailComponent } from "../study-trail/study-trail.component"
import { VerseComponent } from "../verse/verse.component"

/** Breathing room above the cited verses when a parallel opens on them. */
const PARALLEL_TOP_MARGIN = 12

/**
 * What a reader may drag study mode's columns to.
 *
 * The limits are the same ones the stylesheet clamps to by default: below the
 * minimum a column stops being able to show what it is for, and above the
 * maximum it starts taking the text's room rather than sharing it. The split
 * is the share of the reading column the chapter keeps when a passage is open
 * beside it.
 */
const COLUMN_LIMITS = {
  rail: { min: 160, max: 420 },
  panel: { min: 240, max: 560 },
  split: { min: 25, max: 75 },
} as const

/** How far one arrow-key press moves a divider. */
const RESIZE_STEP = 16

/** Which divider a drag or a key press is moving. */
export type StudyDivider = keyof typeof COLUMN_LIMITS

@Component({
  selector: "bible-reader",
  templateUrl: "./bible-reader.component.html",
  // Two stylesheets because the component draws two layouts: the reading one
  // every screen gets, and study mode's three columns. They share no rules,
  // and kept in one file they were a single sheet the build's per-stylesheet
  // budget could no longer hold.
  styleUrls: ["./bible-reader.component.css", "./bible-reader.study.css"],
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
    StudySidebarComponent,
    StudyPanelComponent,
    StudyTrailComponent,
    SelectionActionsComponent,
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

  /** Study mode's scrolling column, in place of the drawer content. */
  @ViewChild("studyScroll") studyScroll?: ElementRef<HTMLElement>

  /** The column a cross reference is read in, beside the chapter. */
  @ViewChild("parallelScroll") parallelScroll?: ElementRef<HTMLElement>

  /** Carries the widths the reader has dragged the columns to. */
  @ViewChild("textContainer") textContainer?: ElementRef<HTMLElement>

  /** The reading column, which the split divider divides. */
  @ViewChild("studyColumn") studyColumn?: ElementRef<HTMLElement>

  /**
   * The cross reference open beside the chapter, if any. Its chapter arrives
   * after the passage is named, so the column can say it is loading.
   */
  parallel: (ParallelRequest & { chapter?: Chapter; failed?: boolean }) | null =
    null
  private parallelSubscription?: Subscription
  /**
   * Set while the panel is folded to make room for a parallel rather than by
   * the reader. Folded on loan: it is not written to their preferences, and it
   * is given back when the parallel closes.
   */
  private panelFoldedForParallel = false

  /** Where the reader has dragged the dividers, if anywhere. */
  columnWidths: StudyColumnWidths = {}
  /** Set while a divider is under the pointer, to keep the drag cursor. */
  resizing: StudyDivider | null = null
  private dragFrom?: { pointerId: number; x: number; value: number }

  book!: Book
  books: Book[] = []
  chapterNumber = 1
  chapter!: Chapter

  bookParam: string | null = null
  chapterParam: string | null = null
  showBooks = true
  private autoScrollControlsPreference = false

  /**
   * Derived rather than tracked: the controls belong on screen when the
   * reader has asked for them and the text actually scrolls. Keeping it as a
   * field meant setting it wherever either of those could change — and study
   * mode added two more such places, since it scrolls even when the stored
   * view mode says paged, and pages when a side column is folded away.
   */
  get showAutoScrollControls(): boolean {
    return (
      this.autoScrollControlsPreference &&
      this.effectiveViewMode === "scrolling"
    )
  }
  viewMode: "scrolling" | "paged" = "scrolling"

  isNavigatingForwards = false
  isNavigatingBackwards = false
  previousChapterLink: (string | number)[] = []
  nextChapterLink: (string | number)[] = []
  private chapterLinkKey = ""
  /** The chapter last asked for, which an async load must still match. */
  private pendingChapter?: Chapter["number"]
  private initialNavigationDone = false
  isFirstPage = true
  isLastPage = false

  /** The reader asked for study mode and the window is wide enough for it. */
  studyMode = false
  /** The window is wide enough, whether or not the reader wants it. */
  studyModeAvailable = false
  /** The verse the study panel is showing, and which tab asked for it. */
  selection: VerseSelection | null = null
  /** Verses of this chapter whose poetry is quoted from somewhere else. */
  private quotationVerses = new Set<Verse["number"]>()
  /** Where the reader has been this session, most recent last. */
  trail: TrailEntry[] = []
  /** The reader's marks in this chapter, by verse number. */
  private chapterHighlights = new Map<Verse["number"], HighlightColor>()
  private highlightSubscription?: Subscription
  /** The verse at the top of the reading column, as the reader scrolls. */
  visibleVerse?: Verse["number"]
  private visibleVerseFrame?: number
  /** Study mode's side columns, each folded away or not. Remembered. */
  studySidebarCollapsed = false
  studyPanelCollapsed = false

  get effectiveViewMode(): "scrolling" | "paged" {
    // Study mode always scrolls, whatever the reading layout's own preference
    // says. Its apparatus is tied to where the reader is in the text — the
    // panel follows the scroll position, and auto-scroll runs down it — and
    // paging severs both: a paged column does not scroll, so the panel would
    // stop following in the very mode that shows the most text. Folding a
    // side column widens the measure instead.
    if (this.studyModeActive) return "scrolling"
    return this.book?.id === "about" ? "scrolling" : this.viewMode
  }

  /**
   * Whether the three-column layout is actually on screen. The About page is
   * the app's own copy rather than scripture, so it has no verses to select,
   * no references to show, and stays in the plain reader.
   */
  get studyModeActive(): boolean {
    return this.studyMode && this.book?.id !== "about"
  }

  /** The element study mode scrolls, standing in for the drawer content. */
  private get scrollHost(): HTMLElement | undefined {
    return this.studyModeActive
      ? this.studyScroll?.nativeElement
      : this.drawerContent?.nativeElement
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

  // Memoized per book: the template binds to this on every change detection
  // cycle, and a fresh array/intro object each time would make Angular tear
  // down and recreate the intro row mid-click, swallowing taps on it.
  private chaptersWithIntroCache: {
    book?: Book
    chapters?: Chapter[]
    introduction?: IntroElement[]
    list: Chapter[]
  } = { list: [] }

  get chaptersWithIntro(): Chapter[] {
    const cache = this.chaptersWithIntroCache
    // Track the chapters/introduction references too: a Book object whose
    // fields are filled in place keeps the same identity, and comparing only
    // the book would then serve a stale list.
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
    private studyModeService: StudyModeService,
    private readingTrail: ReadingTrailService,
    private highlightService: HighlightService,
  ) {}

  ngOnInit(): void {
    const storedSpeed = this.preferencesService.getAutoScrollSpeed()
    if (storedSpeed) {
      this.autoScrollService.setAutoScrollLinesPerSecond(storedSpeed)
    }

    this.viewMode = this.preferencesService.getViewMode()

    this.readingTrail.entries$
      .pipe(takeUntil(this.destroy$))
      .subscribe((entries) => {
        this.trail = entries
        this.cdr.markForCheck()
      })

    this.studyModeService.available$
      .pipe(takeUntil(this.destroy$))
      .subscribe((available) => {
        this.studyModeAvailable = available
        this.cdr.markForCheck()
      })
    this.studyModeService.active$
      .pipe(takeUntil(this.destroy$))
      .subscribe((active) => {
        this.studyMode = active
        // A selection means nothing outside the panel showing it.
        if (!active) this.selection = null
        this.cdr.markForCheck()
      })

    this.studySidebarCollapsed =
      this.preferencesService.getStudySidebarCollapsed()
    this.studyPanelCollapsed = this.preferencesService.getStudyPanelCollapsed()
    this.columnWidths = this.preferencesService.getStudyColumnWidths()

    this.autoScrollControlsPreference =
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

          // Only on the first emission: loading an introduction body pushes a
          // new book list, and re-running the restore would navigate and load
          // the very chapter already on screen a second time.
          if (!this.initialNavigationDone && storedBook && storedChapter) {
            this.initialNavigationDone = true
            this.book = this.bookService.findBook(storedBook)

            this.chapterNumber =
              this.bookService.parseChapterUrlSegment(storedChapter)

            const parsedVerseStart = queryParams["verseStart"]
              ? Number.parseInt(queryParams["verseStart"], 10)
              : undefined
            const parsedVerseEnd = queryParams["verseEnd"]
              ? Number.parseInt(queryParams["verseEnd"], 10)
              : undefined

            // Only normalize the URL in the browser. During prerendering this
            // navigation (e.g. "/" → "/sobre/1") would make Angular emit a
            // "Redirecting" stub instead of the page's real, indexable content.
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
    if (this.visibleVerseFrame !== undefined) {
      cancelAnimationFrame(this.visibleVerseFrame)
    }
    this.chapterSubscription?.unsubscribe()
    this.parallelSubscription?.unsubscribe()
    this.animationService.cancelPendingRealign()
    // AutoScrollService handles its own cleanup now if we stop it, or the component stopping it
  }

  /**
   * The single place chapter URLs are built, so the crawlable anchors and the
   * swipe/keyboard navigation can never drift apart.
   */
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

  /**
   * Side effects for the crawlable prev/next anchors: RouterLink performs the
   * navigation, this just stops auto-scroll and picks the slide direction.
   *
   * `event` is the anchor's own click. RouterLink declines modified and
   * non-primary clicks so the browser can open them in a new tab or window,
   * and the side effects have to decline the same clicks — otherwise a
   * Cmd-click stops auto-scroll and leaves a direction flag set in a tab that
   * never navigates and so never clears it.
   */
  prepareChapterNavigation(forwards: boolean, event?: MouseEvent): void {
    if (event && !this.isPlainLeftClick(event)) return

    const target = forwards ? this.chapterNumber + 1 : this.chapterNumber - 1
    // The anchors bypass goToNextChapter/goToPreviousChapter, so repeat their
    // bounds check here rather than trusting the template guard alone.
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

  /**
   * Router link arrays for the prev/next anchors, rebuilt only when the book
   * or chapter actually changes. RouterLink diffs its input by reference, so
   * handing it a fresh array on every read would make it recompute both hrefs
   * on every change detection pass — and auto-scroll runs one of those per
   * animation frame.
   */
  private rebuildChapterLinks(): void {
    const urlAbrv = this.bookService.getUrlAbrv(this.book)
    // minChapter is part of the key because an introduction can arrive after
    // the chapter does, and it moves where the previous link may point.
    const key = `${urlAbrv}/${this.chapterNumber}/${this.minChapter}`
    if (key === this.chapterLinkKey) return

    this.chapterLinkKey = key
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
      this.rebuildChapterLinks()
      this.prepareChapterNavigation(true)
      this.router.navigate(this.nextChapterLink)
    }
  }

  private get minChapter(): number {
    return this.hasIntro ? 0 : 1
  }

  goToPreviousChapter(): void {
    if (this.chapterNumber > this.minChapter) {
      this.rebuildChapterLinks()
      this.prepareChapterNavigation(false)
      this.router.navigate(this.previousChapterLink)
    }
  }

  goToChapter(newChapterNumber: Chapter["number"]): void {
    this.autoScrollService.stop()
    this.router.navigate(this.chapterCommands(newChapterNumber))
  }

  onBookSubmit(event: { bookId: string }) {
    const book = this.bookService.findBook(event.bookId)
    // Picking a book opens chapter 1: the introduction is reachable from the
    // chapter list, but readers expect the text itself by default. A
    // standalone introduction has no chapters, so it opens on itself.
    this.router.navigate([
      "/",
      this.bookService.getUrlAbrv(book),
      this.bookService.getChapterUrlSegment(book.introSlug ? 0 : 1),
    ])

    // Study mode has no drawer: the sidebar it navigates from is permanent.
    this.bookDrawer?.close()
  }

  onChapterSubmit(event: { chapterNumber: number }) {
    this.goToChapter(event.chapterNumber)

    this.bookDrawer?.close()
  }

  getChapter(
    chapter: Chapter["number"],
    verseStart?: Verse["number"],
    verseEnd?: Verse["number"],
    highlight = true,
  ) {
    this.pendingChapter = chapter

    // The About page is local content with no chapter behind it: asking the
    // API only earns a 404 that falls through to this very same render.
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

      // A standalone introduction — the whole Bible, a testament, a group, or
      // one shared by a cluster of books — ships without its body: fetch it,
      // then render as usual.
      if (
        !this.book.introduction?.length &&
        BookService.introSlugFor(this.book)
      ) {
        this.bookService
          .loadGroupIntroBody(this.book)
          .then((book) => {
            // Ignore a response that arrives after the reader moved on — to
            // another book, or to a chapter of this one.
            if (this.book.id !== book.id || this.pendingChapter !== 0) return
            this.book = book
            this.finalizeChapterTransition(() =>
              this.applyChapter(
                { bookId: this.book.id, number: 0, title: "Introdução" },
                0,
              ),
            )
          })
          .catch((error) => {
            this.notifyChapterLoadFailed()
            console.error(error)
          })
        return
      }

      // /intro on a book without introduction: normalize to chapter 1
      // instead of requesting the nonexistent chapter 0 from the API.
      if (!this.book.introduction?.length) {
        // Move the state off chapter 0 too: otherwise a later failed load
        // would revert the URL to /intro, which this book does not have.
        this.chapterNumber = 1
        // Browser-only, like the other normalizing navigate: during
        // prerendering this would emit a "Redirecting" stub instead of content.
        if (isPlatformBrowser(this.platformId)) {
          void this.router.navigate(this.chapterCommands(1), {
            replaceUrl: true,
          })
        }
        // Load it here: the navigation above lands on a route event that the
        // subscriber discards as already-current, so nothing else would.
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
          this.finalizeChapterTransition(() => {
            this.isNavigatingBackwards = false
            this.isNavigatingForwards = false
            if (this.book.id === "about") {
              this.applyChapter(
                { bookId: "about", number: 1 },
                chapter,
                verseStart,
                verseEnd,
                highlight,
              )
            } else {
              this.notifyChapterLoadFailed()
              this.router.navigate(
                [
                  "/",
                  this.bookService.getUrlAbrv(this.book),
                  this.bookService.getChapterUrlSegment(this.chapterNumber),
                ],
                { replaceUrl: true },
              )
            }
            console.error(err)
          }),
      })
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
    // Browser-only: the animation service clears this again from
    // triggerSlideAnimation, which is itself browser-only, so hiding the
    // container while server-rendering would bake opacity: 0 into the
    // prerendered HTML with nothing left to undo it.
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
    // Following a parallel into the reading column leaves the same chapter
    // open twice; the copy beside it has nothing left to compare.
    if (
      this.parallel &&
      this.parallel.bookId === chapterData.bookId &&
      this.parallel.chapterNumber === chapter
    ) {
      // Not closeParallel: applyChapter paints once, at the end, with the rest
      // of the new chapter's state in place.
      this.clearParallel()
    }
    this.markQuotationVerses()
    this.watchChapterHighlights()
    // The previous chapter's verse is gone; a deep link naming one picks it up
    // again below, so the panel follows a cross-reference to its landing verse.
    this.selection = null
    this.visibleVerse = undefined
    this.rebuildChapterLinks()
    // The chapter being replaced may still have a realign pass waiting on the
    // layout; it holds the old verse element and must not scroll this one.
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
        this.scrollHost,
        this.bookContainer?.nativeElement,
        this.effectiveViewMode,
        startAtBottom,
        startAtBottom
          ? () => this.pagedNav?.scrollToEnd()
          : () => this.pagedNav?.ensureAlignedScrollWidth(),
      )
    } else {
      this.scrollToVerse(verseStart, verseEnd, highlight)
      this.selectVerseNumber(verseStart)
    }

    this.recordTrail(verseStart)

    this.preferencesService.setLastBookId(this.book.id)
    this.preferencesService.setLastChapterNumber(this.chapterNumber)
  }

  /**
   * Brings a deep-linked verse into view. Paged mode scrolls sideways in whole
   * pages, so it hands the scroll to the paged navigation instead of letting
   * the browser nudge the columns to wherever the verse happens to sit.
   */
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
    this.autoScrollControlsPreference = !this.autoScrollControlsPreference
    this.preferencesService.setAutoScrollControlsVisible(
      this.autoScrollControlsPreference,
    )
    this.cdr.markForCheck()
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

  onToggleStudyMode(): void {
    this.studyModeService.toggle()

    void this.analyticsService.track("study_mode_toggle", {
      enabled: this.studyModeService.isEnabled,
      book: this.book?.id,
      chapter: this.chapterNumber,
    })

    this.cdr.markForCheck()
  }

  onVerseSelected(selection: VerseSelection): void {
    // Clicking the verse already selected clears it — the same gesture that
    // chose it lets go of it, which is what the verse number's aria-pressed
    // has been promising. A click that asks for a particular tab is not a
    // second thought about the verse, so it selects rather than toggles.
    if (
      !selection.panel &&
      this.selection?.verse.number === selection.verse.number
    ) {
      this.clearSelection()
      return
    }

    this.selection = selection
    // Picking a verse is asking what the edition says about it, so a folded
    // panel unfolds rather than swallowing the answer.
    if (this.studyPanelCollapsed) {
      this.setStudyPanelCollapsed(false)
    }
    this.cdr.markForCheck()
  }

  /**
   * Keeps the study panel on the passage the reader is actually looking at.
   *
   * Throttled to one measurement per frame: the scroll fires far more often
   * than the answer changes, and the answer only costs a scan of the verses
   * already on screen. Paged mode never reaches this — that column does not
   * scroll vertically.
   */
  onStudyScroll(): void {
    if (!this.studyModeActive || this.visibleVerseFrame !== undefined) return
    this.visibleVerseFrame = requestAnimationFrame(() => {
      this.visibleVerseFrame = undefined
      this.updateVisibleVerse()
    })
  }

  private updateVisibleVerse(): void {
    const host = this.studyScroll?.nativeElement
    if (!host) return
    const top = host.getBoundingClientRect().top

    let first: Verse["number"] | undefined
    for (const element of host.querySelectorAll<HTMLElement>("verse")) {
      // The first verse whose text has not yet passed above the fold. A
      // little tolerance so a verse only just clipped at the top still
      // counts as the one being read.
      if (element.getBoundingClientRect().bottom >= top + 8) {
        const number = Number(element.id)
        if (Number.isFinite(number)) first = number
        break
      }
    }

    if (first === this.visibleVerse) return
    this.visibleVerse = first
    this.cdr.markForCheck()
  }

  clearSelection(): void {
    if (!this.selection) return
    this.selection = null
    this.cdr.markForCheck()
  }

  toggleStudySidebar(): void {
    this.setStudySidebarCollapsed(!this.studySidebarCollapsed)
  }

  toggleStudyPanel(): void {
    this.setStudyPanelCollapsed(!this.studyPanelCollapsed)
  }

  private setStudySidebarCollapsed(collapsed: boolean): void {
    this.studySidebarCollapsed = collapsed
    this.preferencesService.setStudySidebarCollapsed(collapsed)
    this.cdr.markForCheck()
  }

  private setStudyPanelCollapsed(collapsed: boolean): void {
    // Whatever the parallel borrowed, the reader has now decided for
    // themselves; the fold is theirs from here.
    this.panelFoldedForParallel = false
    this.studyPanelCollapsed = collapsed
    this.preferencesService.setStudyPanelCollapsed(collapsed)
    this.cdr.markForCheck()
  }

  /**
   * Notes where the reader has arrived, so the trail can lead back. The About
   * page is the app's own copy rather than somewhere in the text, so it is
   * not a place the trail leads back to.
   */
  private recordTrail(verseStart?: Verse["number"]): void {
    if (!this.book || this.book.id === "about") return

    const urlAbrv = this.bookService.getUrlAbrv(this.book)
    const segment = this.bookService.getChapterUrlSegment(this.chapterNumber)
    this.readingTrail.visit({
      key: `${this.book.id}:${this.chapterNumber}`,
      label:
        this.chapterNumber === 0
          ? `${this.book.shortName} · Intro`
          : `${this.book.shortName} ${this.chapterNumber}`,
      link: ["/", urlAbrv, segment],
      queryParams: verseStart ? { verseStart } : null,
    })
  }

  /**
   * Starts the trail again from the chapter on screen, rather than emptying
   * it: where the reader is standing is the one place the way back must
   * still lead.
   */
  resetTrail(): void {
    this.readingTrail.clear()
    this.recordTrail()
    this.cdr.markForCheck()
  }

  /** Points the study panel at a verse the reader arrived on via a link. */
  private selectVerseNumber(verseNumber: Verse["number"]): void {
    if (!this.studyModeActive) return
    const verse = this.chapter?.verses?.find(
      (candidate) => candidate.number === verseNumber,
    )
    this.selection = verse ? { verse } : null
    // applyChapter has already run its detectChanges() by the time this is
    // reached, so without marking the view the panel keeps the old verse.
    this.cdr.markForCheck()
  }

  @HostListener("window:keydown", ["$event"])
  onArrowPress(event: KeyboardEvent): void {
    // Study mode puts a note box on the page, and the book filter has always
    // had a text field: an arrow key inside either is the reader moving the
    // caret, not asking for the next chapter.
    if (BibleReaderComponent.isTextEntry(event.target)) return
    // Escape lets go of the selected verse, the way it dismisses anything
    // else the reader has opened.
    if (event.key === "Escape" && this.selection) {
      this.clearSelection()
      return
    }
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

  private static isTextEntry(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null
    if (!element?.tagName) return false
    const tag = element.tagName.toLowerCase()
    return tag === "input" || tag === "textarea" || element.isContentEditable
  }

  /**
   * Which verses of this chapter carry a passage being quoted, as opposed to
   * the verse form a poetic book is written in. Both are the same `quote`
   * elements in the data, so the difference is read from the chapter:
   *
   * - A verse whose prose leads into poetry opens a quotation — whether the
   *   poetry starts in that verse ("Jesus disse-lhe:" then the Shema) or in
   *   the next one ("…dizendo:" at the end of a verse).
   * - A verse that opens straight on poetry continues whatever the verse
   *   before it was doing. That is what keeps a quotation spanning several
   *   verses in one style, instead of italicising only its first verse, and
   *   what leaves the psalms — poetry from their first verse — upright.
   */
  private markQuotationVerses(): void {
    const verses = this.chapter?.verses ?? []
    const marked = new Set<Verse["number"]>()
    let inQuotation = false

    verses.forEach((verse, index) => {
      // A verse arriving without its text — a partial response, a cached
      // stub — simply has no poetry to classify.
      const parts = verse.text ?? []
      // Section headings are skipped along with the apparatus: a heading is
      // not narrative introducing a quotation. Counting it as prose made the
      // chapter's front matter — which is nothing but a heading — look like
      // the opening of a quotation, and every psalm inherited it.
      const first = parts.find(
        (part) =>
          part.type !== "footnote" &&
          part.type !== "references" &&
          part.type !== "section" &&
          !VerseComponent.isBlank(part),
      )
      const hasQuote = parts.some((part) => part.type === "quote")

      if (first && first.type !== "quote") {
        // Prose leads this verse: it introduces a quotation, or it ends one.
        inQuotation = hasQuote || this.checkIfNextVerseStartsWithQuote(index)
      }
      if (inQuotation && hasQuote) marked.add(verse.number)
    })

    this.quotationVerses = marked
  }

  highlightFor(verse: Verse): HighlightColor | undefined {
    return this.chapterHighlights.get(verse.number)
  }

  /**
   * Whether the verse before this one carries the same mark, which is what
   * tells a verse to paint the number and the space in front of it.
   *
   * A mark stops at the words at either end of a run — no tinted number
   * hanging off the front, no colour trailing past the last full stop — but
   * inside a run those same gaps have to be filled, or a passage marked
   * across several verses reads as several marks with holes between them.
   */
  marksContinue(verse: Verse, index: number): boolean {
    const color = this.chapterHighlights.get(verse.number)
    if (!color) return false
    const previous = this.chapter?.verses?.[index - 1]
    return !!previous && this.chapterHighlights.get(previous.number) === color
  }

  /**
   * Follows the marks for the chapter on screen. Re-subscribed per chapter
   * rather than filtering the whole set on every change detection pass, which
   * auto-scroll runs once an animation frame.
   */
  private watchChapterHighlights(): void {
    this.highlightSubscription?.unsubscribe()
    if (!this.book) return
    this.highlightSubscription = this.highlightService
      .forChapter(this.book.id, this.chapterNumber)
      .pipe(takeUntil(this.destroy$))
      .subscribe((marks) => {
        this.chapterHighlights = marks
        this.cdr.markForCheck()
      })
  }

  isQuotationVerse(verse: Verse): boolean {
    return this.quotationVerses.has(verse.number)
  }

  checkIfNextVerseStartsWithQuote(index: number): boolean {
    return BibleReaderComponent.startsWithQuote(this.chapter?.verses, index + 1)
  }

  /** The same question, asked of the passage open beside the chapter. */
  parallelNextStartsWithQuote(index: number): boolean {
    return BibleReaderComponent.startsWithQuote(
      this.parallel?.chapter?.verses,
      index + 1,
    )
  }

  private static startsWithQuote(
    verses: Verse[] | undefined,
    index: number,
  ): boolean {
    const verse = verses?.[index]
    if (!verse?.text || verse.text.length === 0) return false

    const firstDisplayableIdx = verse.text.findIndex(
      (t) => t.type !== "footnote" && t.type !== "references",
    )

    if (firstDisplayableIdx === -1) return false

    return verse.text[firstDisplayableIdx].type === "quote"
  }

  /**
   * Opens a cross reference beside the chapter instead of in place of it.
   *
   * The whole chapter is fetched, not the verses named: a parallel read
   * without its context is the same three verses the panel already quotes.
   */
  onOpenBeside(request: ParallelRequest): void {
    this.parallelSubscription?.unsubscribe()
    this.parallel = request
    // The panel is the column whose work the parallel has just taken over, and
    // two texts read side by side need the width more than a list of
    // references does. It folds to its strip and comes back on closing.
    if (!this.studyPanelCollapsed) {
      this.studyPanelCollapsed = true
      this.panelFoldedForParallel = true
    }
    // detectChanges, not markForCheck: the panel's own controls are plain
    // buttons, and with change detection coalesced onto an animation frame a
    // marked view can sit unrendered until something unrelated triggers a
    // pass. Same reason the panel's tab strip renders itself.
    this.cdr.detectChanges()

    this.parallelSubscription = this.apiService
      .getChapter(request.bookId, request.chapterNumber)
      .subscribe({
        next: (chapter) => this.settleParallel(request, { chapter }),
        error: () => this.settleParallel(request, { failed: true }),
      })
  }

  /** Applies a fetch's outcome, unless the reader has moved on since. */
  private settleParallel(
    request: ParallelRequest,
    outcome: { chapter?: Chapter; failed?: boolean },
  ): void {
    if (this.parallel?.key !== request.key) return
    this.parallel = { ...this.parallel, ...outcome }
    this.cdr.detectChanges()
    if (outcome.chapter) this.scrollParallelToCitation()
  }

  closeParallel(): void {
    this.clearParallel()
    this.cdr.detectChanges()
  }

  /** Drops the parallel without rendering: for callers that paint anyway. */
  private clearParallel(): void {
    this.parallelSubscription?.unsubscribe()
    this.parallel = null
    if (this.panelFoldedForParallel) {
      this.studyPanelCollapsed = false
      this.panelFoldedForParallel = false
    }
  }

  /**
   * The widths the reader has set, as custom properties on the layout. The
   * stylesheet's clamped defaults apply to whatever is not here, so a divider
   * never touched keeps behaving as the layout wants it to.
   */
  get columnStyle(): Record<string, string> {
    const style: Record<string, string> = {}
    const { rail, panel, split } = this.columnWidths
    // A folded column has no width of the reader's to honour: it is a strip
    // with an unfold button on it. Left here, the width dragged earlier is an
    // inline style, and it would beat the stylesheet and hold the space open.
    if (rail !== undefined && !this.studySidebarCollapsed) {
      style["--study-rail-width"] = `${rail}px`
    }
    if (panel !== undefined && !this.studyPanelCollapsed) {
      style["--study-panel-width"] = `${panel}px`
    }
    if (split !== undefined) style["--study-split"] = `${split}%`
    return style
  }

  /** Where a divider currently stands, whether the reader put it there or not. */
  private dividerValue(divider: StudyDivider): number {
    const stored = this.columnWidths[divider]
    if (stored !== undefined) return stored
    const measure = (element: Element | undefined | null): number =>
      element ? element.getBoundingClientRect().width : 0
    const host = this.textContainer?.nativeElement
    if (divider === "rail") return measure(host?.querySelector(".study-rail"))
    if (divider === "panel") return measure(host?.querySelector(".study-aside"))
    const column = measure(this.studyColumn?.nativeElement)
    const pane = measure(this.studyColumn?.nativeElement.firstElementChild)
    return column > 0 ? (pane / column) * 100 : 50
  }

  /**
   * Follows the pointer while a divider is dragged.
   *
   * The property is written straight to the element rather than through a
   * binding: a drag emits a move event per frame, and running change detection
   * over the whole reader on each one is what makes a resize feel heavy. The
   * value is committed to the component and to the reader's preferences when
   * the pointer is let go.
   */
  startResize(divider: StudyDivider, event: PointerEvent): void {
    event.preventDefault()
    this.resizing = divider
    this.dragFrom = {
      pointerId: event.pointerId,
      x: event.clientX,
      value: this.dividerValue(divider),
    }
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
    this.cdr.detectChanges()
  }

  onResizeMove(event: PointerEvent): void {
    const from = this.dragFrom
    if (!from || from.pointerId !== event.pointerId || !this.resizing) return
    this.paint(
      this.resizing,
      this.nextValue(this.resizing, event.clientX - from.x, from.value),
    )
  }

  onResizeEnd(event: PointerEvent): void {
    const from = this.dragFrom
    if (!from || !this.resizing) return
    const divider = this.resizing
    this.commit(
      divider,
      this.nextValue(divider, event.clientX - from.x, from.value),
    )
    this.dragFrom = undefined
    this.resizing = null
    this.cdr.detectChanges()
  }

  /**
   * The keyboard half of a divider: it is a separator the reader can focus,
   * and arrows move it. Home puts it back where the layout wanted it.
   */
  onResizeKey(divider: StudyDivider, event: KeyboardEvent): void {
    if (event.key === "Home") {
      this.resetDivider(divider)
      event.preventDefault()
      return
    }
    const step =
      event.key === "ArrowLeft"
        ? -RESIZE_STEP
        : event.key === "ArrowRight"
          ? RESIZE_STEP
          : 0
    if (!step) return
    event.preventDefault()
    // A pixel step on the split is a percentage of the column it divides.
    const column = this.studyColumn?.nativeElement.getBoundingClientRect().width
    const delta = divider === "split" && column ? (step / column) * 100 : step
    this.commit(divider, this.dividerValue(divider) + delta)
  }

  /** Hands a divider back to the layout's own clamped width. */
  resetDivider(divider: StudyDivider): void {
    const { [divider]: _dropped, ...rest } = this.columnWidths
    this.columnWidths = rest
    this.textContainer?.nativeElement.style.removeProperty(
      divider === "split" ? "--study-split" : `--study-${divider}-width`,
    )
    this.studyColumn?.nativeElement.style.removeProperty("--study-split")
    this.preferencesService.setStudyColumnWidths(this.columnWidths)
    this.cdr.detectChanges()
  }

  /** Where a drag has moved a divider to. */
  private nextValue(
    divider: StudyDivider,
    deltaX: number,
    from: number,
  ): number {
    // The panel grows as the pointer moves left, the others as it moves right.
    const towards = divider === "panel" ? -deltaX : deltaX
    const column = this.studyColumn?.nativeElement.getBoundingClientRect().width
    const delta =
      divider === "split" && column ? (towards / column) * 100 : towards
    return from + delta
  }

  /** What the column can usefully be, whichever way it was asked to move. */
  private clamp(divider: StudyDivider, value: number): number {
    const limits = COLUMN_LIMITS[divider]
    return Math.min(limits.max, Math.max(limits.min, value))
  }

  private paint(divider: StudyDivider, raw: number): void {
    const value = this.clamp(divider, raw)
    if (divider === "split") {
      this.studyColumn?.nativeElement.style.setProperty(
        "--study-split",
        `${value}%`,
      )
      return
    }
    this.textContainer?.nativeElement.style.setProperty(
      `--study-${divider}-width`,
      `${value}px`,
    )
  }

  private commit(divider: StudyDivider, value: number): void {
    // Clamped here rather than at each caller: the pointer and the arrow keys
    // both end up in this one place, and a column may only be so wide.
    const rounded = Math.round(this.clamp(divider, value) * 10) / 10
    this.columnWidths = { ...this.columnWidths, [divider]: rounded }
    this.paint(divider, rounded)
    this.preferencesService.setStudyColumnWidths(this.columnWidths)
    this.cdr.detectChanges()
  }

  /** True while this verse is one of those the reference actually names. */
  isCitedVerse(verse: Verse): boolean {
    const start = this.parallel?.verseStart
    if (start === undefined) return false
    // A reference that runs out of its chapter cites the rest of it.
    if (this.parallel?.runsOn) return verse.number >= start
    const end = this.parallel?.verseEnd ?? start
    return verse.number >= start && verse.number <= end
  }

  /**
   * Opens the parallel at the verses cited rather than at the top of the
   * chapter: the reference names a passage, and the chapter around it is
   * context for it.
   */
  private scrollParallelToCitation(): void {
    const start = this.parallel?.verseStart
    if (start === undefined) return
    afterNextRender(
      () => {
        const pane = this.parallelScroll?.nativeElement
        const target = pane?.querySelector<HTMLElement>(
          `[id="parallel-${start}"]`,
        )
        if (!pane || !target) return
        pane.scrollTop = Math.max(0, target.offsetTop - PARALLEL_TOP_MARGIN)
      },
      { injector: this.injector },
    )
  }
}
