import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  type ElementRef,
  Injector,
  ViewChild,
} from "@angular/core"
import { MatIconModule } from "@angular/material/icon"
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar"
import { ActivatedRoute, Router, RouterModule } from "@angular/router"
import { firstValueFrom, type Subscription } from "rxjs"
import { UnifiedGesturesDirective } from "../../directives/unified-gesture.directive"
import { AnalyticsService } from "../../services/analytics.service"
import { BibleApiService } from "../../services/bible-api.service"
import { BibleReferenceService } from "../../services/bible-reference.service"
import { BookService } from "../../services/book.service"
import { SeoService } from "../../services/seo.service"
import { highlightSegments } from "../../utils/text"
import { SearchBarComponent } from "../search-bar/search-bar.component"

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
  /**
   * Bumped on every submit. A share target can deliver two queries back to
   * back, and the slower request must not overwrite the newer one's results,
   * clear its loading state, or navigate away from it.
   */
  private searchGeneration = 0

  constructor(
    private apiService: BibleApiService,
    private referenceService: BibleReferenceService,
    private bookService: BookService,
    private snackBar: MatSnackBar,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private analyticsService: AnalyticsService,
    private injector: Injector,
    private seoService: SeoService,
  ) {}

  ngOnInit(): void {
    this.seoService.updateForSearch()

    // Share-target launches land here as /search?q=<shared text>. Subscribe
    // rather than read the snapshot once: Angular reuses this component when
    // navigating between /search URLs, so a second share would be ignored.
    this.queryParamSubscription = this.route.queryParamMap.subscribe(
      (params) => {
        const sharedQuery = params.get("q")
        if (!sharedQuery || sharedQuery === this.lastSharedQuery) return
        this.lastSharedQuery = sharedQuery
        // Fire-and-forget: onSearchSubmit surfaces its own errors via snackbar.
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
    this.queryParamSubscription?.unsubscribe()
    if (this.observer) {
      this.observer.disconnect()
    }
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

    // The same guard the submit path uses, for the same reason: a page of
    // results for the query being scrolled must not append itself to whatever
    // query replaced it while the request was in flight.
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
      // `return` inside the try still runs this, so a superseded page would
      // otherwise clear the loading state of the search that replaced it.
      if (!isStale()) {
        this.isLoading = false
        this.cdr.detectChanges()
      }
    }
  }

  async onSearchSubmit(text: string): Promise<void> {
    const generation = ++this.searchGeneration
    const isStale = () => generation !== this.searchGeneration
    this.searchTerm = text
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
      try {
        await firstValueFrom(
          this.apiService.getVerse(
            targetBook.id,
            targetChapter,
            targetVerseStart || 1,
          ),
        )
        if (isStale()) return
        await this.router.navigate(
          ["/", targetBook.id, targetChapter],
          targetVerseStart !== undefined
            ? { queryParams: { verseStart: targetVerseStart } }
            : {},
        )
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
          this.snackBar.open("Capitulo ou versiculo não existe", "Fechar", {
            duration: 3000,
          })
        } else {
          this.snackBar.open("Error loading verse", "OK", {
            duration: 3000,
          })
        }
      }
      return
    }

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
        this.snackBar.open("Nenhum resultado encontrado", "Fechar", {
          duration: 3000,
        })
      } else {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
        this.snackBar.open(resultsMessage, "Fechar", {
          duration: 3000,
        })
      }

      // The sentinel node is recreated when results change, so rebind the observer
      // after each fresh search result set.
      this.attachObserverToSentinel()
      this.scrollToTop()

      void this.analyticsService.track("search", { text })
    } catch (error) {
      if (isStale()) return
      console.error("Error loading search results:", error)
      this.snackBar.open("Error loading search results", "OK", {
        duration: 3000,
      })
    } finally {
      // `return` inside the try still runs this, so a superseded search would
      // otherwise clear the loading state of the one that replaced it.
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

  getHighlightedSegments(verseText: string, term: string): HighlightSegment[] {
    return highlightSegments(verseText, term)
  }
}
