import { Injectable } from "@angular/core"
import { BehaviorSubject, firstValueFrom } from "rxjs"
import { filter } from "rxjs/operators"
import { SHARED_BOOK_INTROS } from "../bible-canon"
import { normalizeForSearch } from "../utils/text"
import { BibleApiService } from "./bible-api.service"

@Injectable({
  providedIn: "root",
})
export class BookService {
  private booksSubject = new BehaviorSubject<Book[]>([])
  private groupIntrosSubject = new BehaviorSubject<IntroSummary[]>([])
  /** Standalone introductions, in API order. */
  groupIntros$ = this.groupIntrosSubject.asObservable()
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

    // Fetch both before emitting: a reader resolving /pentateuco/intro from
    // the URL must find that book on the very first emission, otherwise a
    // deep link or refresh falls back to the About page.
    const [books, intros] = await Promise.all([
      firstValueFrom(this.apiService.getAvailableBooks()),
      // Standalone introductions are optional: an API without them (or being
      // offline) just means no introduction entries.
      firstValueFrom(this.apiService.getIntros()).catch(
        () => [] as IntroSummary[],
      ),
    ])

    const introList = Array.isArray(intros) ? intros : []
    this.groupIntrosSubject.next(introList)
    // Clone before appending the synthetic entries so we do not mutate the
    // shared API/cache array returned by BibleApiService.
    const introSlugs = new Set(introList.map((intro) => intro.slug))
    this.booksSubject.next([
      ...books.map((book) => this.withSharedIntro(book, introSlugs)),
      this.getAboutBook(),
      ...introList.map((intro) => this.toIntroBook(intro)),
    ])
  }

  /** Fetches an introduction body and caches it on its synthetic book. */
  async loadGroupIntroBody(book: Book): Promise<Book> {
    const slug = BookService.introSlugFor(book)
    if (!slug || book.introduction?.length) return book
    const intro = await firstValueFrom(this.apiService.getIntro(slug))
    // Replace the entry rather than mutating it, so change detection and the
    // reader's memoised chapter list both notice.
    const loaded: Book = { ...book, introduction: intro.introduction ?? [] }
    this.booksSubject.next(
      this.getBooks().map((entry) => (entry.id === book.id ? loaded : entry)),
    )
    return loaded
  }

  /**
   * Points a book at the shared introduction that covers it, when the edition
   * writes one introduction for a cluster of books instead of one per book.
   */
  private withSharedIntro(book: Book, available: Set<string>): Book {
    if (book.introduction?.length) return book
    const slug = SHARED_BOOK_INTROS[book.id]
    return slug && available.has(slug)
      ? { ...book, sharedIntroSlug: slug }
      : book
  }

  /** The standalone introduction a book reads from, if any. */
  static introSlugFor(book: Book | undefined): string | undefined {
    return book?.introSlug ?? book?.sharedIntroSlug
  }

  private toIntroBook(intro: IntroSummary): Book {
    const name = this.formatIntroName(intro.name)
    return {
      id: intro.slug,
      name,
      shortName: name,
      abrv: intro.slug,
      // No chapters: the introduction is the only thing to read.
      chapterCount: 0,
      introduction: [],
      introSlug: intro.slug,
    }
  }

  // Portuguese particles stay lower-case in a title, except as the first word.
  private static readonly TITLE_PARTICLES = new Set([
    "a",
    "ao",
    "aos",
    "as",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "o",
    "os",
  ])

  /** The USFM headers are upper-case; show them as a normal title. */
  private formatIntroName(name: string): string {
    const trimmed = name.trim()
    if (trimmed !== trimmed.toUpperCase()) return trimmed
    return trimmed
      .toLocaleLowerCase("pt")
      .split(/\s+/)
      .map((word, index) =>
        index > 0 && BookService.TITLE_PARTICLES.has(word)
          ? word
          : word.charAt(0).toLocaleUpperCase("pt") + word.slice(1),
      )
      .join(" ")
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
    const normalizeVariants = (value: string) => {
      const base = normalizeForSearch(value)
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
