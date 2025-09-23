import { Injectable } from "@angular/core"
import { BehaviorSubject, firstValueFrom } from "rxjs"
import { tap } from "rxjs/operators"
import { BibleApiService } from "./bible-api.service"

@Injectable({
  providedIn: "root",
})
export class BookService {
  private booksSubject = new BehaviorSubject<Book[]>([])
  books$ = this.booksSubject.asObservable()

  constructor(private apiService: BibleApiService) {
    if (this.booksSubject.getValue().length === 0) {
      this.initializeBooks()
    }
  }

  /**
   * Ensures books are loaded before the app starts.
   */
  initializeBooks(): Promise<void> {
    return firstValueFrom(
      this.apiService.getAvailableBooks().pipe(
        tap((books) => {
          books.push(this.getAboutBook())
          this.booksSubject.next(books)
        }),
      ),
    ).then(() => {})
  }

  /**
   * Returns the current list of books.
   */
  getBooks(): Book[] {
    return this.booksSubject.getValue()
  }

  findBookById(bookId: Book["id"]): Book | undefined {
    return this.getBooks().find((book) => book.id === bookId)
  }

  findBookByUrlAbrv(bookAbrv: Book["abrv"]): Book | undefined {
    return this.getBooks().find((book) => this.getUrlAbrv(book) === bookAbrv)
  }

  findBook(bookId: Book["id"] | Book["abrv"]): Book {
    return (
      this.findBookById(bookId) ||
      this.findBookByUrlAbrv(bookId) ||
      this.getBooks()[0]
    )
  }

  getUrlAbrv(book: Book): string {
    return book.abrv.replace(/\s/g, "").toLowerCase()
  }

  getAboutBook(): Book {
    return {
      id: "about",
      abrv: "Sobre",
      shortName: "Sobre a Bíblia",
      name: "Sobre a Bíblia dos Capuchinhos",
      chapterCount: 1,
    }
  }
}
