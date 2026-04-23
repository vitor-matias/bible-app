import { DOCUMENT } from "@angular/common"
import { HttpErrorResponse } from "@angular/common/http"
import {
  AfterViewInit,
  Component,
  type ElementRef,
  Inject,
  NgZone,
  OnDestroy,
  OnInit,
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
import { SearchStateService } from "../../services/search-state.service"
import { INTERSECTION_OBSERVER } from "../../tokens"
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
export class SearchComponent implements OnInit, AfterViewInit, OnDestroy {
  searchResults: Verse[] = []

  searchTerm = ""

  currentPage = 1

  totalResults = 0
  isLoading = false
  private observer: IntersectionObserver | null = null
  private scrollTimeout?: number
  private observerReattachTimeout?: number

  @ViewChild("sentinel", { static: false }) sentinel!: ElementRef

  constructor(
    private apiService: BibleApiService,
    private referenceService: BibleReferenceService,
    private bookService: BookService,
    private snackBar: MatSnackBar,
    private router: Router,
    private ngZone: NgZone,
    private analyticsService: AnalyticsService,
    private searchStateService: SearchStateService,
    @Inject(DOCUMENT) private document: Document,
    @Inject(INTERSECTION_OBSERVER)
    private intersectionObserver: typeof IntersectionObserver,
  ) {}

  ngOnInit(): void {
    const cached = this.searchStateService.restore()
    if (cached) {
      this.searchTerm = cached.searchTerm
      this.searchResults = cached.searchResults
      this.currentPage = cached.currentPage
      this.totalResults = cached.totalResults
    }
  }

  ngAfterViewInit(): void {
    this.attachObserverToSentinel()
  }

  ngOnDestroy(): void {
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout)
      this.scrollTimeout = undefined
    }
    if (this.observerReattachTimeout) {
      clearTimeout(this.observerReattachTimeout)
      this.observerReattachTimeout = undefined
    }
    if (this.observer) {
      this.observer.disconnect()
    }
    this.searchStateService.save({
      searchTerm: this.searchTerm,
      searchResults: this.searchResults,
      currentPage: this.currentPage,
      totalResults: this.totalResults,
    })
  }

  private scheduleObserverReattach(): void {
    if (this.observerReattachTimeout) {
      clearTimeout(this.observerReattachTimeout)
    }
    this.observerReattachTimeout = window.setTimeout(() => {
      this.attachObserverToSentinel()
      this.observerReattachTimeout = undefined
    }, 0)
  }

  private attachObserverToSentinel() {
    if (this.observer) {
      this.observer.disconnect()
    }
    if (this.sentinel && this.intersectionObserver) {
      this.observer = new this.intersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && !this.isLoading) {
            this.ngZone.run(() => {
              this.loadMoreResults()
            })
          }
        },
        { threshold: 1.0 },
      )
      this.observer.observe(this.sentinel.nativeElement)
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
      this.scheduleObserverReattach() // Re-attach observer after loading more results
    } catch (error) {
      console.error("Error loading more results:", error)
    } finally {
      this.isLoading = false
    }
  }

  async onSearchSubmit(text: string): Promise<void> {
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
        await this.router.navigate(
          ["/", targetBook.id, targetChapter],
          targetVerseStart !== undefined
            ? { queryParams: { verseStart: targetVerseStart } }
            : {},
        )
      } catch (err) {
        console.error(err)
        if (err instanceof HttpErrorResponse) {
          if (err.status === 404 || err.status === 400) {
            this.snackBar.open("Capitulo ou versiculo não existe", "Fechar", {
              duration: 3000,
            })
          } else {
            this.snackBar.open("Error loading verse", "OK", {
              duration: 3000,
            })
          }
        } else {
          this.snackBar.open("Error loading verse", "OK", {
            duration: 3000,
          })
        }
      }
      return
    }

    this.searchTerm = text
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
        if (this.document.activeElement instanceof HTMLElement) {
          this.document.activeElement.blur()
        }
        this.snackBar.open(resultsMessage, "Fechar", {
          duration: 3000,
        })
      }

      // The sentinel node is recreated when results change, so rebind the observer
      // after each fresh search result set.
      this.scheduleObserverReattach()
      this.scrollToTop()

      void this.analyticsService.track("search", { text })
    } catch (error) {
      console.error("Error loading search results:", error)
      this.snackBar.open("Error loading search results", "OK", {
        duration: 3000,
      })
    } finally {
      this.isLoading = false
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
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout)
    }
    this.scrollTimeout = window.setTimeout(() => {
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
