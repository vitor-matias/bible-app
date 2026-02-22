import { Injectable } from "@angular/core"
import { BehaviorSubject, Observable } from "rxjs"

@Injectable({
  providedIn: "root",
})
export class ReaderStateService {
  private bookSubject = new BehaviorSubject<Book | null>(null)
  private chapterNumberSubject = new BehaviorSubject<number>(1)
  private chapterSubject = new BehaviorSubject<Chapter | null>(null)

  private viewModeSubject = new BehaviorSubject<"scrolling" | "paged">(
    "scrolling",
  )
  private showAutoScrollControlsSubject = new BehaviorSubject<boolean>(false)

  // Expose observables
  book$: Observable<Book | null> = this.bookSubject.asObservable()
  chapterNumber$: Observable<number> = this.chapterNumberSubject.asObservable()
  chapter$: Observable<Chapter | null> = this.chapterSubject.asObservable()
  viewMode$: Observable<"scrolling" | "paged"> =
    this.viewModeSubject.asObservable()
  showAutoScrollControls$: Observable<boolean> =
    this.showAutoScrollControlsSubject.asObservable()

  // Getters for synchronous access
  get book(): Book | null {
    return this.bookSubject.value
  }
  get chapterNumber(): number {
    return this.chapterNumberSubject.value
  }
  get chapter(): Chapter | null {
    return this.chapterSubject.value
  }
  get viewMode(): "scrolling" | "paged" {
    return this.viewModeSubject.value
  }
  get showAutoScrollControls(): boolean {
    return this.showAutoScrollControlsSubject.value
  }

  // Setters
  setBook(book: Book) {
    this.bookSubject.next(book)
  }

  setChapterNumber(num: number) {
    this.chapterNumberSubject.next(num)
  }

  setChapter(chapter: Chapter) {
    this.chapterSubject.next(chapter)
  }

  setViewMode(mode: "scrolling" | "paged") {
    this.viewModeSubject.next(mode)
  }

  setShowAutoScrollControls(show: boolean) {
    this.showAutoScrollControlsSubject.next(show)
  }
}
