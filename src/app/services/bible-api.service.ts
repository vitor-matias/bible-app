// biome-ignore lint/style/useImportType: <explanation>
import { HttpClient } from "@angular/common/http"
import { Injectable } from "@angular/core"
import type { Observable } from "rxjs"

@Injectable({
  providedIn: "root",
})
export class BibleApiService {
  api = "v1"

  constructor(private http: HttpClient) {}

  getAvailableBooks(): Observable<Book[]> {
    return this.http.get(`${this.api}/books`) as Observable<Book[]>
  }

  getChapter(book: string, chapter: number): Observable<Chapter> {
    return this.http.get(
      `${this.api}/${book}/${chapter}`,
    ) as Observable<Chapter>
  }

  getBook(book: string): Observable<Book> {
    return this.http.get(`${this.api}/${book}`) as Observable<Book>
  }
}
