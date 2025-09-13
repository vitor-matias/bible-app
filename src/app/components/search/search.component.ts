import { ChangeDetectorRef, Component } from "@angular/core"
import {
  AfterViewInit,
  type ElementRef,
  OnDestroy,
  ViewChild,
  ViewContainerRef,
} from "@angular/core"
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar"
import { Router, RouterModule } from "@angular/router"
import { BibleApiService } from "../../services/bible-api.service"
import { SearchBarComponent } from "../search-bar/search-bar.component"
import { UnifiedGesturesDirective } from "../../directives/unified-gesture.directive"
import { BibleReferenceService } from "../../services/bible-reference.service"

@Component({
  selector: "app-search",
  templateUrl: "./search.component.html",
  styleUrl: "./search.component.css",
  standalone: true,
  imports: [SearchBarComponent, RouterModule, UnifiedGesturesDirective, MatSnackBarModule],
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
    private referenceService: BibleReferenceService,
    private snackBar: MatSnackBar,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private viewContainerRef: ViewContainerRef
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
    const references = this.referenceService.extract(text)

    if (references.length > 0) {
      const ref = references[0]
      const book = this.findBook(ref.book)
      if(book){
        this.apiService.getVerse(book.id, ref.chapter, ref.verses ? (ref.verses[0].type === "single" ? ref.verses[0].verse : ref.verses[0].start) : 1).subscribe({
          next: (verse) => {
            this.router.navigate(["/", book.id, ref.chapter ? ref.chapter : 1], ref.verses ? {
              queryParams: {
                verse: ref.verses[0].type === "single" ? ref.verses[0].verse : ref.verses[0].start,
              },
            } : {})
          },
          error: (err) => {
             console.error(err)
           if (err && (err.status === 404 || err.status === 400)) {
              this.snackBar.open("Capitulo ou versiculo não existe", "Fechar", {
               duration: 3000,
              })
            } else {
              this.snackBar.open("Error loading verse", "OK", { duration: 3000 })
            }
            
          }
        })
      return;
      }
    }

    this.isLoading = true
    this.apiService.search(text, 1).subscribe((results) => {
      this.searchResults = results.verses
      this.totalResults = results.total
      this.currentPage = 1
      this.isLoading = false
      this.cdr.detectChanges()

      if(results.total === 0){
        this.snackBar.open("Nenhum resultado encontrado", "Fechar", {
          duration: 3000,
        })
      }
      else{
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
        this.snackBar.open(`Encontrados ${results.total} resultados`, "Fechar", {
          duration: 3000,
        })
      }

      this.cdr.detectChanges()
      this.attachObserverToSentinel() // Attach observer after new search
      this.scrollToTop()
    })
  }

  getVerseText(verse: Verse) {
    let result = ""
    for (const line of verse.text) {
      if(line.type !== "text" && line.type !== "paragraph"){
        continue
      }
      result += `${line.text} `
    }
    return result
  }

  findBookById(bookId: Book["id"]): Book | undefined {
    return this.books.find((book) => book.id === bookId)
  }

  findBookByUrlAbrv(bookAbrv: Book["abrv"]): Book | undefined {
    return this.books.find((book) => this.getUrlAbrv(book) === bookAbrv)
  }

  findBookByName(bookName: string): Book | undefined {
    const lowerName = bookName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, "")
    return this.books.find(
      (book) =>
        book.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "") === lowerName ||
        book.shortName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "") === lowerName,
    )
  }

  getUrlAbrv(book: Book): string {
    return book.abrv.replace(/\s/g, "").toLowerCase()
  }

  findBook(bookId: Book["id"] | Book["abrv"] | Book["name"]): Book | null {
    const bookIdLower = bookId.toLowerCase()
    return (
      this.findBookById(bookIdLower) ||
      this.findBookByUrlAbrv(bookIdLower) ||
      this.findBookByName(bookIdLower) ||
      null
    )
  }

  @ViewChild("container", { static: false }) resultsContainer!: Element

  scrollToTop() {
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }, 100)
  }
}
