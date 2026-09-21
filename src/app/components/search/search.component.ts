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
import { BibleReferenceService } from "../../services/bible-reference.service"
import {
  type SearchHit,
  type SearchResults,
  SearchService,
} from "../../services/search.service"
import { SeoService } from "../../services/seo.service"
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
  searchResults: SearchHit[] = []

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

  constructor(
    private searchService: SearchService,
    private referenceService: BibleReferenceService,
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

    const generation = this.searchGeneration
    const isStale = () => generation !== this.searchGeneration

    this.isLoading = true
    try {
      const results = await firstValueFrom(
        this.searchService.page(this.searchTerm, this.currentPage + 1),
      )
      if (isStale()) return
      this.searchResults.push(...results.hits)
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
    // What the text means — a place to go, or words to look for — is the
    // search service's to say, as it is for the study panel's search tab.
    // Known before asking, so a reference that leads nowhere leaves the
    // results of the last text search on screen.
    const isTextSearch = this.referenceService.destinationOf(text) === null
    if (isTextSearch) {
      // Paging and highlighting read this.
      this.searchTerm = text
      this.hasSearched = true
      this.isLoading = true
    }

    try {
      const outcome = await firstValueFrom(this.searchService.run(text))
      if (isStale()) return

      if (outcome.kind === "destination") {
        const navigated = await this.router.navigate(
          outcome.link,
          outcome.queryParams ? { queryParams: outcome.queryParams } : {},
        )
        if (navigated || isStale()) return
      } else if (outcome.kind === "missing") {
        this.snackBar.open("Capitulo ou versiculo não existe", "Fechar", {
          duration: 3000,
        })
      } else {
        this.showResults(outcome, text)
      }
    } catch (error) {
      if (isStale()) return
      console.error(error)
      this.snackBar.open(
        isTextSearch ? "Error loading search results" : "Error loading verse",
        "OK",
        { duration: 3000 },
      )
    }
    // A superseded search skips this: the loading state is the newer one's.
    if (!isStale()) {
      this.isLoading = false
      this.cdr.detectChanges()
    }
  }

  private showResults(results: SearchResults, text: string): void {
    this.searchResults = results.hits
    this.totalResults = results.total
    this.currentPage = 1

    if (results.total === 0) {
      this.snackBar.open("Nenhum resultado encontrado", "Fechar", {
        duration: 3000,
      })
    } else {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
      this.snackBar.open(
        results.total === 1
          ? "Encontrado 1 resultado"
          : `Encontrados ${results.total} resultados`,
        "Fechar",
        { duration: 3000 },
      )
    }

    // The sentinel node is recreated when results change, so rebind the
    // observer after each fresh search result set.
    this.attachObserverToSentinel()
    this.scrollToTop()

    void this.analyticsService.track("search", { text })
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
}
