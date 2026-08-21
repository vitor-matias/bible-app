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
import { NetworkService } from "../../services/network.service"
import { PreferencesService } from "../../services/preferences.service"
import { SeoService } from "../../services/seo.service"
import { AboutComponent } from "../about/about.component"
import { AutoScrollControlsComponent } from "../auto-scroll-controls/auto-scroll-controls.component"
import { BookIntroComponent } from "../book-intro/book-intro.component"
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

  isNavigatingForwards = false
  isNavigatingBackwards = false
  isFirstPage = true
  isLastPage = false

  get effectiveViewMode(): "scrolling" | "paged" {
    return this.book?.id === "about" ? "scrolling" : this.viewMode
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
    this.chapterSubscription?.unsubscribe()
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

  get previousChapterLink(): (string | number)[] {
    return this.chapterCommands(this.chapterNumber - 1, true)
  }

  get nextChapterLink(): (string | number)[] {
    return this.chapterCommands(this.chapterNumber + 1, true)
  }

  /**
   * Side effects for the crawlable prev/next anchors: RouterLink performs the
   * navigation, this just stops auto-scroll and picks the slide direction.
   */
  prepareChapterNavigation(forwards: boolean): void {
    const target = forwards ? this.chapterNumber + 1 : this.chapterNumber - 1
    // The anchors bypass goToNextChapter/goToPreviousChapter, so repeat their
    // bounds check here rather than trusting the template guard alone.
    if (target !== this.clampChapter(target)) return

    this.autoScrollService.stop()
    if (forwards) {
      this.isNavigatingForwards = true
    } else {
      this.isNavigatingBackwards = true
    }
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
      this.autoScrollService.stop()
      this.isNavigatingForwards = true

      this.router.navigate(this.chapterCommands(this.chapterNumber + 1))
    }
  }

  private get minChapter(): number {
    return this.hasIntro ? 0 : 1
  }

  goToPreviousChapter(): void {
    if (this.chapterNumber > this.minChapter) {
      this.autoScrollService.stop()
      this.isNavigatingBackwards = true

      this.router.navigate(this.chapterCommands(this.chapterNumber - 1))
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
            // Ignore a response that arrives after the reader moved on.
            if (this.book.id !== book.id) return
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
