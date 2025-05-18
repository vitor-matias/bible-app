import { animate, state, style, transition, trigger } from "@angular/animations"
// biome-ignore lint/style/useImportType: <explanation>
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  ViewChild,
  
} from "@angular/core"

import type { MatDrawer, MatDrawerContainer } from "@angular/material/sidenav"

// biome-ignore lint/style/useImportType: <explanation>
import { Router, RoutesRecognized } from "@angular/router"
// biome-ignore lint/style/useImportType: <explanation>
import { BibleApiService } from "./services/bible-api.service"

const slideInLeft = [
  style({ transform: "translateX(100%)" }),
  animate("3009ms ease-out", style({ transform: "translateX(0%)" })),
]

const slideInRight = [
  style({ transform: "translateX(-100%)" }),
  animate("3000ms ease-out", style({ transform: "translateX(0%)" })),
]

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",

  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  @ViewChild("bookDrawer")
  bookDrawer!: MatDrawer

  @ViewChild("chapterDrawer")
  chapterDrawer!: MatDrawer

  @ViewChild("container")
  container!: MatDrawerContainer

  //private _bottomSheet = inject(MatBottomSheet)

  book!: Book
  books!: Book[]
  chapterNumber = 1
  chapter!: Chapter
  scrolled!: boolean
  bookParam: string | null = null
  chapterParam: string | null = null

  constructor(
    private apiService: BibleApiService,
    private cdr: ChangeDetectorRef,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.router.events.subscribe((routes) => {
      if (routes instanceof RoutesRecognized) {
        if (this.books) {
          // biome-ignore lint/complexity/useLiteralKeys: <explanation>
          this.bookParam = routes.state.root.firstChild?.params["book"]
          // biome-ignore lint/complexity/useLiteralKeys: <explanation>
          this.chapterParam = routes.state.root.firstChild?.params["chapter"]
          if (this.bookParam && this.chapterParam) {
            this.book = this.findBook(this.bookParam)
            this.chapterNumber = Number(this.chapterParam)
            this.getChapter(Number(this.chapterParam))
          }
        }
      }
    })

    this.getBooks()

    //setTimeout(() => this.openBottomSheet(), 7000)
  }

  goToNextChapter(): void {
    this.router.navigate([this.getUrlAbrv(this.book), this.chapterNumber + 1])
  }

  goToPreviousChapter(): void {
    this.router.navigate([this.getUrlAbrv(this.book), this.chapterNumber - 1])
  }

  goToChapter(newChapterNumber: Chapter["number"]): void {
    this.router.navigate([this.getUrlAbrv(this.book), newChapterNumber])
  }

  openBottomSheet(): void {
    //this._bottomSheet.open(ChapterPagination)
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

  onBookSubmit(event: { bookId: string }) {
    this.book = this.findBook(event.bookId)

    this.goToChapter(1)

    this.bookDrawer.close()
  }

  onChapterSubmit(event: { chapterNumber: number }) {
    this.goToChapter(event.chapterNumber)

    this.chapterDrawer.close()
  }

  findBookById(bookId: Book["id"]): Book | undefined {
    return this.books.find((book) => book.id === bookId)
  }

  findBookByUrlAbrv(bookAbrv: Book["abrv"]): Book | undefined {
    return this.books.find((book) => this.getUrlAbrv(book) === bookAbrv)
  }

  findBook(bookId: Book["id"] | Book["abrv"]): Book {
    return (
      this.findBookById(bookId) ||
      this.findBookByUrlAbrv(bookId) ||
      this.getAboutBook()
    )
  }

  getBook(book: string) {
    this.apiService.getBook(book).subscribe({
      next: (res) => {
        this.book = res
      },
      error: (err) => console.error(err),
    })
  }

  getBooks() {
    this.apiService.getAvailableBooks().subscribe({
      next: (res) => {
        this.books = res
        this.books.push(this.getAboutBook())

        this.bookParam =
          this.router.routerState.snapshot.root.firstChild?.params[
            // biome-ignore lint/complexity/useLiteralKeys: <explanation>
            "book"
          ]?.toLowerCase()
        this.chapterParam =
          // biome-ignore lint/complexity/useLiteralKeys: <explanation>
          this.router.routerState.snapshot.root.firstChild?.params["chapter"]

        const storedBook =
          this.bookParam || localStorage.getItem("book") || "about"
        const storedChapter =
          this.chapterParam || localStorage.getItem("chapter") || "1"

        if (storedBook && storedChapter) {
          this.book = this.findBook(storedBook)

          this.chapterNumber = Number.parseInt(storedChapter, 10)
          this.getChapter(this.chapterNumber)
        }
      },
      error: (err) => console.error(err),
    })
  }

  getChapter(chapter: Chapter["number"]) {
    this.apiService.getChapter(this.book.id, chapter).subscribe({
      next: (res) => {
        this.chapter = res
        this.chapterNumber = chapter
        this.router.navigate([this.getUrlAbrv(this.book), this.chapterNumber])

        this.cdr.detectChanges()

        this.scrollToTop()

        localStorage.setItem("book", this.book.id)
        localStorage.setItem("chapter", this.chapterNumber.toString())
      },
      error: (err) => {
        if (this.book.id === "about") {
          this.chapter = { bookId: "about", number: 1 }
          this.chapterNumber = chapter
          this.router.navigate([this.getUrlAbrv(this.book), this.chapterNumber])
          this.cdr.detectChanges()

          this.scrollToTop()

          localStorage.setItem("book", this.book.id)
          localStorage.setItem("chapter", this.chapterNumber.toString())
        }
        console.error(err)
      },
    })
  }

  scrollToTop() {
    setTimeout(() => {
      this.container._content.scrollTo({ top: 0, behavior: "smooth" })
    }, 0)
  }

  openBookDrawer(event: { open: boolean }) {
    this.chapterDrawer.close()
    this.bookDrawer.toggle()
  }

  openChapterDrawer(event: { open: boolean }) {
    this.bookDrawer.close()
    this.chapterDrawer.toggle()
  }

  @HostListener("window:scroll", ["$event"])
  onWindowScroll(event: Event): void {
    const position = (event.target as HTMLElement).scrollTop
    const scrollHeight = (event.target as HTMLElement).scrollHeight
    const offsetHeight = (event.target as HTMLElement).offsetHeight

    this.scrolled =
      position >= (this.scrolled ? 128 : 168) &&
      scrollHeight - offsetHeight - (this.scrolled ? 128 : 168) > position

    this.cdr.detectChanges()
  }

  @HostListener("window:keydown", ["$event"])
  onArrowPress(event: KeyboardEvent): void {
    if (event.key === "ArrowLeft") {
      this.goToPreviousChapter()
    }
    if (event.key === "ArrowRight") {
      this.goToNextChapter()
    }
  }

  getUrlAbrv(book: Book): string {
    return book.abrv.replace(/\s/g, "").toLowerCase()
  }
}
