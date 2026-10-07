import { Location } from "@angular/common"
import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  type ElementRef,
  Injector,
  inject,
  ViewChild,
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { MatIconModule } from "@angular/material/icon"
import { MatSnackBarModule } from "@angular/material/snack-bar"
import { ActivatedRoute, Router, RouterModule } from "@angular/router"
import {
  debounceTime,
  filter,
  firstValueFrom,
  map,
  Subject,
  type Subscription,
} from "rxjs"
import { UnifiedGesturesDirective } from "../../directives/unified-gesture.directive"
import { AnalyticsService } from "../../services/analytics.service"
import { BibleApiService } from "../../services/bible-api.service"
import { BibleReferenceService } from "../../services/bible-reference.service"
import { BookService } from "../../services/book.service"
import { NativeChromeService } from "../../services/native-chrome.service"
import { SeoService } from "../../services/seo.service"
import { ThemeService } from "../../services/theme.service"
import { ToastService } from "../../services/toast.service"
import { SearchBarComponent } from "../search-bar/search-bar.component"

/** Searching as people type waits for them to pause this long. */
export const TYPING_PAUSE_MS = 2500

@Component({
  selector: "app-search",
  templateUrl: "./search.component.html",
  styleUrl: "./search.component.css",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SearchBarComponent,
    RouterModule,
    UnifiedGesturesDirective,
    MatSnackBarModule,
    MatIconModule,
  ],
})
export class SearchComponent {
  searchResults: Verse[] = []

  searchTerm = ""
  hasSearched = false

  currentPage = 1

  totalResults = 0
  isLoading = false
  private observer: IntersectionObserver | null = null

  @ViewChild("sentinel", { static: false }) sentinel!: ElementRef
  private lastSentinel: Element | null = null
  private queryParamSubscription?: Subscription
  /** Guards against re-running the same shared query on unrelated emissions. */
  private lastSharedQuery: string | null = null
  /** Bumped on every submit so a slower, superseded request can be ignored. */
  private searchGeneration = 0

  private readonly nativeChrome = inject(NativeChromeService)
  private readonly toast = inject(ToastService)
  private readonly themeService = inject(ThemeService)
  private readonly location = inject(Location)
  private readonly destroyRef = inject(DestroyRef)
  /** The iOS app draws the search field and Back natively, not search-bar. */
  readonly native = this.nativeChrome.enabled
  private readonly typed = new Subject<string>()

  constructor(
    private apiService: BibleApiService,
    private referenceService: BibleReferenceService,
    private bookService: BookService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private analyticsService: AnalyticsService,
    private injector: Injector,
    private seoService: SeoService,
  ) {}

  ngOnInit(): void {
    this.seoService.updateForSearch()

    this.typed
      .pipe(
        debounceTime(TYPING_PAUSE_MS),
        map((text) => text.trim()),
        filter(
          (text) =>
            text.length >= 2 &&
            text !== this.searchTerm.trim() &&
            !this.namesPassage(text),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((text) => void this.onSearchSubmit(text))

    if (this.native) {
      this.nativeChrome.actions$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((action) => {
          if (action.id === "search-input") this.onTyping(action.text)
          if (action.id === "search-submit")
            void this.onSearchSubmit(action.text)
          if (action.id === "back") this.location.back()
        })
      this.syncNativeChrome()
    }

    // Share-target launches arrive as /search?q=. Subscribe, not snapshot:
    // Angular reuses this component between /search URLs.
    this.queryParamSubscription = this.route.queryParamMap.subscribe(
      (params) => {
        const sharedQuery = params.get("q")
        // Forget the last one once `q` goes away, so sharing it again re-runs.
        if (!sharedQuery) this.lastSharedQuery = null
        if (!sharedQuery || sharedQuery === this.lastSharedQuery) return
        this.lastSharedQuery = sharedQuery
        void this.onSearchSubmit(sharedQuery)
      },
    )
  }

  ngAfterViewInit(): void {
    this.attachObserverToSentinel()
  }

  ngAfterViewChecked(): void {
    // If the sentinel element has changed (e.g., after new search), re-attach observer
    if (this.sentinel && this.sentinel.nativeElement !== this.lastSentinel) {
      this.attachObserverToSentinel()
    }
  }

  ngOnDestroy(): void {
    if (this.native) this.nativeChrome.hide()
    this.queryParamSubscription?.unsubscribe()
    if (this.observer) {
      this.observer.disconnect()
    }
  }

  /** Searches once typing pauses (TYPING_PAUSE_MS); Return still searches at once. */
  onTyping(text: string): void {
    this.typed.next(text)
  }

  /**
   * A reference or a book name, which a search opens in the reader. Only on
   * Return: a pause mid-reference ("Jo 3" on the way to "Jo 3,16") must not
   * navigate away.
   */
  private namesPassage(text: string): boolean {
    if (this.referenceService.extract(text).length > 0) return true
    const book = this.bookService.findBook(text)
    return !!book && book.id !== "about"
  }

  /** Shows the native search field, holding the current query. */
  private syncNativeChrome(): void {
    if (!this.native) return
    this.nativeChrome.show({
      mode: "search",
      themeMode: this.themeService.currentMode,
      query: this.searchTerm,
    })
  }

  private attachObserverToSentinel() {
    if (this.observer) {
      this.observer.disconnect()
    }
    if (this.sentinel) {
      this.observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && !this.isLoading) {
            this.loadMoreResults()
          }
        },
        { threshold: 1.0 },
      )
      this.observer.observe(this.sentinel.nativeElement)
      this.lastSentinel = this.sentinel.nativeElement
    }
  }

  private async loadMoreResults() {
    if (this.isLoading || this.searchResults.length >= this.totalResults) return

    const generation = this.searchGeneration
    const isStale = () => generation !== this.searchGeneration

    this.isLoading = true
    try {
      const results = await firstValueFrom(
        this.apiService.search(this.searchTerm, this.currentPage + 1),
      )
      if (isStale()) return
      this.searchResults.push(
        ...results.verses.map((v) => this.toDisplayVerse(v)),
      )
      this.totalResults = results.total
      this.currentPage++
      this.attachObserverToSentinel() // Re-attach observer after loading more results
    } catch (error) {
      if (isStale()) return
      console.error("Error loading more results:", error)
    } finally {
      // A stale `return` in the try still lands here; don't clear the newer
      // search's loading state.
      if (!isStale()) {
        this.isLoading = false
        this.cdr.detectChanges()
      }
    }
  }

  async onSearchSubmit(text: string): Promise<void> {
    const generation = ++this.searchGeneration
    const isStale = () => generation !== this.searchGeneration
    const references = this.referenceService.extract(text)

    let targetBook: Book | null = null
    let targetChapter = 1
    let targetVerseStart: number | undefined

    if (references.length > 0) {
      // A well-formed Bible reference should jump straight into the reader instead
      // of going through the broader full-text search results flow.
      const ref = references[0]
      targetBook = ref.book ? this.bookService.findBook(ref.book) : null
      if (targetBook) {
        targetChapter = ref.chapter || 1
        if (ref.verses && ref.verses.length > 0) {
          targetVerseStart =
            ref.verses[0].type === "single"
              ? ref.verses[0].verse
              : ref.verses[0].start
        }
      }
    } else {
      // Check if the search text exactly matches a book name or abbreviation
      const book = this.bookService.findBook(text.trim())
      if (book && book.id !== "about") {
        targetBook = book
      }
    }

    if (targetBook) {
      // A standalone introduction has no chapters: nothing to probe, and its
      // only page is /intro.
      const isIntro = !!targetBook.introSlug
      try {
        if (!isIntro) {
          await firstValueFrom(
            this.apiService.getVerse(
              targetBook.id,
              targetChapter,
              targetVerseStart || 1,
            ),
          )
        }
        if (isStale()) return
        const navigated = await this.router.navigate(
          [
            "/",
            targetBook.id,
            isIntro ? BookService.INTRO_URL_SEGMENT : targetChapter,
          ],
          targetVerseStart !== undefined
            ? { queryParams: { verseStart: targetVerseStart } }
            : {},
        )
        if (navigated || isStale()) return
      } catch (err) {
        if (isStale()) return
        console.error(err)
        // HttpErrorResponse is not guaranteed here, so narrow the shape safely.
        const status =
          typeof err === "object" &&
          err !== null &&
          "status" in err &&
          typeof err.status === "number"
            ? err.status
            : undefined
        if (status === 404 || status === 400) {
          this.toast.show("Capitulo ou versiculo não existe")
        } else {
          this.toast.show("Error loading verse", { action: "OK" })
        }
      }
      // Still here: the superseded text search's stale `finally` skips this.
      this.isLoading = false
      this.cdr.detectChanges()
      return
    }

    // Set only for text searches: a failed reference lookup leaves the
    // previous results on screen, and paging and highlighting read this.
    this.searchTerm = text
    this.syncNativeChrome()
    this.hasSearched = true
    this.isLoading = true
    try {
      const results = await firstValueFrom(this.apiService.search(text, 1))
      if (isStale()) return
      this.searchResults = results.verses.map((v) => this.toDisplayVerse(v))
      this.totalResults = results.total
      this.currentPage = 1
      const resultsMessage =
        results.total === 1
          ? "Encontrado 1 resultado"
          : `Encontrados ${results.total} resultados`

      if (results.total === 0) {
        this.toast.show("Nenhum resultado encontrado", { afterKeyboard: true })
      } else {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
        // A search that ran on a pause leaves the keyboard up in the iOS
        // app: the toast waits for it to close rather than cover the typing.
        this.toast.show(resultsMessage, { afterKeyboard: true })
      }

      // The sentinel node is recreated when results change, so rebind the observer
      // after each fresh search result set.
      this.attachObserverToSentinel()
      this.scrollToTop()

      void this.analyticsService.track("search", { text })
    } catch (error) {
      if (isStale()) return
      console.error("Error loading search results:", error)
      this.toast.show("Error loading search results", { action: "OK" })
    } finally {
      if (!isStale()) {
        this.isLoading = false
        this.cdr.detectChanges()
      }
    }
  }

  private toDisplayVerse(verse: Verse): Verse {
    const verseText = this.getVerseText(verse)
    return {
      ...verse,
      highlightedSegments: this.getHighlightedSegments(
        verseText,
        this.searchTerm,
      ),
    }
  }

  getVerseText(verse: Verse) {
    let result = ""
    for (const line of verse.text) {
      if (line.type !== "text" && line.type !== "paragraph") {
        continue
      }
      result += `${line.text} `
    }
    return result
  }

  @ViewChild("resultsContainer", { static: false })
  resultsContainer!: ElementRef

  scrollToTop() {
    afterNextRender(
      () => {
        if (this.resultsContainer?.nativeElement) {
          this.resultsContainer.nativeElement.scrollTo({
            top: 0,
            behavior: "smooth",
          })
        }
      },
      { injector: this.injector },
    )
  }

  findBookById(bookId: string): Book | undefined {
    return this.bookService.findBook(bookId)
  }

  getHighlightedSegments(
    verseText: string,
    term: string,
  ): Array<{ text: string; highlight: boolean }> {
    if (!term.trim()) {
      return [{ text: verseText, highlight: false }]
    }
    const segments: Array<{ text: string; highlight: boolean }> = []
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const regex = new RegExp(escaped, "gi")
    let lastIndex = 0
    let match = regex.exec(verseText)
    while (match !== null) {
      if (match.index > lastIndex) {
        segments.push({
          text: verseText.slice(lastIndex, match.index),
          highlight: false,
        })
      }
      segments.push({ text: match[0], highlight: true })
      lastIndex = regex.lastIndex
      match = regex.exec(verseText)
    }
    if (lastIndex < verseText.length) {
      segments.push({ text: verseText.slice(lastIndex), highlight: false })
    }
    return segments.length > 0
      ? segments
      : [{ text: verseText, highlight: false }]
  }
}
