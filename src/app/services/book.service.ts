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
      // APP_INITIALIZER awaits initializeBooks() and reports failures; this
      // eager kick-off must never surface an unhandled rejection — during
      // prerendering that kills the whole worker thread and fails the build.
      this.initializeBooks().catch(() => {})
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
          // Clone before appending the synthetic About entry so we do not mutate
          // the shared API/cache array returned by BibleApiService.
          this.booksSubject.next([...books, this.getAboutBook()])
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
    if (bookId == null) return undefined
    return this.getBooks().find(
      (book) => book.id.toUpperCase() === bookId.toUpperCase(),
    )
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

  findBookByName(bookName: Book["shortName"]): Book | undefined {
    const normalize = (value: string) =>
      value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase()
    const normalizeVariants = (value: string) => {
      const base = normalize(value)
      const singular =
        base.length > 1 && base.endsWith("s") ? base.slice(0, -1) : ""
      return [base, singular].filter(Boolean)
    }
    const needle = new Set(normalizeVariants(bookName))
    return this.getBooks().find((book) =>
      book?.shortName
        ? normalizeVariants(book.shortName).some((variant) =>
            needle.has(variant),
          )
        : false,
    )
  }

  findBook(bookId: Book["id"] | Book["abrv"] | Book["shortName"]): Book {
    // Resolve the most specific identifiers first, then fall back to the About page
    // so the reader always has a safe destination.
    return (
      this.findBookById(bookId) ||
      this.findBookByAbrv(bookId) ||
      this.findBookByUrlAbrv(bookId) ||
      this.findBookByName(bookId) ||
      this.getAboutBook()
    )
  }

  getUrlAbrv(book: Book): string {
    return book.abrv.replace(/\s/g, "").toLowerCase()
  }

  /** URL segment used for the book introduction pseudo-chapter. */
  static readonly INTRO_URL_SEGMENT = "intro"

  /**
   * Maps an internal chapter number to its URL segment: the introduction
   * (chapter 0) reads as /intro, every real chapter keeps its number.
   */
  getChapterUrlSegment(chapter: Chapter["number"]): string {
    return chapter === 0 ? BookService.INTRO_URL_SEGMENT : chapter.toString()
  }

  /**
   * Parses a chapter URL segment back to the internal chapter number.
   * Accepts "intro" (and legacy "0") for the introduction.
   */
  parseChapterUrlSegment(
    segment: string | null | undefined,
    fallback = 1,
  ): number {
    if (segment == null || segment === "") return fallback
    if (segment === BookService.INTRO_URL_SEGMENT) return 0
    // Only whole non-negative decimal segments are canonical chapter URLs;
    // reject partial parses like "2junk" or "1.5".
    if (!/^\d+$/.test(segment)) return fallback
    const parsed = Number.parseInt(segment, 10)
    return Number.isSafeInteger(parsed) ? parsed : fallback
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
