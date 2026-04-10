import {
  ChangeDetectorRef,
  Component,
  type ElementRef,
  ViewChild,
} from "@angular/core"
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar"
import { Router, RouterModule } from "@angular/router"
import { firstValueFrom } from "rxjs"
import { UnifiedGesturesDirective } from "../../directives/unified-gesture.directive"
import { AnalyticsService } from "../../services/analytics.service"
import { BibleApiService } from "../../services/bible-api.service"
import { BibleReferenceService } from "../../services/bible-reference.service"
import { BookService } from "../../services/book.service"
import { SearchBarComponent } from "../search-bar/search-bar.component"

@Component({
  selector: "app-search",
  templateUrl: "./search.component.html",
  styleUrl: "./search.component.css",
  standalone: true,
  imports: [
    SearchBarComponent,
    RouterModule,
    UnifiedGesturesDirective,
    MatSnackBarModule,
  ],
})
export class SearchComponent {
  searchResults: Verse[] = []

  searchTerm = ""

  currentPage = 1

  totalResults = 0
  isLoading = false
  private observer: IntersectionObserver | null = null

  @ViewChild("sentinel", { static: false }) sentinel!: ElementRef
  private lastSentinel: Element | null = null

  constructor(
    private apiService: BibleApiService,
    private referenceService: BibleReferenceService,
    private bookService: BookService,
    private snackBar: MatSnackBar,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private analyticsService: AnalyticsService,
  ) {}

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

    this.isLoading = true
    try {
      const results = await firstValueFrom(
        this.apiService.search(this.searchTerm, this.currentPage + 1),
      )
      this.searchResults.push(...results.verses)
      this.totalResults = results.total
      this.currentPage++
      this.attachObserverToSentinel() // Re-attach observer after loading more results
    } catch (error) {
      console.error("Error loading more results:", error)
    } finally {
      this.isLoading = false
      this.cdr.detectChanges()
    }
  }

  async onSearchSubmit(text: string): Promise<void> {
    this.searchTerm = text
    const references = this.referenceService.extract(text)

    if (references.length > 0) {
      // A well-formed Bible reference should jump straight into the reader instead
      // of going through the broader full-text search results flow.
      const ref = references[0]
      const book = ref.book ? this.bookService.findBook(ref.book) : null
      if (book) {
        const verseStart = ref.verses
          ? ref.verses[0].type === "single"
            ? ref.verses[0].verse
            : ref.verses[0].start
          : 1
        try {
          await firstValueFrom(
            this.apiService.getVerse(book.id, ref.chapter, verseStart),
          )
          await this.router.navigate(
            ["/", book.id, ref.chapter ? ref.chapter : 1],
            ref.verses ? { queryParams: { verseStart } } : {},
          )
        } catch (err) {
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
    }

    this.isLoading = true
    try {
      const results = await firstValueFrom(this.apiService.search(text, 1))
      this.searchResults = results.verses
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
      console.error("Error loading search results:", error)
      this.snackBar.open("Error loading search results", "OK", {
        duration: 3000,
      })
    } finally {
      this.isLoading = false
      this.cdr.detectChanges()
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
    setTimeout(() => {
      if (this.resultsContainer?.nativeElement) {
        this.resultsContainer.nativeElement.scrollTo({
          top: 0,
          behavior: "smooth",
        })
      }
    }, 100)
  }

  findBookById(bookId: string): Book | undefined {
    return this.bookService.findBook(bookId)
  }
}
