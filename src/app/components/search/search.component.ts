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
import { NetworkService } from "../../services/network.service"
import { OfflineSearchService } from "../../services/offline-search.service"
import { SeoService } from "../../services/seo.service"
import { ThemeService } from "../../services/theme.service"
import { ToastService } from "../../services/toast.service"
import { passageLabel } from "../../utils/passage-label"
import {
  isAmbiguousPsalmNumber,
  PSALMS_BOOK_ID,
  parsePsalmPair,
  psalmFromLiturgical,
} from "../../utils/psalms"
import { highlightWords, verseLines, verseText } from "../../utils/text-search"
import { SearchBarComponent } from "../search-bar/search-bar.component"

/** Searching as people type waits for them to pause this long. */
export const TYPING_PAUSE_MS = 2500

/**
 * A word search returns at most this many verses, the nearest in meaning
 * (KNN_MAX_RESULTS in the API), so its total is a cap, not a count.
 */
export const SEARCH_RESULT_CAP = 100

/** Offline, before the Bible was ever stored on the device. */
const NOTHING_STORED =
  "Sem ligação, e a Bíblia ainda não está guardada neste dispositivo. Abra a app uma vez com ligação para a guardar."

/** The server's search failed, and no Bible is stored to search instead. */
const SEARCH_FAILED =
  "Não foi possível pesquisar. Verifique a ligação e tente novamente."

/** Verses of a search over the stored Bible shown at a time. */
const STORED_PAGE_SIZE = 50

/** What a query opens in the reader (SearchComponent.resolvePassage). */
interface PassageTarget {
  book: Book
  chapter: number
  verseStart?: number
  /** Cited with both numbers ("Sl 94 (95)"), so not to be asked which. */
  pairedPsalm: boolean
}

/** One of the psalms a bare psalm number may mean (showPsalmChoice). */
export interface PsalmOption {
  psalm: number
  /** Where to open it; none for the psalm's beginning. */
  verseStart?: number
  label: string
  /** Which numbering names it so: "nesta Bíblia" or "como na Missa". */
  note: string
  /** How it begins, once loaded; people know a psalm by its first line. */
  firstLine?: string
  /** The psalm's title, until (or unless) the first line loads. */
  title: string
}

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
    MatIconModule,
  ],
})
export class SearchComponent {
  searchResults: Verse[] = []

  searchTerm = ""
  /**
   * What the search field shows: set by Return and by shared queries, never
   * by a search that ran on a typing pause, which would rewrite what is still
   * being typed.
   */
  fieldValue = ""
  hasSearched = false

  currentPage = 1

  totalResults = 0
  isLoading = false
  /** A new word search is under way (paging more results is not). */
  searching = false
  /**
   * A psalm number that names two psalms, this edition's and the liturgy's:
   * the choice between them, instead of guessing which was meant.
   */
  psalmChoice: PsalmOption[] | null = null
  /** For screen readers, which no longer get the count from a toast. */
  statusMessage = ""
  /** No connection: the hints say what search can still do. */
  offline = false
  /**
   * The matches of a search over the Bible stored on the device, when the
   * server's search was out of reach; the list shows them a page at a time.
   */
  storedMatches: Verse[] | null = null
  /** Offline, and no Bible stored on the device to search instead. */
  nothingStored = false
  /** The server's search failed, with no stored Bible to search instead. */
  searchFailed = false
  readonly searchFailedMessage = SEARCH_FAILED
  readonly nothingStoredMessage = NOTHING_STORED
  private observer: IntersectionObserver | null = null

  @ViewChild("sentinel", { static: false }) sentinel!: ElementRef
  private lastSentinel: Element | null = null
  private queryParamSubscription?: Subscription
  /** Guards against re-running the same shared query on unrelated emissions. */
  private lastSharedQuery: string | null = null
  /** Bumped on every submit so a slower, superseded request can be ignored. */
  private searchGeneration = 0

  private readonly nativeChrome = inject(NativeChromeService)
  private readonly network = inject(NetworkService)
  private readonly offlineSearch = inject(OfflineSearchService)
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

    this.network.isOffline$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((offline) => {
        this.offline = offline
        this.cdr.markForCheck()
      })

    this.typed
      .pipe(
        debounceTime(TYPING_PAUSE_MS),
        map((text) => text.trim()),
        filter(
          (text) =>
            text.length >= 2 &&
            text !== this.searchTerm.trim() &&
            !this.resolvePassage(text).target,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((text) => void this.onSearchSubmit(text, { typed: true }))

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
   * The passage a query names, which a search opens in the reader: a
   * reference ("Jo 3,16", "Sl 94 (95), 1-2") or a book's name. Null for words
   * to search, in `text`. Return and a typing pause both ask this, so they
   * agree; only Return opens it, as a pause mid-reference ("Jo 3" on the way
   * to "Jo 3,16") must not navigate away.
   */
  private resolvePassage(query: string): {
    text: string
    target: PassageTarget | null
  } {
    // "Sl 94 (95), 1-2": with both numbers, a leaflet names one psalm.
    const pair = parsePsalmPair(query)
    const pairBook = pair ? this.bookService.findBook(pair.book) : null
    const pairedPsalm = !!pair && pairBook?.id === PSALMS_BOOK_ID
    const text =
      pair && pairedPsalm && pairBook
        ? `${pairBook.abrv} ${pair.psalm}${pair.rest.replace(/^,\s*/, ",")}`
        : query
    const references = this.referenceService.extract(text)

    let target: PassageTarget | null = null
    if (references.length > 0) {
      // A well-formed Bible reference jumps straight into the reader instead
      // of going through the broader full-text search results flow.
      const ref = references[0]
      const book = ref.book ? this.bookService.findBook(ref.book) : null
      if (book) {
        const first = ref.verses?.[0]
        target = {
          book,
          chapter: ref.chapter || 1,
          verseStart: first
            ? first.type === "single"
              ? first.verse
              : first.start
            : undefined,
          pairedPsalm,
        }
      }
    } else {
      // The query is a book's name or abbreviation.
      const book = this.bookService.findBook(text.trim())
      if (book && book.id !== "about") {
        target = { book, chapter: 1, pairedPsalm }
      }
    }

    // "Sl 115 (116B)" names the second half of this edition's 116.
    if (
      target &&
      pairedPsalm &&
      pair?.verse &&
      target.verseStart === undefined
    ) {
      target.verseStart = pair.verse
    }
    return { text, target }
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
    if (this.storedMatches) {
      const shown = this.searchResults.length
      this.searchResults.push(
        ...this.storedMatches
          .slice(shown, shown + STORED_PAGE_SIZE)
          .map((v) => this.toDisplayVerse(v)),
      )
      this.attachObserverToSentinel()
      this.cdr.detectChanges()
      return
    }

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

  /**
   * Opens the passage the query names, or searches its words. `typed`: it
   * ran on a typing pause, while the field may still be in use.
   */
  async onSearchSubmit(
    query: string,
    { typed = false }: { typed?: boolean } = {},
  ): Promise<void> {
    const generation = ++this.searchGeneration
    const isStale = () => generation !== this.searchGeneration
    this.psalmChoice = null
    const { text, target } = this.resolvePassage(query)

    if (
      target?.book.id === PSALMS_BOOK_ID &&
      !target.pairedPsalm &&
      isAmbiguousPsalmNumber(target.chapter)
    ) {
      this.showPsalmChoice(
        query,
        target.book,
        target.chapter,
        target.verseStart,
      )
      return
    }

    if (target) {
      const {
        book: targetBook,
        chapter: targetChapter,
        verseStart: targetVerseStart,
      } = target
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
          this.toast.show("Este capítulo ou versículo não existe.")
        } else if (this.network.isOffline) {
          this.toast.show(
            "Sem ligação, e este capítulo ainda não está guardado neste dispositivo.",
            { action: "OK" },
          )
        } else {
          this.toast.show("Não foi possível abrir a passagem.", {
            action: "OK",
          })
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
    if (!typed) this.fieldValue = text
    this.syncNativeChrome()
    this.hasSearched = true
    this.isLoading = true
    this.searching = true
    this.storedMatches = null
    this.nothingStored = false
    this.searchFailed = false
    this.statusMessage = "A procurar…"
    try {
      if (this.network.isOffline) {
        // The search by meaning runs on the server; the stored Bible can
        // still be searched for words.
        const stored = await this.searchStoredBible(text)
        if (isStale()) return
        this.nothingStored = !stored
      } else {
        const results = await firstValueFrom(this.apiService.search(text, 1))
        if (isStale()) return
        this.searchResults = results.verses.map((v) => this.toDisplayVerse(v))
        this.totalResults = results.total
        this.currentPage = 1
        void this.analyticsService.track("search", { text })
      }
      this.showResults(text, typed)
    } catch (error) {
      if (isStale()) return
      // The server couldn't answer: the stored Bible still can.
      const stored = await this.searchStoredBible(text)
      if (isStale()) return
      if (stored) {
        this.showResults(text, typed)
        return
      }
      // Not "no results": the page says the search itself failed.
      console.error("Error loading search results:", error)
      this.searchFailed = true
      this.searchResults = []
      this.totalResults = 0
      this.statusMessage = SEARCH_FAILED
    } finally {
      if (!isStale()) {
        this.isLoading = false
        this.searching = false
        this.cdr.detectChanges()
      }
    }
  }

  /**
   * Searches the Bible stored on the device for the query's words. False when
   * none is stored, as before the app has once been online.
   */
  private async searchStoredBible(text: string): Promise<boolean> {
    const matches = await this.offlineSearch.search(text)
    if (matches === null) {
      this.searchResults = []
      this.totalResults = 0
      return false
    }
    this.storedMatches = matches
    this.searchResults = matches
      .slice(0, STORED_PAGE_SIZE)
      .map((v) => this.toDisplayVerse(v))
    this.totalResults = matches.length
    this.currentPage = 1
    return true
  }

  /**
   * The outcome of a word search: its count read out, the list at the top,
   * and after Return the keyboard closed over it. A search that ran on a
   * typing pause leaves the field in use.
   */
  private showResults(text: string, typed: boolean): void {
    this.searching = false
    // The heading has the count; a toast over the list only hid a result.
    this.statusMessage = this.nothingStored
      ? NOTHING_STORED
      : this.totalResults === 0
        ? `Nenhum resultado para "${text}"`
        : this.resultsHeading
    if (
      !typed &&
      this.totalResults > 0 &&
      document.activeElement instanceof HTMLElement
    ) {
      document.activeElement.blur()
    }
    // The sentinel node is recreated when results change, so rebind the observer
    // after each fresh search result set.
    this.attachObserverToSentinel()
    this.scrollToTop()
  }

  /**
   * "23 resultados", "Os 100 mais relevantes" when the search capped it, or
   * for the stored Bible "12 versículos com estas palavras".
   */
  get resultsHeading(): string {
    if (this.searching) return "A procurar…"
    if (this.storedMatches) {
      return this.totalResults === 1
        ? "1 versículo com estas palavras"
        : `${this.totalResults} versículos com estas palavras`
    }
    if (this.totalResults >= SEARCH_RESULT_CAP) {
      return `Os ${SEARCH_RESULT_CAP} mais relevantes`
    }
    return this.totalResults === 1
      ? "1 resultado"
      : `${this.totalResults} resultados`
  }

  /** Why the results are a word search, under their heading. */
  get storedResultsHint(): string {
    return this.offline
      ? "Sem ligação: procura as palavras no texto guardado. A pesquisa pelo sentido volta com a ligação."
      : "A pesquisa pelo sentido não respondeu: procura as palavras no texto guardado."
  }

  /** "Lucas 2,32", "Salmo 23 (22),4": as the text cites passages. */
  resultReference(result: Verse): string {
    const book = this.findBookById(result.bookId)
    return book
      ? passageLabel(book, result.chapterNumber, result.number)
      : `${result.chapterNumber},${result.number}`
  }

  /**
   * Most psalms have a different number in the liturgy (see psalms.ts), and a
   * number copied from a leaflet would open a different psalm here. Rather
   * than guess, offer both, each by how it begins.
   */
  private showPsalmChoice(
    query: string,
    psalms: Book,
    psalm: number,
    verseStart: number | undefined,
  ): void {
    const liturgical = psalmFromLiturgical(psalm)
    if (!liturgical) return
    const option = (number: number, note: string, verse?: number) => ({
      psalm: number,
      ...(verse !== undefined && verse > 1 ? { verseStart: verse } : {}),
      label: passageLabel(psalms, number),
      note,
      title:
        psalms.chapters?.find((chapter) => chapter.number === number)?.title ??
        "",
    })
    this.psalmChoice = [
      option(psalm, "nesta Bíblia", verseStart),
      option(liturgical.psalm, "como na Missa", verseStart ?? liturgical.verse),
    ]
    this.searchTerm = query
    this.fieldValue = query
    this.searchResults = []
    this.totalResults = 0
    this.hasSearched = true
    this.isLoading = false
    this.statusMessage = "Qual salmo procura?"
    this.syncNativeChrome()
    this.cdr.detectChanges()

    const choice = this.psalmChoice
    for (const entry of choice) {
      firstValueFrom(
        this.apiService.getVerse(
          PSALMS_BOOK_ID,
          entry.psalm,
          entry.verseStart ?? 1,
        ),
      ).then(
        (verse) => {
          if (this.psalmChoice !== choice) return
          entry.firstLine = firstLine(verse)
          this.cdr.detectChanges()
        },
        () => {}, // Offline and not saved yet: the title stands in.
      )
    }
  }

  /** The verse as one line, the query's words marked, accents aside. */
  private toDisplayVerse(verse: Verse): Verse {
    return {
      ...verse,
      highlightedSegments: highlightWords(verseText(verse), this.searchTerm),
    }
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
}

/**
 * A verse's first line of verse. Many psalms open with a heading ("Salmo de
 * David."), set apart by a paragraph break; the line after it is the one
 * people know.
 */
export function firstLine(verse: Verse): string | undefined {
  const lines = verseLines(verse)
  const heading = lines.findIndex((line) => line.paragraph)
  const from = (index: number) =>
    lines.slice(index).find((line) => line.text)?.text
  return (heading === -1 ? undefined : from(heading)) ?? from(0)
}
