import { Injectable, inject } from "@angular/core"
import {
  catchError,
  from,
  map,
  type Observable,
  of,
  switchMap,
  take,
  throwError,
  timeout,
} from "rxjs"
import { passageLabel } from "../utils/passage-label"
import {
  isAmbiguousPsalmNumber,
  PSALMS_BOOK_ID,
  parsePsalmPair,
  psalmFromLiturgical,
} from "../utils/psalms"
import { highlightWords, verseText } from "../utils/text-search"
import { BibleApiService } from "./bible-api.service"
import { BibleReferenceService } from "./bible-reference.service"
import { BookService } from "./book.service"
import { NetworkService } from "./network.service"
import { OfflineSearchService } from "./offline-search.service"

/** How long results wait for the book list before going without it. */
const BOOK_LIST_PATIENCE_MS = 4000

/** A verse the text search found, ready to be listed. */
export type SearchHit = Verse & {
  key: string
  /** "Mateus 22,37" */
  reference: string
  link: (string | number)[]
  queryParams: { verseStart: Verse["number"] }
  /** The verse's words, with what matched the query marked. */
  highlightedSegments: HighlightSegment[]
}

export type SearchResults = {
  kind: "results"
  query: string
  page: number
  total: number
  hits: SearchHit[]
  /**
   * Who answered. The server's search goes by meaning and the stored Bible's by
   * the words typed, so the same query can list different verses, and a reader
   * comparing two lists should be able to tell which they are looking at.
   */
  engine: "server" | "stored"
}

/** One of the psalms a bare psalm number may mean. */
export type PsalmChoice = {
  label: string
  /** Which numbering names it so: "nesta Bíblia" or "como na Missa". */
  note: string
  link: (string | number)[]
  queryParams?: { verseStart: Verse["number"] }
}

/**
 * What came of a search: somewhere to go, a reference to somewhere that is
 * not there, a number that could mean two psalms, verses found, or — offline —
 * no Bible stored to look in.
 */
export type SearchOutcome =
  | {
      kind: "destination"
      /** "Salmo 93 (94)": where it goes, for saying so aloud. */
      label: string
      link: (string | number)[]
      queryParams?: { verseStart: Verse["number"] }
    }
  | { kind: "psalmChoice"; options: PsalmChoice[] }
  | { kind: "missing" }
  | { kind: "nothingStored" }
  | SearchResults

/**
 * The study panel's search: a reference to go to, or words to look for.
 *
 * The search page has its own flow — paging, suggestions, the psalms' double
 * numbering — and does not use this. What the two share is the word matching
 * in utils/text-search (a verse's words, what to mark), so a hit reads the
 * same in both; a copy of that here once showed a psalm's verse as no text at
 * all, and put a space before the comma after "Senhor".
 */
@Injectable({ providedIn: "root" })
export class SearchService {
  private readonly api = inject(BibleApiService)
  private readonly references = inject(BibleReferenceService)
  private readonly books = inject(BookService)
  private readonly network = inject(NetworkService)
  private readonly offlineSearch = inject(OfflineSearchService)

  /**
   * Runs a search. A reference ("Mt 22,37"), or a book by name, is somewhere
   * to go rather than something to look for, and is asked for before it is
   * offered: "Mt 40,1" reads like a reference and leads nowhere. Anything
   * else goes to the text search. Errors other than "not there" are left to
   * the caller, who knows how it tells its reader that a search failed.
   */
  run(text: string, limit?: number): Observable<SearchOutcome> {
    const query = text.trim()
    // "Sl 94 (95), 1-2": with both numbers, a leaflet names one psalm, and the
    // edition's number for it is what the reference then names.
    const pair = parsePsalmPair(query)
    const pairBook = pair ? this.books.findTypedBook(pair.book) : undefined
    const paired = !!pair && pairBook?.id === PSALMS_BOOK_ID
    const asked =
      pair && paired && pairBook
        ? `${pairBook.abrv} ${pair.psalm}${pair.rest.replace(/^,\s*/, ",")}`
        : query
    const destination = this.references.destinationOf(asked)
    if (!destination) return this.page(query, 1, limit)

    const { book, chapter } = destination
    const verseStart =
      destination.verseStart ?? (paired ? pair?.verse : undefined)
    // Most psalms have another number in the liturgy, and one copied from a
    // leaflet would open a different psalm here. Not guessed: both are offered.
    if (
      book.id === PSALMS_BOOK_ID &&
      !paired &&
      isAmbiguousPsalmNumber(chapter)
    ) {
      return of(this.psalmChoice(book, chapter, verseStart))
    }
    // A standalone introduction has no chapters: nothing to ask for, and its
    // only page is the introduction.
    const isIntro = !!book.introSlug
    const found: SearchOutcome = {
      kind: "destination",
      // An introduction has no chapter 1 to be named after.
      label: isIntro ? book.shortName : passageLabel(book, chapter, verseStart),
      link: [
        "/",
        this.books.getUrlAbrv(book),
        isIntro
          ? BookService.INTRO_URL_SEGMENT
          : this.books.getChapterUrlSegment(chapter),
      ],
      ...(verseStart === undefined ? {} : { queryParams: { verseStart } }),
    }
    if (isIntro) return of(found)

    return this.api.getVerse(book.id, chapter, verseStart ?? 1).pipe(
      map(() => found),
      catchError((error: unknown) =>
        SearchService.isNotThere(error)
          ? of<SearchOutcome>({ kind: "missing" })
          : throwError(() => error),
      ),
    )
  }

  private psalmChoice(
    psalms: Book,
    psalm: number,
    verseStart: number | undefined,
  ): SearchOutcome {
    const liturgical = psalmFromLiturgical(psalm)
    const option = (number: number, note: string, verse?: number) => ({
      label: passageLabel(psalms, number),
      note,
      link: [
        "/",
        this.books.getUrlAbrv(psalms),
        this.books.getChapterUrlSegment(number),
      ],
      ...(verse !== undefined && verse > 1
        ? { queryParams: { verseStart: verse } }
        : {}),
    })
    return {
      kind: "psalmChoice",
      options: [
        option(psalm, "nesta Bíblia", verseStart),
        ...(liturgical
          ? [
              option(
                liturgical.psalm,
                "como na Missa",
                verseStart ?? liturgical.verse,
              ),
            ]
          : []),
      ],
    }
  }

  /**
   * One page of the text search's results. Offline, the server's search by
   * meaning is out of reach, and the words are looked for in the Bible kept on
   * the device instead, as the search page does.
   */
  page(query: string, page: number, limit?: number): Observable<SearchOutcome> {
    if (this.network.isOffline) return this.stored(query, page, limit)
    const request =
      limit === undefined
        ? this.api.search(query, page)
        : this.api.search(query, page, limit)
    return request.pipe(
      // Results name their book by id, and are listed by its name and linked
      // by its URL: both come from the book list, which a search shared into
      // the app (/search?q=…) can outrun. Listed before it arrived, every
      // verse was "Sobre a Bíblia 23,1" and led to the About page.
      switchMap((results) => this.whenBooksKnown().pipe(map(() => results))),
      map((results) => ({
        kind: "results" as const,
        query,
        page,
        total: results.total,
        hits: results.verses.map((verse) => this.toHit(verse, query)),
        engine: "server" as const,
      })),
    )
  }

  /** The words of the query in the stored Bible: its first page, or none. */
  private stored(
    query: string,
    page: number,
    limit?: number,
  ): Observable<SearchOutcome> {
    return from(this.offlineSearch.search(query)).pipe(
      map((matches) =>
        matches === null
          ? { kind: "nothingStored" as const }
          : {
              kind: "results" as const,
              query,
              page,
              total: matches.length,
              // The stored search has every match at once; a page is a slice.
              hits: matches
                .slice(
                  limit === undefined ? 0 : (page - 1) * limit,
                  limit === undefined ? matches.length : page * limit,
                )
                .map((verse) => this.toHit(verse, query)),
              engine: "stored" as const,
            },
      ),
    )
  }

  /**
   * The book list, once there is one. Not for ever: with no list to be had —
   * offline, on a first visit — results are still worth more than nothing,
   * and are listed by their book's id, which the reader also answers to.
   */
  private whenBooksKnown(): Observable<unknown> {
    return this.books.books$.pipe(
      take(1),
      timeout({ first: BOOK_LIST_PATIENCE_MS, with: () => of(null) }),
    )
  }

  private toHit(verse: Verse, query: string): SearchHit {
    const found = this.books.findBook(verse.bookId)
    // findBook answers with the About page for an id it does not know.
    const book =
      found.id.toUpperCase() === verse.bookId.toUpperCase() ? found : undefined
    return {
      ...verse,
      key: `${verse.bookId}:${verse.chapterNumber}:${verse.number}`,
      reference: `${book?.shortName ?? verse.bookId.toUpperCase()} ${verse.chapterNumber},${verse.number}`,
      link: [
        "/",
        book ? this.books.getUrlAbrv(book) : verse.bookId,
        this.books.getChapterUrlSegment(verse.chapterNumber),
      ],
      queryParams: { verseStart: verse.number },
      highlightedSegments: highlightWords(verseText(verse), query),
    }
  }

  /** HttpErrorResponse is not guaranteed here, so the shape is narrowed. */
  private static isNotThere(error: unknown): boolean {
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : undefined
    return status === 404 || status === 400
  }
}
