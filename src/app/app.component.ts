import { animate, state, style, transition, trigger } from "@angular/animations"
// biome-ignore lint/style/useImportType: <explanation>
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  ViewChild,
  afterRender,
  inject,
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
  @ViewChild("drawer")
  drawer!: MatDrawer

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
        // biome-ignore lint/complexity/useLiteralKeys: <explanation>
        this.bookParam = routes.state.root.firstChild?.params["book"]
        // biome-ignore lint/complexity/useLiteralKeys: <explanation>
        this.chapterParam = routes.state.root.firstChild?.params["chapter"]
      }
    })

    this.getBooks()

    //setTimeout(() => this.openBottomSheet(), 7000)
  }

  goToNextChapter(): void {
    this.getChapter(this.book.id, this.chapterNumber + 1)
  }

  goToPreviousChapter(): void {
    this.getChapter(this.book.id, this.chapterNumber - 1)
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
    this.chapterNumber = 1
    this.book = this.findBook(event.bookId)

    this.getChapter(event.bookId, this.chapterNumber)

    this.drawer.close()
    this.router.navigate([this.book.id, this.chapterNumber])
  }

  findBook(bookId: Book["id"]): Book {
    return this.books.find((book) => book.id === bookId) || this.getAboutBook()
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

        const storedBook =
          this.bookParam || localStorage.getItem("book") || "about"
        const storedChapter =
          this.chapterParam || localStorage.getItem("chapter") || "1"

        if (storedBook && storedChapter) {
          this.book =
            this.books.find((book) => book.id === storedBook) || ({} as Book)
          this.chapterNumber = Number.parseInt(storedChapter, 10)
          this.getChapter(storedBook, this.chapterNumber)
        }
      },
      error: (err) => console.error(err),
    })
  }

  getChapter(book: Book["id"], chapter: Chapter["number"]) {
    this.chapterNumber = chapter
    this.router.navigate([this.book.id, this.chapterNumber])

    this.apiService.getChapter(book, chapter).subscribe({
      next: (res) => {
        this.chapter = res

        this.cdr.detectChanges()

        this.scrollToTop()

        localStorage.setItem("book", this.book.id)
        localStorage.setItem("chapter", this.chapterNumber.toString())
      },
      error: (err) => console.error(err),
    })
  }

  scrollToTop() {
    setTimeout(() => {
      this.container._content.scrollTo({ top: 0, behavior: "smooth" })
    }, 0)
  }

  openDrawer(event: { open: boolean }) {
    this.drawer.open()
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
}
