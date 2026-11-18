import { CommonModule, isPlatformBrowser, Location } from "@angular/common"
import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  ElementRef,
  HostListener,
  Injector,
  inject,
  type OnDestroy,
  type OnInit,
  PendingTasks,
  PLATFORM_ID,
  type Type,
  ViewChild,
} from "@angular/core"
import { toObservable } from "@angular/core/rxjs-interop"
import {
  MatBottomSheet,
  MatBottomSheetModule,
} from "@angular/material/bottom-sheet"
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
import { combineLatest, of, Subject, Subscription } from "rxjs"
import { first, switchMap, take, takeUntil } from "rxjs/operators"
import { nextCanonBook, PASTORAL_INDEX_BOOK } from "../../bible-canon"
import { CopyReferenceDirective } from "../../directives/copy-reference.directive"
import {
  PagedNavigationDirective,
  PageState,
} from "../../directives/paged-navigation/paged-navigation.directive"
import {
  type TextSize,
  UnifiedGesturesDirective,
} from "../../directives/unified-gesture.directive"
import {
  indexBookmarkId,
  indexBookmarkLabel,
} from "../../pastoral-index-bookmarks"
import { AnalyticsService } from "../../services/analytics.service"
import { AutoScrollService } from "../../services/auto-scroll.service"
import { BackButtonService } from "../../services/back-button.service"
import { BibleApiService } from "../../services/bible-api.service"
import { BibleReaderAnimationService } from "../../services/bible-reader-animation.service"
import { BookService } from "../../services/book.service"
import { HapticsService } from "../../services/haptics.service"
import { NativeChromeService } from "../../services/native-chrome.service"
import { NativeFootnotesService } from "../../services/native-footnotes.service"
import { NetworkService } from "../../services/network.service"
import { PastoralIndexState } from "../../services/pastoral-index-state.service"
import { PreferencesService } from "../../services/preferences.service"
import { SeoService } from "../../services/seo.service"
import { CHAPTER_STEP, ToastService } from "../../services/toast.service"
import { introductionTitle, passageLabel } from "../../utils/passage-label"
import { AboutComponent } from "../about/about.component"
import { AutoScrollControlsComponent } from "../auto-scroll-controls/auto-scroll-controls.component"
import { BookIntroComponent } from "../book-intro/book-intro.component"
import { BookSelectorComponent } from "../book-selector/book-selector.component"
import { ChapterSelectorComponent } from "../chapter-selector/chapter-selector.component"
import { FootnotesBottomSheetComponent } from "../footnotes-bottom-sheet/footnotes-bottom-sheet.component"
import { HeaderComponent } from "../header/header.component"
import { VerseComponent } from "../verse/verse.component"

/** How long «A tentar…» shows at least: offline, a retry fails at once, unseen. */
export const RETRY_FEEDBACK_MS = 1000

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
    CopyReferenceDirective,
    AutoScrollControlsComponent,
    BookIntroComponent,
    RouterLink,
  ],
})
export class BibleReaderComponent implements OnInit, OnDestroy {
  private autoScrollService = inject(AutoScrollService)
  private apiService = inject(BibleApiService)
  private bookService = inject(BookService)
  private preferencesService = inject(PreferencesService)
  private cdr = inject(ChangeDetectorRef)
  private router = inject(Router)
  private route = inject(ActivatedRoute)
  private animationService = inject(BibleReaderAnimationService)
  private analyticsService = inject(AnalyticsService)
  private networkService = inject(NetworkService)
  private seoService = inject(SeoService)
  private indexState = inject(PastoralIndexState)

  /**
   * The Índice Bíblico-Pastoral's page, on the web, where the reader hosts it
   * as it does the About page: resolved by its route, so it stays in its own
   * chunk and still renders while prerendering.
   */
  readonly indexPage: Type<unknown> | undefined =
    this.route.snapshot.data["indexPage"]

  /** The index as the header names it: the theme open, for its ribbon and share. */
  readonly indexBook = computed<Book>(() => ({
    ...PASTORAL_INDEX_BOOK,
    id: indexBookmarkId(this.indexState.slug()),
  }))

  readonly indexShareText = computed(() => {
    const { id } = this.indexBook()
    return id === PASTORAL_INDEX_BOOK.id
      ? "Ler o Índice Bíblico-Pastoral."
      : `Ler ${indexBookmarkLabel(id)} no Índice Bíblico-Pastoral.`
  })

  /** A page of the app's own (About, the index), not a book's chapter. */
  get isPage(): boolean {
    return this.book?.id === "about" || !!this.indexPage
  }

  private destroy$ = new Subject<void>()
  private chapterSubscription?: Subscription
  private injector = inject(Injector)
  private platformId = inject(PLATFORM_ID)
  private host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement
  private pendingTasks = inject(PendingTasks)
  /** Set while the prerendered chapter on screen waits for its data. */
  private endPrerenderHold?: () => void
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
  private bottomSheet = inject(MatBottomSheet)
  private nativeFootnotes = inject(NativeFootnotesService)
  private location = inject(Location)
  protected readonly backButton = inject(BackButtonService)
  /** The verses a link asked to open the notes of, until the chapter is here. */
  private linkedNotes: string | null = null
  private dismissLinkedNotes?: () => void
  private stopTrackingScroll?: () => void
  private unregisterBackCloser = this.backButton.register(
    () => {
      if (!this.bookDrawer?.opened) return false
      this.bookDrawer.close()
      return true
    },
    () => !!this.bookDrawer?.opened,
  )

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
  /** Whether to say the books are loading while there's nothing to show. */
  showLoading = false
  retryingBooks = false
  /** The first chapter opened could not be loaded: there is none to stay on. */
  chapterUnavailable = false
  retryingChapter = false
  /** Loads that chapter again, as it was asked for. */
  private retryChapterLoad?: () => void
  /** Until when a retry shows as under way, though it already failed. */
  private retryFeedbackUntil = 0
  private retryFeedbackTimer?: ReturnType<typeof setTimeout>
  chapterNumber = 1
  chapter?: Chapter

  bookParam: string | null = null
  chapterParam: string | null = null
  showBooks = true
  showAutoScrollControls = false
  private autoScrollControlsPreference = false
  viewMode: "scrolling" | "paged" = "scrolling"

  isNavigatingForwards = false
  isNavigatingBackwards = false
  previousChapterLink: (string | number)[] = []
  nextChapterLink: (string | number)[] = []
  introLink: (string | number)[] = []
  /** The chapter last asked for, which an async load must still match. */
  private pendingChapter?: Chapter["number"]
  /** Counts chapter requests, so only the latest one's outcome lands. */
  private chapterRequest = 0
  /** The verse a link led to in this chapter: the one being read while it shows. */
  private linkedVerse?: Verse["number"]
  /** What is on screen, for a failed load to go back to. */
  private shown?: { book: Book; chapter: Chapter["number"] }
  isFirstPage = true
  isLastPage = false

  get effectiveViewMode(): "scrolling" | "paged" {
    return this.isPage ? "scrolling" : this.viewMode
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

  ngOnInit(): void {
    // Hydration deletes the server DOM it hasn't claimed once the app is stable,
    // and waiting on IndexedDB doesn't count as work: the text would blank out.
    const prerendered = !!this.host.querySelector(".chapterBlock")
    if (prerendered) {
      this.endPrerenderHold = this.pendingTasks.add()
    }
    // Otherwise the page is blank until the books load, which on a first
    // launch downloads the Bible.
    this.showLoading = isPlatformBrowser(this.platformId) && !prerendered

    const storedSpeed = this.preferencesService.getAutoScrollSpeed()
    if (storedSpeed) {
      this.autoScrollService.setAutoScrollLinesPerSecond(storedSpeed)
    }

    this.viewMode = this.preferencesService.getViewMode()

    this.autoScrollControlsPreference =
      this.preferencesService.getAutoScrollControlsVisible()
    this.showAutoScrollControls =
      this.viewMode === "scrolling" && this.autoScrollControlsPreference
    this.bookService.books$
      .pipe(takeUntil(this.destroy$))
      .subscribe((books) => {
        this.books = books
        this.cdr.markForCheck()
      })

    // Its page needs neither the books nor a route to read: it is all here.
    if (this.indexPage) {
      this.book = PASTORAL_INDEX_BOOK
      this.getChapter(1)
      return
    }

    this.bookService.booksUnavailable$
      .pipe(takeUntil(this.destroy$))
      .subscribe((unavailable) => {
        this.booksUnavailable = unavailable
        if (unavailable) {
          this.releasePrerender()
          // Nothing to read, e.g. a first launch offline: the About page is
          // in the app, and keeps the header and its menu in reach.
          if (!this.book) {
            this.book = this.bookService.getAboutBook()
            this.getChapter(1)
          }
        }
        this.cdr.markForCheck()
      })

    // First book list only: loading an introduction body pushes a new list
    // mid-navigation, and re-running this would load the chapter twice.
    this.bookService.books$
      .pipe(
        take(1),
        // A cold app link waits in chapterExists for this same book list: let
        // it settle (it may replace this reader, or reuse it) before reading
        // the route, or the redirect below replaces the link with the saved
        // passage. Not while prerendering, where nothing would hold the page.
        switchMap(() =>
          isPlatformBrowser(this.platformId) && this.router.currentNavigation()
            ? toObservable(this.router.currentNavigation, {
                injector: this.injector,
              }).pipe(first((navigation) => !navigation))
            : of(null),
        ),
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
            this.chapterNumber =
              this.bookService.parseChapterUrlSegment(storedChapter)
            // The navigate below rewrites "/joao/3" or "/sal/23" to the
            // book's own address.
            this.book = this.bookService.findUrlBook(
              storedBook,
              this.chapterNumber,
            )
            // Nothing of the About page shown while the books couldn't load
            // stays under this book: its text, or arrows leading back to it.
            this.chapter = undefined
            this.rebuildChapterLinks()

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
            this.linkedNotes = queryParams["notes"] ?? null
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

        this.linkedNotes = queryParams.get("notes")

        const tempBook = this.bookService.findUrlBook(bookParam, chapterParam)

        // A step on its way goes with a route to another chapter than its own
        // (Back, a ribbon, a link, a pick), its direction and links with it.
        // Not with the chapter shown while nothing else loads: leaving
        // /gn/3?verseStart=5, the new query comes first, paired with the old
        // chapter. Flags no tap set go with a load not theirs.
        const stepHere = this.slideTo
          ? chapterParam === this.slideTo.chapter &&
            tempBook.id === this.slideTo.bookId
          : this.pendingChapter === this.chapterNumber
        const shownHere =
          chapterParam === this.chapterNumber &&
          tempBook.id === this.book.id &&
          this.pendingChapter === this.chapterNumber
        if (this.changingChapter && !stepHere && !shownHere) {
          this.clearChapterSlide()
        }

        if (
          this.book.id === tempBook.id &&
          this.chapterNumber === chapterParam &&
          this.pendingChapter === chapterParam
        ) {
          if (verseStartParam !== undefined) {
            this.scrollToVerse(verseStartParam, verseEndParam, highlight)
          }
          this.openLinkedNotes()
          return
        }

        this.book = tempBook
        this.getChapter(chapterParam, verseStartParam, verseEndParam, highlight)
        this.bookDrawer?.close()
      })
  }

  ngOnDestroy(): void {
    this.dismissLinkedNotes?.()
    this.releasePrerender()
    this.unregisterBackCloser()
    clearTimeout(this.retryFeedbackTimer)
    this.destroy$.next()
    this.destroy$.complete()
    this.chapterSubscription?.unsubscribe()
    this.animationService.cancelPendingRealign()
    this.stopTrackingScroll?.()
    // AutoScrollService handles its own cleanup now if we stop it, or the component stopping it
  }

  private releasePrerender(): void {
    this.endPrerenderHold?.()
    this.endPrerenderHold = undefined
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
  // `target`: a card's own chapter (the introduction), not the next step's.
  prepareChapterNavigation(
    forwards: boolean,
    event?: MouseEvent,
    target = forwards ? this.stepFrom + 1 : this.stepFrom - 1,
  ): void {
    if (event && !this.isPlainLeftClick(event)) return

    // The anchors bypass goToNextChapter/goToPreviousChapter's bounds check.
    if (target !== this.clampChapter(target)) return

    this.autoScrollService.stop()
    this.isNavigatingForwards = forwards
    this.isNavigatingBackwards = !forwards
    this.slideTo = { bookId: this.book.id, chapter: target }
    // A tap during the slide goes on from there.
    this.rebuildChapterLinks()
  }

  /** Where a step goes on from: the chapter on its way, else the one shown. */
  private get stepFrom(): Chapter["number"] {
    return this.changingChapter && this.slideTo?.bookId === this.book?.id
      ? this.slideTo.chapter
      : this.chapterNumber
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
    this.previousChapterLink = this.chapterCommands(this.stepFrom - 1, true)
    this.nextChapterLink = this.chapterCommands(this.stepFrom + 1, true)
    // The introduction card names the introduction: no step moves it.
    this.introLink = this.chapterCommands(0, true)
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
    if (this.bookDrawer?.opened) return
    this.stepForward()
  }

  onSwipeRight(): void {
    if (this.bookDrawer?.opened) return
    this.stepBackward()
  }

  /** In paged mode the page follows the finger; chapters only turn on release. */
  onSwipeMove(dx: number): void {
    if (this.bookDrawer?.opened) return
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
    if (this.isPage || !this.chapter) return false
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
    return !this.isPage && this.chapterNumber === 1 && this.hasIntro
  }

  /** The introduction card's title: "Introdução ao Livro do Génesis". */
  get introCardTitle(): string {
    return introductionTitle(this.book)
  }

  get canGoNext(): boolean {
    if (this.isPage || !this.chapter) return false
    return (
      this.chapter.number < this.book.chapterCount ||
      (this.effectiveViewMode === "paged" && !this.isLastPage)
    )
  }

  /**
   * A chapter is already on its way (slideTo): chapterNumber changes only
   * once it has loaded, so a second step goes on from slideTo instead.
   */
  private get changingChapter(): boolean {
    return this.isNavigatingForwards || this.isNavigatingBackwards
  }

  /** The chapter the slide under way heads for, and its book. */
  private slideTo?: { bookId: Book["id"]; chapter: Chapter["number"] }
  /**
   * The slide-out under way or done, which a later step's load waits on too;
   * until a chapter is shown, or the load fails.
   */
  private slideOut?: Promise<void>

  goToNextChapter(): void {
    if (this.keyRepeating) return
    const target = this.stepFrom + 1
    if (this.book.chapterCount >= target) {
      this.haptics.light()
      this.prepareChapterNavigation(true)
      this.navigateToAdjacentChapter(target)
    }
  }

  private get minChapter(): number {
    return this.hasIntro ? 0 : 1
  }

  goToPreviousChapter(): void {
    if (this.keyRepeating) return
    const target = this.stepFrom - 1
    if (target >= this.minChapter) {
      this.haptics.light()
      this.prepareChapterNavigation(false)
      this.navigateToAdjacentChapter(target)
    }
  }

  async retryBooks(): Promise<void> {
    this.retryingBooks = true
    this.cdr.markForCheck()
    try {
      await Promise.all([
        this.bookService.retryBooks(),
        new Promise((resolve) => setTimeout(resolve, RETRY_FEEDBACK_MS)),
      ])
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

  /** Marks the anchors' steps as reading on, which keeps "Voltar para …". */
  readonly chapterStep = CHAPTER_STEP

  private navigateToAdjacentChapter(chapter: Chapter["number"]): void {
    const commands = this.chapterCommands(chapter, true)
    const navigated = this.router.navigate(commands, {
      info: CHAPTER_STEP,
      ...(this.replaceChapterHistory && { replaceUrl: true }),
    })
    // No chapter will load to clear the slide: the next step mustn't wait on
    // it. Unless a later step superseded this navigation and owns the slide.
    const slide = this.slideTo
    const clear = () => {
      if (this.slideTo === slide) this.clearChapterSlide()
    }
    void navigated.then((ok) => {
      if (!ok) clear()
    }, clear)
  }

  private clearChapterSlide(): void {
    this.isNavigatingForwards = false
    this.isNavigatingBackwards = false
    this.slideTo = undefined
    // They were built past the chapter that was on its way.
    this.rebuildChapterLinks()
    this.cdr.markForCheck()
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
    if (bookId === PASTORAL_INDEX_BOOK.id) {
      void this.router.navigate(["/indice"])
      // Already there, partway down: the index opens at its top.
      if (this.indexPage && isPlatformBrowser(this.platformId)) {
        window.scrollTo({ top: 0, behavior: "instant" })
      }
      return
    }
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
    clearTimeout(this.retryFeedbackTimer)
    // The failure page's retry is for an older load: it would cancel this one.
    if (this.chapterUnavailable) {
      this.retryingChapter = true
      this.cdr.markForCheck()
    }
    const requested = this.book
    // This request, not just its chapter: a burst can ask for 2, 3 and 2
    // again, and the first 2's failure, waiting on the slide, isn't the last's.
    const request = ++this.chapterRequest
    const isCurrent = () =>
      request === this.chapterRequest &&
      this.book.id === requested.id &&
      this.pendingChapter === chapter
    const retry = () =>
      this.getChapter(chapter, verseStart, verseEnd, highlight)
    // The slide-out outlasts the load: another chapter may be asked for by then.
    const finalize = (work: () => void) =>
      this.finalizeChapterTransition(() => {
        if (isCurrent()) work()
      })

    // The app's own pages are local content with no chapter behind them.
    if (this.isPage) {
      this.chapterSubscription?.unsubscribe()
      finalize(() =>
        this.applyChapter(
          { bookId: this.book.id, number: 1 },
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
        this.bookService.loadGroupIntroBody(requested).then(
          (book) => {
            if (!isCurrent()) return
            this.book = book
            finalize(() =>
              this.applyChapter(
                { bookId: this.book.id, number: 0, title: "Introdução" },
                0,
              ),
            )
          },
          (error) => {
            if (isCurrent())
              this.handleChapterLoadFailure(error, chapter, retry)
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

      finalize(() =>
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
          finalize(() =>
            this.applyChapter(res, chapter, verseStart, verseEnd, highlight),
          ),
        error: (err) =>
          finalize(() => this.handleChapterLoadFailure(err, chapter, retry)),
      })
  }

  // Stay on the chapter shown. A leftover slide direction would open the next
  // load at the bottom.
  private handleChapterLoadFailure(
    error: unknown,
    chapter: Chapter["number"],
    retry: () => void,
  ): void {
    const feedbackLeft = this.retryFeedbackUntil - Date.now()
    if (feedbackLeft > 0) {
      this.retryFeedbackTimer = setTimeout(() => {
        this.retryingChapter = false
        this.cdr.markForCheck()
      }, feedbackLeft)
    } else {
      this.retryingChapter = false
    }
    if (this.shown) {
      // The chapter too: /intro on a book without one already set it to 1.
      this.book = this.shown.book
      this.chapterNumber = this.shown.chapter
    } else {
      // Opened cold, a toast would fade over a blank page: say it in the page.
      // The chapter asked for is the one the header, the URL and a retry show.
      this.chapterNumber = chapter
      // Nor the About page shown while the books couldn't load.
      this.chapter = undefined
      this.chapterUnavailable = true
      this.retryChapterLoad = retry
    }
    this.cdr.markForCheck()
    // Or the URL coming back here would read as a chapter still to load.
    this.pendingChapter = this.chapterNumber
    this.clearChapterSlide()
    // The chapter slid out for this one comes back.
    const container = this.bookContainer?.nativeElement
    if (this.slideOut && container) {
      this.animationService.triggerSlideAnimation(undefined, container, false)
    }
    this.slideOut = undefined
    this.releasePrerender()
    // Opened cold, the address already names the chapter asked for: it keeps
    // its verse and notes, for a retry or a reload to open.
    if (!this.shown) {
      console.error(error)
      return
    }
    // Or the next chapter to load would open notes meant for this one.
    this.linkedNotes = null
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

  retryChapter(): void {
    if (this.retryingChapter) return
    this.retryingChapter = true
    this.retryFeedbackUntil = Date.now() + RETRY_FEEDBACK_MS
    this.cdr.markForCheck()
    this.retryChapterLoad?.()
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
      // A step taken during the slide joins it rather than starting it over.
      if (!this.slideOut) {
        const slideOut = this.animationService.triggerSlideOutAnimation(
          container,
          this.isNavigatingBackwards,
        )
        this.slideOut = slideOut
        // Out, it stays out until a chapter is shown: its class going would
        // show it again while a later step's chapter is still loading, and
        // that one would slide it out a second time.
        void slideOut.then(() => {
          if (this.slideOut === slideOut) this.resetContainerForRepaint()
        })
      }
      this.slideOut.then(work)
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
    // Paged view lays the text out anew and a verse link moves it, so those
    // still reveal it. Otherwise it's in place, and the reader may have scrolled.
    // The index is never slid in: the transform would make its container, not
    // the viewport, the home of its fixed letter bar while it runs.
    const alreadyShown =
      !!this.indexPage ||
      (!!this.endPrerenderHold &&
        !verseStart &&
        this.effectiveViewMode === "scrolling" &&
        !this.isNavigatingForwards &&
        !this.isNavigatingBackwards)

    if (!alreadyShown) this.resetContainerForRepaint()
    this.slideOut = undefined

    this.chapter = chapterData
    this.chapterNumber = chapter
    this.linkedVerse = undefined
    // Not the About page shown for want of the books: the passage asked for
    // (the address) is what a failed first load must keep.
    this.shown = this.booksUnavailable
      ? undefined
      : { book: this.book, chapter }
    this.chapterUnavailable = false
    this.retryingChapter = false
    this.retryChapterLoad = undefined
    // The step has landed: the links go around this chapter, not past it.
    const startAtBottom = this.isNavigatingBackwards
    this.isNavigatingBackwards = false
    this.isNavigatingForwards = false
    this.slideTo = undefined
    this.rebuildChapterLinks()
    this.animationService.cancelPendingRealign()

    // The index's page says what it shows itself: the theme open.
    if (!this.indexPage) {
      this.seoService.updateForChapter(
        this.book,
        this.chapterNumber,
        this.chapter,
      )
    }

    // Its finger's events end with the verse it came down on.
    this.pagedNav?.releaseDrag()
    this.cdr.detectChanges()

    if (verseStart) {
      this.scrollToVerse(verseStart, verseEnd, highlight)
    } else if (!alreadyShown) {
      this.animationService.scrollToTop(
        this.drawerContent?.nativeElement,
        this.bookContainer?.nativeElement,
        this.effectiveViewMode,
        startAtBottom,
        startAtBottom
          ? () => this.pagedNav?.scrollToEnd()
          : () => this.pagedNav?.openAtStart(),
      )
    }

    // Not the About page shown for want of the books: the passage saved is
    // the one to open once they load. Nor the index: it is no passage.
    if (!this.booksUnavailable && !this.indexPage) {
      this.preferencesService.setLastBookId(this.book.id)
      this.preferencesService.setLastChapterNumber(this.chapterNumber)
    }
    this.releasePrerender()
    afterNextRender(() => this.openLinkedNotes(), { injector: this.injector })
  }

  /**
   * A link marked as leading to a verse's notes (`notes=36` or `notes=6-7`, for
   * the first verse with any): opens them, once. The parameter goes from the
   * address, so that a reload or a step forward doesn't open them again.
   */
  private openLinkedNotes(): void {
    const wanted = this.linkedNotes
    if (
      !wanted ||
      !isPlatformBrowser(this.platformId) ||
      this.chapter?.number !== this.chapterNumber ||
      !this.chapter.verses
    ) {
      return
    }
    this.linkedNotes = null
    const url = new URL(this.location.path(), "http://x")
    url.searchParams.delete("notes")
    this.location.replaceState(
      url.pathname + url.search,
      "",
      this.location.getState(),
    )

    const [from, to = from] = wanted.split("-").map(Number)
    const verse = this.chapter.verses.find(
      (candidate) =>
        candidate.number >= from &&
        candidate.number <= to &&
        candidate.text.some((part) => part.type === "footnote"),
    )
    if (!verse) return
    const footnotes = verse.text.filter((part) => part.type === "footnote")
    this.autoScrollService.stop()
    if (this.nativeFootnotes.enabled) {
      this.nativeFootnotes.open(footnotes, verse)
      return
    }
    const sheet = this.bottomSheet.open(FootnotesBottomSheetComponent, {
      data: { footnotes, verse },
      ariaLabel: `Notas de ${this.nativeFootnotes.title(verse)}`,
      ariaModal: true,
      restoreFocus: false,
    })
    this.backButton.closeOnBack(sheet)
    // The toast's way back stays above it (styles.css), and leaves this page.
    this.dismissLinkedNotes = () => sheet.dismiss()
  }

  /** Paged mode scrolls in whole pages, so paged navigation does the scroll. */
  private scrollToVerse(
    verseStart: Verse["number"],
    verseEnd?: Verse["number"],
    highlight = true,
  ): void {
    this.linkedVerse = verseStart
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
    // No books to list yet.
    if (!this.bookDrawer) return
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
    if (!this.bookDrawer) return
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
    const reading = this.verseBeingRead()
    this.viewMode = this.viewMode === "scrolling" ? "paged" : "scrolling"
    this.preferencesService.setViewMode(this.viewMode)

    void this.analyticsService.track("view_mode_toggle", {
      mode: this.viewMode,
      book: this.book?.id,
      chapter: this.chapterNumber,
    })

    this.showAutoScrollControls =
      this.viewMode === "scrolling" && this.autoScrollControlsPreference
    this.cdr.markForCheck()
    if (this.viewMode === "paged") this.autoScrollService.stop()
    // The verse being read stays on screen, once the new layout is in.
    afterNextRender(
      () => {
        if (this.viewMode === "paged") {
          const container = this.bookContainer?.nativeElement
          if (container) container.scrollLeft = 0
          if (reading) this.pagedNav?.scrollToPage(reading, "instant")
        } else {
          const start = reading?.querySelector(".verseNumber") ?? reading
          start?.scrollIntoView({ block: "start" })
        }
      },
      { injector: this.injector },
    )
  }

  /**
   * The verse being read: the one a link led to while its start shows, else
   * the first verse starting in view (on the page, or below the top of the
   * scroller's view), else the one filling it. Not the first with any line
   * showing: the previous verse's last line at the top moved the reader back
   * a page at every switch.
   */
  private verseBeingRead(): HTMLElement | undefined {
    const scroller =
      this.effectiveViewMode === "paged"
        ? this.bookContainer?.nativeElement
        : this.drawerContent?.nativeElement
    const block = this.bookBlock?.nativeElement as HTMLElement | undefined
    if (!scroller || !block) return undefined
    // Not what scrolls under the native bars: its scroll padding.
    const { scrollPaddingTop, scrollPaddingBottom } = getComputedStyle(scroller)
    const box = scroller.getBoundingClientRect()
    const view = {
      top: box.top + (Number.parseFloat(scrollPaddingTop) || 0),
      bottom: box.bottom - (Number.parseFloat(scrollPaddingBottom) || 0),
      left: box.left,
      right: box.right,
    }
    const showing = (line: DOMRect) =>
      line.bottom > view.top &&
      line.top < view.bottom &&
      line.right > view.left &&
      line.left < view.right
    // Its number, which switching back scrolls to the top; else its first line.
    const startShowing = (verse: HTMLElement) => {
      const start = (
        verse.querySelector<HTMLElement>(".verseNumber") ?? verse
      ).getClientRects()[0]
      return (
        !!start &&
        start.top >= view.top - 1 &&
        start.top < view.bottom &&
        start.left >= view.left - 1 &&
        start.left < view.right
      )
    }
    const verses = Array.from(block.querySelectorAll<HTMLElement>("verse"))
    const linked = verses.find((verse) => verse.id === `${this.linkedVerse}`)
    if (linked && startShowing(linked)) return linked
    return (
      verses.find(startShowing) ??
      verses.find((verse) => Array.from(verse.getClientRects()).some(showing))
    )
  }

  @HostListener("window:keydown", ["$event"])
  onArrowPress(event: KeyboardEvent): void {
    if (!this.arrowsTurnPages(event)) return
    // A held key repeats: it may turn pages, not chapters, or it raced
    // through the book. The paged view's turn past the end comes back
    // through goTo*Chapter, within this call.
    this.keyRepeating = event.repeat
    try {
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
    } finally {
      this.keyRepeating = false
    }
  }

  /** While a held arrow key's repeat is handled; see onArrowPress. */
  private keyRepeating = false

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
    this.pagedNav?.relayout()
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
