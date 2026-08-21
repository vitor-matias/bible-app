import { HttpClient } from "@angular/common/http"
import { Injectable } from "@angular/core"
import {
  catchError,
  finalize,
  from,
  type MonoTypeOperatorFunction,
  type Observable,
  of,
  retry,
  shareReplay,
  switchMap,
  tap,
  throwError,
  timeout,
  timer,
} from "rxjs"
import { apiBaseUrl } from "../config"
import { NetworkService } from "./network.service"
import { OfflineDataService } from "./offline-data.service"

const IS_SERVER = typeof window === "undefined"

// While prerendering, every page boots a fresh app in the same worker process;
// module state survives between renders, so one worker fetches the book list
// once instead of ~1200 times (which invites API rate limiting).
let serverBooksCache: Book[] | null = null

/**
 * Server-only request hardening for prerendering: a bounded timeout (a
 * connection that never completes must not hang the build) plus retry with
 * backoff (transient rate limiting must not fail the build or ship empty
 * pages). In the browser the source observable is passed through untouched.
 * Exported for tests via createApiResilience; production code uses the
 * IS_SERVER-bound wrapper below.
 */
export function createApiResilience<T>(
  isServer: boolean,
  timeoutMs = 20_000,
  retryCount = 3,
  retryBaseDelayMs = 300,
): MonoTypeOperatorFunction<T> {
  if (!isServer) {
    return (source) => source
  }
  return (source) =>
    source.pipe(
      timeout(timeoutMs),
      retry({
        count: retryCount,
        delay: (_error, attempt) => timer(retryBaseDelayMs * 2 ** attempt),
      }),
    )
}

function serverRetry<T>() {
  return createApiResilience<T>(IS_SERVER)
}

@Injectable({
  providedIn: "root",
})
export class BibleApiService {
  api = apiBaseUrl
  // Track in-flight chapter requests by book+chapter so concurrent navigation
  // shares the same fetch without leaking the result across different chapters.
  private readonly chapterRequests = new Map<string, Observable<Chapter>>()

  // Keep a shared books request alive long enough for all early subscribers to reuse it.
  private booksRequest$: Observable<Book[]> | null = null
  books: Book[] = []

  constructor(
    private http: HttpClient,
    private offlineDataService: OfflineDataService,
    private networkService: NetworkService,
  ) {}

  getAvailableBooks(): Observable<Book[]> {
    return from(this.offlineDataService.getCachedBooksAsync()).pipe(
      switchMap((cachedBooks) => {
        if (cachedBooks.length) {
          this.books = cachedBooks
          return of(cachedBooks)
        }
        if (this.books.length) {
          return of(this.books)
        }
        if (IS_SERVER && serverBooksCache) {
          this.books = serverBooksCache
          return of(serverBooksCache)
        }
        if (this.networkService.isOffline) {
          return throwError(
            () => new Error("Offline and no cached books available"),
          )
        }
        if (!this.booksRequest$) {
          // shareReplay(1) deduplicates the initial books fetch during app bootstrap.
          this.booksRequest$ = (
            this.http.get(`${this.api}/books`) as Observable<Book[]>
          ).pipe(
            serverRetry(),
            tap((books) => {
              this.books = books
              if (IS_SERVER) {
                serverBooksCache = books
              }
            }),
            catchError((error) => {
              this.booksRequest$ = null
              return throwError(() => error)
            }),
            shareReplay(1),
          )
        }
        return this.booksRequest$
      }),
    )
  }

  getChapter(book: string, chapter: number): Observable<Chapter> {
    return from(
      this.offlineDataService.getCachedChapterAsync(book, chapter),
    ).pipe(
      switchMap((cached) => {
        if (cached?.verses && cached.verses.length > 0) {
          return of(cached)
        }

        if (this.networkService.isOffline) {
          return throwError(() => new Error("Offline - chapter not cached"))
        }

        const requestKey = `${book}:${chapter}`
        const existingRequest = this.chapterRequests.get(requestKey)
        if (existingRequest) {
          return existingRequest
        }

        // Cache the observable itself so repeated requests for the same chapter
        // share one HTTP call and still complete independently from other chapters.
        const request = (
          this.http.get(`${this.api}/${book}/${chapter}`) as Observable<Chapter>
        ).pipe(
          serverRetry(),
          finalize(() => {
            this.chapterRequests.delete(requestKey)
          }),
          shareReplay({ bufferSize: 1, refCount: true }),
        )

        this.chapterRequests.set(requestKey, request)
        return request
      }),
    )
  }

  getBook(book: string): Observable<Book> {
    return from(this.offlineDataService.getCachedBookAsync(book)).pipe(
      switchMap((cached) => {
        if (cached) {
          return of(cached)
        }
        if (this.networkService.isOffline) {
          return throwError(() => new Error("Offline - book not cached"))
        }
        return this.http.get(`${this.api}/${book}`) as Observable<Book>
      }),
    )
  }

  search(query: string, page = 1, limit = 50): Observable<VersePage> {
    return this.http.get(
      `${this.api}/search?text=${encodeURIComponent(query)}&page=${page}&limit=${limit}&semantic=true`,
    ) as Observable<VersePage>
  }

  getVerse(book: string, chapter: number, verse: number): Observable<Verse> {
    return from(
      this.offlineDataService.getCachedVerseAsync(book, chapter, verse),
    ).pipe(
      switchMap((cached) => {
        if (cached?.text && cached?.text?.length > 0) {
          return of(cached)
        }
        if (this.networkService.isOffline) {
          return throwError(() => new Error("Offline - verse not cached"))
        }
        return this.http.get(
          `${this.api}/${book}/${chapter}/${verse}`,
        ) as Observable<Verse>
      }),
    )
  }
}
