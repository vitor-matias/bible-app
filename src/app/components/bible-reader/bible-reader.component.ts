import { animate, state, style, transition, trigger } from "@angular/animations"
// biome-ignore lint/style/useImportType: <explanation>
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  Input,
  ViewChild,
} from "@angular/core"

import {
  type MatDrawer,
  type MatDrawerContainer,
  MatSidenavModule,
} from "@angular/material/sidenav"

import { CommonModule } from "@angular/common"
import { MatBottomSheetModule } from "@angular/material/bottom-sheet"
import { MatButtonModule, MatIconButton } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
// biome-ignore lint/style/useImportType: <explanation>
import { Router, RouterOutlet, RoutesRecognized } from "@angular/router"
import { NgbPaginationModule } from "@ng-bootstrap/ng-bootstrap"
import { UnifiedGesturesDirective } from "../../directives/unified-gesture.directive"
// biome-ignore lint/style/useImportType: <explanation>
import { BibleApiService } from "../../services/bible-api.service"
import { AboutComponent } from "../about/about.component"
import { BookSelectorComponent } from "../book-selector/book-selector.component"
import { ChapterSelectorComponent } from "../chapter-selector/chapter-selector.component"
import { HeaderComponent } from "../header/header.component"
import { SearchComponent } from "../search/search.component"
import { VerseComponent } from "../verse/verse.component"

// biome-ignore lint/style/useImportType: <explanation>
import { ActivatedRoute } from "@angular/router"
import type { Subscription } from "rxjs"
import { combineLatest } from "rxjs"

const slideInLeft = [
  style({ transform: "translateX(100%)" }),
  animate("3009ms ease-out", style({ transform: "translateX(0%)" })),
]

const slideInRight = [
  style({ transform: "translateX(-100%)" }),
  animate("3000ms ease-out", style({ transform: "translateX(0%)" })),
]

@Component({
  selector: "bible-reader",
  templateUrl: "./bible-reader.component.html",
  styleUrl: "./bible-reader.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    CommonModule,
    VerseComponent,
    HeaderComponent,
    BookSelectorComponent,
    MatSidenavModule,
    NgbPaginationModule,
    MatBottomSheetModule,
    AboutComponent,
    ChapterSelectorComponent,
    MatIconModule,
    MatButtonModule,
    UnifiedGesturesDirective,
  ],
})
export class BibleReaderComponent {
  @ViewChild("bookDrawer")
  bookDrawer!: MatDrawer

  @ViewChild("chapterDrawer")
  chapterDrawer!: MatDrawer

  @ViewChild("container")
  container!: MatDrawerContainer

  private routeSub: Subscription | undefined

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
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.apiService.getAvailableBooks().subscribe((books) => {
      this.books = books

      this.books.push(this.getAboutBook())

      this.bookParam =
        this.router.routerState.snapshot.root.firstChild?.params[
          // biome-ignore lint/complexity/useLiteralKeys: <explanation>
          "book"
        ]?.toLowerCase()
      this.chapterParam =
        // biome-ignore lint/complexity/useLiteralKeys: <explanation>
        this.router.routerState.snapshot.root.firstChild?.params["chapter"]

      const verseParam =
        // biome-ignore lint/complexity/useLiteralKeys: <explanation>
        this.router.routerState.snapshot.root.firstChild?.queryParams["verse"]

      const storedBook =
        this.bookParam || localStorage.getItem("book") || "about"
      const storedChapter =
        this.chapterParam || localStorage.getItem("chapter") || "1"

      if (storedBook && storedChapter) {
        this.book = this.findBook(storedBook)

        this.chapterNumber = Number.parseInt(storedChapter, 10)
        this.router.navigate(
          [this.getUrlAbrv(this.book), this.chapterNumber],
          { queryParams: verseParam ? { verse: verseParam } : {}, replaceUrl: true }
        )
        this.getChapter(this.chapterNumber, verseParam)

      }

      this.routeSub = combineLatest([
        this.route.paramMap,
        this.route.queryParamMap,
      ]).subscribe(([params, queryParams]) => {
        const bookParam = params.get("book") || "about"
        const chapterParam = Number.parseInt(params.get("chapter") || "1", 10)
        const verseParam = queryParams.get("verse")
          ? Number.parseInt(queryParams.get("verse") || "1", 10)
          : undefined

        //if it is the same book and same chapter do nothing
        if (this.book.id === bookParam && this.chapterNumber === chapterParam)
          return

        this.book = this.findBook(bookParam)
        this.chapterNumber = chapterParam
        this.getChapter(this.chapterNumber, verseParam)
        this.cdr.detectChanges()
      })
    })
  }

  goToNextChapter(): void {
    if (this.book.chapterCount >= this.chapterNumber + 1) {
      this.router.navigate([this.getUrlAbrv(this.book), this.chapterNumber + 1])
    }
  }

  goToPreviousChapter(): void {
    if (this.chapterNumber > 1) {
      this.router.navigate([this.getUrlAbrv(this.book), this.chapterNumber - 1])
    }
  }

  goToChapter(newChapterNumber: Chapter["number"]): void {
    this.router.navigate([this.getUrlAbrv(this.book), newChapterNumber])
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
      this.books[0]
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

  getChapter(chapter: Chapter["number"], verse?: Verse["number"]) {

    this.apiService.getChapter(this.book.id, chapter).subscribe({
      next: (res) => {
        this.chapter = res
        this.chapterNumber = chapter


        this.cdr.detectChanges()

        if (!verse) {
          this.scrollToTop()
        } else {
          this.scrollToVerseElement(verse)
        }

        localStorage.setItem("book", this.book.id)
        localStorage.setItem("chapter", this.chapterNumber.toString())

      },
      error: (err) => {
        if (this.book.id === "about") {
          this.chapter = { bookId: "about", number: 1 }
          this.chapterNumber = chapter

          this.cdr.detectChanges()
          if (!verse) {
            this.scrollToTop()
          } else {
            this.scrollToVerseElement(verse)
          }

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

  scrollToVerseElement(verse: number) {
    setTimeout(() => {
      const element = document.getElementById(`${verse}`)
      if (element) {
        element?.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        })
        element.style.transition = "background-color 0.5s ease"
        element.style.backgroundColor = "antiquewhite"
        setTimeout(() => {
          element.style.backgroundColor = ""
        }, 2500)
      }
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
