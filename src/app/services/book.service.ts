import { isPlatformBrowser } from "@angular/common"
import { Injectable, inject, NgZone, PLATFORM_ID } from "@angular/core"
import { Capacitor } from "@capacitor/core"
import { BehaviorSubject, firstValueFrom } from "rxjs"
import { filter, pairwise } from "rxjs/operators"
import { SHARED_BOOK_INTROS } from "../bible-canon"
import { APP_PLUGIN } from "../tokens"
import { BibleApiService } from "./bible-api.service"
import { NetworkService } from "./network.service"

@Injectable({
  providedIn: "root",
})
export class BookService {
  private booksSubject = new BehaviorSubject<Book[]>([])
  private initPromise?: Promise<void>
  books$ = this.booksSubject
    .asObservable()
    .pipe(filter((books) => books.length > 0))
  private unavailableSubject = new BehaviorSubject(false)
  /**
   * True once loading the book list has failed with nothing cached, e.g. a
   * first launch without a connection. The reader shows an empty state with
   * a retry until a later load succeeds.
   */
  booksUnavailable$ = this.unavailableSubject.asObservable()
  private readonly networkService = inject(NetworkService)
  private readonly appPlugin = inject(APP_PLUGIN)
  private readonly ngZone = inject(NgZone)
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID))

  constructor(private apiService: BibleApiService) {
    // APP_INITIALIZER reports failures; an unhandled rejection here would
    // kill the prerender worker and fail the build.
    this.initializeBooks().catch(() => {})
    this.retryWhenLikelyToSucceed()
  }

  /** Loads books before the app starts; concurrent callers share one load. */
  initializeBooks(): Promise<void> {
    if (this.getBooks().length > 0) return Promise.resolve()
    this.initPromise ??= this.loadBooks()
      .then(
        () => this.unavailableSubject.next(false),
        (error: unknown) => {
          // Never while prerendering: the empty state would be baked into
          // every static page, which instead falls back to client rendering.
          if (this.isBrowser) this.unavailableSubject.next(true)
          throw error
        },
      )
      .finally(() => {
        this.initPromise = undefined
      })
    return this.initPromise
  }

  /** Retries a failed load; failures only keep the empty state up. */
  retryBooks(): Promise<void> {
    return this.initializeBooks().catch(() => {})
  }

  private retryWhenLikelyToSucceed(): void {
    const retryIfUnavailable = () => {
      if (this.unavailableSubject.value) void this.retryBooks()
    }
    this.networkService.isOffline$
      .pipe(
        pairwise(),
        filter(([wasOffline, isOffline]) => wasOffline && !isOffline),
      )
      .subscribe(retryIfUnavailable)
    // A connection may come back while the app is in the background, when
    // the network listener can miss the change.
    if (Capacitor.isNativePlatform()) {
      void this.appPlugin
        .addListener("resume", () => this.ngZone.run(retryIfUnavailable))
        .catch(() => {})
    }
  }

  private async loadBooks(): Promise<void> {
    // Fetch both before emitting: a deep link to /pentateuco/intro must find
    // that book on the first emission or it falls back to the About page.
    const [books, intros] = await Promise.all([
      firstValueFrom(this.apiService.getAvailableBooks()),
      // Standalone introductions are optional.
      firstValueFrom(this.apiService.getIntros()).catch(
        () => [] as IntroSummary[],
      ),
    ])

    const introList = Array.isArray(intros) ? intros : []
    // Clone: the array from BibleApiService is shared with its cache.
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
    // New object so change detection and the reader's memoised list notice.
    const loaded: Book = { ...book, introduction: intro.introduction ?? [] }
    this.booksSubject.next(
      this.getBooks().map((entry) => (entry.id === book.id ? loaded : entry)),
    )
    return loaded
  }

  /** Points a book at the introduction its edition shares across a cluster. */
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

  static readonly INTRO_URL_SEGMENT = "intro"

  /** Chapter 0 (the introduction) reads as /intro; others keep their number. */
  getChapterUrlSegment(chapter: Chapter["number"]): string {
    return chapter === 0 ? BookService.INTRO_URL_SEGMENT : chapter.toString()
  }

  /** Accepts "intro" (and legacy "0") for the introduction. */
  parseChapterUrlSegment(
    segment: string | null | undefined,
    fallback = 1,
  ): number {
    if (segment == null || segment === "") return fallback
    if (segment === BookService.INTRO_URL_SEGMENT) return 0
    // parseInt would accept partial parses like "2junk" or "1.5".
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
