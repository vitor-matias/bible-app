// biome-ignore lint/style/useImportType: <explanation>
import { HttpClient } from "@angular/common/http"
import { Injectable } from "@angular/core"
import {
  type Observable,
  catchError,
  finalize,
  from,
  of,
  switchMap,
} from "rxjs"

@Injectable({
  providedIn: "root",
})
export class BibleApiService {
  api = "v1"
  private chapterPromise: Promise<Observable<Chapter>> | null = null

  constructor(private http: HttpClient) {}

  getAvailableBooks(): Observable<Book[]> {
    return this.http.get(`${this.api}/books`) as Observable<Book[]>
  }

  getChapter(book: string, chapter: number): Observable<Chapter> {
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
    return this.http.get(`${this.api}/${book}`) as Observable<Book>
  }
}
