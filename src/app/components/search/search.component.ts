import { ChangeDetectorRef, Component } from "@angular/core"
import {
  AfterViewInit,
  type ElementRef,
  OnDestroy,
  ViewChild,
} from "@angular/core"
import { type Router, RouterModule } from "@angular/router"
import { BibleApiService } from "../../services/bible-api.service"
import { SearchBarComponent } from "../search-bar/search-bar.component"
import { UnifiedGesturesDirective } from "../../directives/unified-gesture.directive"

@Component({
  selector: "app-search",
  templateUrl: "./search.component.html",
  styleUrl: "./search.component.css",
  standalone: true,
  imports: [SearchBarComponent, RouterModule, UnifiedGesturesDirective],
})
export class SearchComponent {
  searchResults: Verse[] = []

  searchTerm = ""

  currentPage = 1

  books: Book[] = []

  totalResults = 0
  isLoading = false
  private observer: IntersectionObserver | null = null

  @ViewChild("sentinel", { static: false }) sentinel!: ElementRef
  private lastSentinel: Element | null = null

  constructor(
    private apiService: BibleApiService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.apiService.getAvailableBooks().subscribe((books) => {
      this.books = books
    })
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
      this.apiService
        .search(this.searchTerm, this.currentPage + 1)
        .subscribe((results) => {
          this.searchResults.push(...results.verses)
          this.totalResults = results.total
          this.currentPage++
          this.cdr.detectChanges()
          this.isLoading = false
          this.attachObserverToSentinel() // Re-attach observer after loading more results
        })
    } catch (error) {
      console.error("Error loading more results:", error)
    } finally {
      this.isLoading = false
    }
  }

  onSearchSubmit(text: string) {
    this.searchTerm = text
    this.isLoading = true
    this.apiService.search(text, 1).subscribe((results) => {
      this.searchResults = results.verses
      this.totalResults = results.total
      this.currentPage = 1
      this.isLoading = false
      this.cdr.detectChanges()
      this.attachObserverToSentinel() // Attach observer after new search
      this.scrollToTop()
    })
  }

  getVerseText(verse: Verse) {
    let result = ""
    for (const line of verse.text) {
      result += `${line.text} `
    }
    return result
  }

  findBook(bookId: Book["id"] | Book["abrv"]): Book {
    return this.findBookById(bookId) || this.books[0]
  }

  findBookById(bookId: Book["id"]): Book | undefined {
    return this.books.find((book) => book.id === bookId)
  }

  @ViewChild("container", { static: false }) resultsContainer!: Element

  scrollToTop() {
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }, 100)
  }
}
