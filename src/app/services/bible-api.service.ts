// biome-ignore lint/style/useImportType: <explanation>
import { HttpClient } from "@angular/common/http"
import { Injectable, Injector } from "@angular/core"
import {
  catchError,
  finalize,
  from,
  type Observable,
  of,
  shareReplay,
  switchMap,
  throwError,
} from "rxjs"
import { OfflineDataService } from "./offline-data.service"

@Injectable({
  providedIn: "root",
})
export class BibleApiService {
  api = "v1"
  private chapterPromise: Promise<Observable<Chapter>> | null = null

  private books$: Observable<Book[]> | null = null;
  books: Book[] = [];

  constructor(
    private http: HttpClient,
    private injector: Injector,
  ) {}

  private offlineDataService: OfflineDataService | null = null

  private getOfflineDataService(): OfflineDataService {
    if (!this.offlineDataService) {
      this.offlineDataService = this.injector.get(OfflineDataService)
    }
    return this.offlineDataService
  }

  getAvailableBooks(): Observable<Book[]> {
    const cachedBooks = this.getOfflineDataService().getCachedBooks()
    if (cachedBooks.length) {
      this.books = cachedBooks;
      return of(cachedBooks);
    }
    if (this.books.length) {
      return of(this.books);
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return of(cachedBooks)
    }
    if (!this.books$) {
      this.books$ = (this.http.get(`${this.api}/books`) as Observable<Book[]>).pipe(
        shareReplay(1)
      );
      this.books$.subscribe({
        next: (books) => {
          this.books = books;
          //this.getOfflineDataService().setCachedBooks(books)
        },
        error: () => {
          this.books$ = null;
        }
      });
    }
    return this.books$;
  }

  getChapter(book: string, chapter: number): Observable<Chapter> {
    const cached = this.getOfflineDataService().getCachedChapter(book, chapter)
    if (cached) {
      return of(cached)
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return throwError(() => new Error("Offline - chapter not cached"))
    }

    if (this.chapterPromise) {
      return from(this.chapterPromise).pipe(switchMap((obs) => obs))
    }

    this.chapterPromise = new Promise((resolve, reject) => {
      const observable = this.http.get(
        `${this.api}/${book}/${chapter}`,
      ) as Observable<Chapter>
      observable
        .pipe(
          catchError((error) => {
            this.chapterPromise = null
            reject(error)
            throw error
          }),
          finalize(() => {
            this.chapterPromise = null
          }),
        )
        .subscribe({
          next: (data) => resolve(of(data)),
          error: (err) => reject(err),
        })
    })

    return from(this.chapterPromise).pipe(switchMap((obs) => obs))
  }

  getBook(book: string): Observable<Book> {
    const cached = this.getOfflineDataService().getCachedBook(book)
    if (cached) {
      return of(cached)
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return throwError(() => new Error("Offline - book not cached"))
    }
    return this.http.get(`${this.api}/${book}`) as Observable<Book>
  }

  search(query: string, page = 1, limit = 50): Observable<VersePage> {
    return this.http.get(
      `${this.api}/search?text=${encodeURIComponent(query)}&page=${page}&limit=${limit}&semantic=true`,
    ) as Observable<VersePage>
  }

  getVerse(book: string, chapter: number, verse: number): Observable<Verse> {
    const cached = this.getOfflineDataService().getCachedVerse(book, chapter, verse)
    if (cached) {
      return of(cached)
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return throwError(() => new Error("Offline - verse not cached"))
    }
    return this.http.get(
      `${this.api}/${book}/${chapter}/${verse}`,
    ) as Observable<Verse>
  }

  getAllBooksAndChapters(): Observable<Book[]> {
    return this.http.get(
      `${this.api}/books?withChapters=true`,
    ) as Observable<Book[]>
  }
}
