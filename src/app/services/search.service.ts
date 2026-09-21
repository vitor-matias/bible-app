import { Injectable, inject } from "@angular/core"
import {
  catchError,
  map,
  type Observable,
  of,
  switchMap,
  take,
  throwError,
  timeout,
} from "rxjs"
import { highlightSegments } from "../utils/text"
import { BibleApiService } from "./bible-api.service"
import { BibleReferenceService } from "./bible-reference.service"
import { BookService } from "./book.service"

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
}

/**
 * What came of a search: somewhere to go, a reference to somewhere that is
 * not there, or verses found.
 */
export type SearchOutcome =
  | {
      kind: "destination"
      link: (string | number)[]
      queryParams?: { verseStart: Verse["number"] }
    }
  | { kind: "missing" }
  | SearchResults

/**
 * The app's search, whichever box it is typed into.
 *
 * There are two — the search page and a tab of the study panel — and they had
 * a copy each, which came apart the way copies do: only one of them knew a
 * reference from words to look for, they linked to the same chapter by two
 * different URLs, and one of them showed a verse of a psalm as no text at all,
 * its copy of "the words of a verse" having left poetry out. What a search
 * means is decided here; what each box does with the answer — a snackbar or
 * a line in a column, a page of results or an endless list — stays with it.
 */
@Injectable({ providedIn: "root" })
export class SearchService {
  private readonly api = inject(BibleApiService)
  private readonly references = inject(BibleReferenceService)
  private readonly books = inject(BookService)

  /**
   * Runs a search. A reference ("Mt 22,37"), or a book by name, is somewhere
   * to go rather than something to look for, and is asked for before it is
   * offered: "Mt 40,1" reads like a reference and leads nowhere. Anything
   * else goes to the text search. Errors other than "not there" are left to
   * the caller, who knows how it tells its reader that a search failed.
   */
  run(text: string, limit?: number): Observable<SearchOutcome> {
    const query = text.trim()
    const destination = this.references.destinationOf(query)
    if (!destination) return this.page(query, 1, limit)

    const { book, chapter, verseStart } = destination
    // A standalone introduction has no chapters: nothing to ask for, and its
    // only page is the introduction.
    const isIntro = !!book.introSlug
    const found: SearchOutcome = {
      kind: "destination",
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

  /** One page of the text search's results. */
  page(query: string, page: number, limit?: number): Observable<SearchResults> {
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
      })),
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
      highlightedSegments: highlightSegments(
        SearchService.wordsOf(verse),
        query,
      ),
    }
  }

  /**
   * The words of a verse as one line: prose, poetry and paragraph openings,
   * without headings or apparatus, and without the zero-width characters the
   * edition uses to hang poetry from.
   */
  static wordsOf(verse: Verse): string {
    return (verse.text ?? [])
      .filter(
        (part) =>
          part.type === "text" ||
          part.type === "quote" ||
          part.type === "paragraph",
      )
      .map((part) => part.text.replace(/[​-‍﻿]/g, ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
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
