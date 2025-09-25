import { Injectable } from "@angular/core"
import { BehaviorSubject, firstValueFrom } from "rxjs"
import { filter, tap } from "rxjs/operators"
import { BibleApiService } from "./bible-api.service"

@Injectable({
  providedIn: "root",
})
export class BookService {
  private booksSubject = new BehaviorSubject<Book[]>([])
  books$ = this.booksSubject
    .asObservable()
    .pipe(filter((books) => books.length > 0))

  constructor(private apiService: BibleApiService) {
    if (this.booksSubject.getValue().length === 0) {
      this.initializeBooks()
    }
  }

  /**
   * Ensures books are loaded before the app starts.
   */
  async initializeBooks(): Promise<void> {
    if (this.getBooks().length > 0) return

    await firstValueFrom(
      this.apiService.getAvailableBooks().pipe(
        tap((books) => {
          books.push(this.getAboutBook())
          this.booksSubject.next(books)
        }),
      ),
    )
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

  findBookByAbrv(bookAbrv: Book["abrv"]): Book | undefined {
    return this.getBooks().find(
      (book) =>
        book.abrv.replace(/\s+/g, " ").trim().toLocaleLowerCase() ===
        bookAbrv.replace(/\s+/g, " ").trim().toLocaleLowerCase(),
    )
  }

  findBookByUrlAbrv(bookAbrv: Book["abrv"]): Book | undefined {
    return this.getBooks().find((book) => this.getUrlAbrv(book) === bookAbrv)
  }

  findBook(bookId: Book["id"] | Book["abrv"]): Book {
    return (
      this.findBookById(bookId) ||
      this.findBookByAbrv(bookId) ||
      this.findBookByUrlAbrv(bookId) ||
      this.getAboutBook()
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
