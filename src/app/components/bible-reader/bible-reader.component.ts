import { animate, state, style, transition, trigger } from "@angular/animations"
import { CommonModule } from "@angular/common"
// biome-ignore lint/style/useImportType: <explanation>
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
} from "@angular/core"
import { MatBottomSheetModule } from "@angular/material/bottom-sheet"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { MatDialog, MatDialogModule } from "@angular/material/dialog"
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar"
import {
  type MatDrawer,
  type MatDrawerContainer,
  MatSidenavModule,
} from "@angular/material/sidenav"
// biome-ignore lint/style/useImportType: <explanation>
// biome-ignore lint/style/useImportType: <explanation>
import { ActivatedRoute, Router } from "@angular/router"
import type { Subscription } from "rxjs"
import { combineLatest } from "rxjs"
import { UnifiedGesturesDirective } from "../../directives/unified-gesture.directive"
// biome-ignore lint/style/useImportType: <explanation>
import { BibleApiService } from "../../services/bible-api.service"
import { BookService } from "../../services/book.service"
import { AboutComponent } from "../about/about.component"
import { BookSelectorComponent } from "../book-selector/book-selector.component"
import { ChapterSelectorComponent } from "../chapter-selector/chapter-selector.component"
import { HeaderComponent } from "../header/header.component"
import { NoteDialogComponent } from "../note-dialog/note-dialog.component"
import { VerseComponent } from "../verse/verse.component"

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
    MatBottomSheetModule,
    AboutComponent,
    ChapterSelectorComponent,
    MatIconModule,
    MatButtonModule,
    MatDialogModule,
    MatSnackBarModule,
    UnifiedGesturesDirective,
  ],
})
export class BibleReaderComponent implements OnInit {
  private readonly highlightsStorageKey = "bibleHighlights"
  private readonly notesStorageKey = "bibleNotes"

  @ViewChild("bookDrawer")
  bookDrawer!: MatDrawer

  @ViewChild("container")
  container!: MatDrawerContainer

  @ViewChild("bookDrawerCloseButton") bookDrawerCloseButton!: ElementRef
  @ViewChild("chapterDrawerCloseButton") chapterDrawerCloseButton!: ElementRef
  @ViewChild("readerContent") readerContent!: ElementRef<HTMLElement>

  private routeSub: Subscription | undefined

  book!: Book
  chapterNumber = 1
  chapter!: Chapter
  scrolled!: boolean
  bookParam: string | null = null
  chapterParam: string | null = null
  showBooks = true
  selectionMenuVisible = false
  selectionMenuPosition = { x: 0, y: 0 }
  selectionMenuPlacement: "top" | "bottom" = "top"
  selectedText = ""
  selectedVerseRange: { start: number; end: number } | null = null
  selectedVerseIds: number[] = []
  selectionHasHighlight = false
  shareAvailable = false
  private selectionRange: Range | null = null
  private selectionUpdateId: number | undefined

  constructor(
    private readonly apiService: BibleApiService,
    private readonly bookService: BookService,
    private readonly cdr: ChangeDetectorRef,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly dialog: MatDialog,
    private readonly snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.shareAvailable = typeof navigator !== "undefined" && "share" in navigator
    this.bookService.books$.subscribe((_books) => {
      if (_books.length === 0)
        alert("No books available. Please check your API connection.")
      this.bookParam =
        this.router.routerState.snapshot.root.firstChild?.params[
          "book"
        ]?.toLowerCase()
      this.chapterParam =
        this.router.routerState.snapshot.root.firstChild?.params["chapter"]

      const verseStartParam =
        this.router.routerState.snapshot.root.firstChild?.queryParams[
          "verseStart"
        ]
      const verseEndParam =
        this.router.routerState.snapshot.root.firstChild?.queryParams[
          "verseEnd"
        ]

      const storedBook =
        this.bookParam || localStorage.getItem("book") || "about"
      const storedChapter =
        this.chapterParam || localStorage.getItem("chapter") || "1"

      if (storedBook && storedChapter) {
        this.book = this.bookService.findBook(storedBook)

        this.chapterNumber = Number.parseInt(storedChapter, 10)
        this.router.navigate(
          [this.bookService.getUrlAbrv(this.book), this.chapterNumber],
          {
            queryParams: verseStartParam
              ? { verseStart: verseStartParam, verseEnd: verseEndParam }
              : {},
            replaceUrl: true,
          },
        )
        this.getChapter(this.chapterNumber, verseStartParam, verseEndParam)
      }

      this.routeSub = combineLatest([
        this.route.paramMap,
        this.route.queryParamMap,
      ]).subscribe(([params, queryParams]) => {
        const bookParam = params.get("book") || "about"
        const chapterParam = Number.parseInt(params.get("chapter") || "1", 10)
        const verseStartParam = queryParams.get("verseStart")
          ? Number.parseInt(queryParams.get("verseStart") || "1", 10)
          : undefined
        const verseEndParam = queryParams.get("verseEnd")
          ? Number.parseInt(queryParams.get("verseEnd") || "1", 10)
          : undefined

        const highlight =
          queryParams.get("highlight") === null
            ? true
            : queryParams.get("highlight") === "true"

        const tempBook = this.bookService.findBook(bookParam)

        if (
          this.book.id === tempBook.id &&
          this.chapterNumber === chapterParam
        ) {
          this.scrollToVerseElement(
            verseStartParam || 1,
            verseEndParam,
            highlight,
          )
          return
        }

        this.book = tempBook
        this.getChapter(chapterParam, verseStartParam, verseEndParam, highlight)
      })
    })
  }

  goToNextChapter(): void {
    if (this.book.chapterCount >= this.chapterNumber + 1) {
      this.router.navigate([
        this.bookService.getUrlAbrv(this.book),
        this.chapterNumber + 1,
      ])
    }
  }

  goToPreviousChapter(): void {
    if (this.chapterNumber > 1) {
      this.router.navigate([
        this.bookService.getUrlAbrv(this.book),
        this.chapterNumber - 1,
      ])
    }
  }

  goToChapter(newChapterNumber: Chapter["number"]): void {
    this.router.navigate([
      this.bookService.getUrlAbrv(this.book),
      newChapterNumber,
    ])
  }

  onBookSubmit(event: { bookId: string }) {
    const book = this.bookService.findBook(event.bookId)
    this.router.navigate(["/", this.bookService.getUrlAbrv(book), 1])

    this.bookDrawer.close()
  }

  onChapterSubmit(event: { chapterNumber: number }) {
    this.goToChapter(event.chapterNumber)

    this.bookDrawer.close()
  }

  getBook(book: string) {
    this.apiService.getBook(book).subscribe({
      next: (res) => {
        this.book = res
      },
      error: (err) => console.error(err),
    })
  }

  getChapter(
    chapter: Chapter["number"],
    verseStart?: Verse["number"],
    verseEnd?: Verse["number"],
    highlight = true,
  ) {
    this.apiService.getChapter(this.book.id, chapter).subscribe({
      next: (res) => {
        this.chapter = res
        this.chapterNumber = chapter

        this.cdr.detectChanges()
        this.applyStoredHighlights()

        if (verseStart) {
          this.scrollToVerseElement(verseStart, verseEnd, highlight)
        } else {
          this.scrollToTop()
        }

        localStorage.setItem("book", this.book.id)
        localStorage.setItem("chapter", this.chapterNumber.toString())
      },
      error: (err) => {
        if (this.book.id === "about") {
          this.chapter = { bookId: "about", number: 1 }
          this.chapterNumber = chapter

          this.cdr.detectChanges()
          this.applyStoredHighlights()
          if (!verseStart) {
            this.scrollToTop()
          } else {
            this.scrollToVerseElement(verseStart, verseEnd, highlight)
          }

          localStorage.setItem("book", this.book.id)
          localStorage.setItem("chapter", this.chapterNumber.toString())
        } else {
          this.router.navigate(["/", this.bookService.getUrlAbrv(this.book), 1])
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

  scrollToVerseElement(
    verseStart: number,
    verseEnd?: number,
    highlight = true,
  ) {
    setTimeout(() => {
      let scrolled = false
      for (let i = verseStart; i <= (verseEnd || verseStart); i++) {
        const element = document.getElementById(`${i}`)
        if (element) {
          if (!scrolled) {
            element.scrollIntoView({
              behavior: "smooth",
              block: "center",
              inline: "nearest",
            })
            scrolled = true
          }
          if (highlight) {
            element.style.transition = "background-color 0.5s ease"
            element.style.backgroundColor = "var(--highlight-color)"
            setTimeout(() => {
              element.style.backgroundColor = ""
            }, 2500)
          }
        }
      }
    }, 0)
  }

  openBookDrawer(event: { open: boolean }) {
    if (this.showBooks) {
      this.bookDrawer.toggle().finally(() => {
        const closeButton = document.querySelector(
          ".bookSelector .dismiss-button",
        ) as HTMLElement
        if (closeButton) {
          closeButton.blur()
        }
      })
    } else {
      this.bookDrawer.close().finally(() => {
        this.showBooks = true
        this.bookDrawer.toggle().finally(() => {
          const closeButton = document.querySelector(
            ".bookSelector .dismiss-button",
          ) as HTMLElement
          if (closeButton) {
            closeButton.blur()
          }
        })
      })
    }
  }

  openChapterDrawer(event: { open: boolean }) {
    if (this.showBooks) {
      this.bookDrawer.close().finally(() => {
        this.showBooks = false
        this.bookDrawer.toggle().finally(() => {
          const closeButton = document.querySelector(
            ".bookSelector .dismiss-button",
          ) as HTMLElement
          if (closeButton) {
            closeButton.blur()
          }
        })
      })
    } else {
      this.bookDrawer.toggle().finally(() => {
        const closeButton = document.querySelector(
          ".bookSelector .dismiss-button",
        ) as HTMLElement
        if (closeButton) {
          closeButton.blur()
        }
      })
    }
  }

  dismissBookDrawer(): void {
    this.bookDrawer.close()
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

  @HostListener("document:selectionchange")
  onSelectionChange(): void {
    this.scheduleSelectionUpdate()
  }

  @HostListener("document:mouseup")
  @HostListener("document:touchend")
  onSelectionEnd(): void {
    this.scheduleSelectionUpdate()
  }

  scheduleSelectionUpdate(): void {
    if (this.selectionUpdateId) {
      globalThis.clearTimeout(this.selectionUpdateId)
    }
    this.selectionUpdateId = window.setTimeout(() => {
      this.updateSelectionMenu()
    }, 0)
  }

  updateSelectionMenu(): void {
    const selection = globalThis.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      this.dismissSelectionMenu()
      return
    }

    const range = selection.getRangeAt(0)
    if (
      !this.readerContent?.nativeElement.contains(
        range.commonAncestorContainer,
      )
    ) {
      this.dismissSelectionMenu()
      return
    }

    const text = selection.toString().trim()
    if (!text) {
      this.dismissSelectionMenu()
      return
    }

    const rect = range.getBoundingClientRect()
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      this.dismissSelectionMenu()
      return
    }

    const verseIds = this.getSelectedVerseIds(range)
    if (!verseIds.length) {
      this.dismissSelectionMenu()
      return
    }

    this.selectedText = text
    this.selectedVerseIds = verseIds
    this.selectedVerseRange = this.getVerseRangeFromIds(verseIds)
    this.selectionHasHighlight = this.idsHaveHighlight(verseIds)
    this.selectionRange = range.cloneRange()
    this.selectionMenuPlacement = rect.top < 56 ? "bottom" : "top"
    this.selectionMenuPosition = {
      x: rect.left + rect.width / 2,
      y: this.selectionMenuPlacement === "top" ? rect.top - 8 : rect.bottom + 8,
    }
    this.selectionMenuVisible = true
  }

  dismissSelectionMenu(): void {
    this.selectionMenuVisible = false
    this.selectedVerseRange = null
    this.selectedVerseIds = []
    this.selectionHasHighlight = false
    this.selectionRange = null
  }

  private getSelectedVerseText(): string {
    if (!this.chapter?.verses?.length || !this.selectedVerseIds.length) {
      return ""
    }
    const versesByNumber = new Map(
      this.chapter.verses.map((verse) => [verse.number, verse]),
    )
    const orderedIds = [...this.selectedVerseIds].sort((a, b) => a - b)
    const verseTexts = orderedIds
      .map((id) => versesByNumber.get(id))
      .filter((verse): verse is Verse => Boolean(verse))
      .map((verse) => this.formatVerseText(verse))
      .filter(Boolean)

    return verseTexts.join(" ").trim()
  }

  private formatVerseText(verse: Verse): string {
    const text = verse.text
      .filter((item) => item.type !== "footnote")
      .map((item) => item.text)
      .join("")
      .replace(/\s+/g, " ")
      .trim()

    if (!text) return ""
    return text
  }

  copySelection(): void {
    const text = this.selectedText.trim()
    if (!text) return

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
    } 
    this.snackBar.open("Texto copiado.", undefined, { duration: 2000 })
    this.dismissSelectionMenu()
  }

  highlightSelection(): void {
    const highlights = this.getStoredHighlights()
    const bookHighlights = highlights[this.book.id] || {}
    const chapterKey = this.chapterNumber.toString()
    const verseSet = new Set<number>(bookHighlights[chapterKey] || [])

    for (const verse of this.selectedVerseIds) {
      verseSet.add(verse)
    }

    bookHighlights[chapterKey] = Array.from(verseSet)
    highlights[this.book.id] = bookHighlights
    this.saveStoredHighlights(highlights)
    this.applyHighlightIds(this.selectedVerseIds)
    //this.dismissSelectionMenu()
  }

  removeHighlightSelection(): void {
    const highlights = this.getStoredHighlights()
    const bookHighlights = highlights[this.book.id] || {}
    const chapterKey = this.chapterNumber.toString()
    const verseSet = new Set<number>(bookHighlights[chapterKey] || [])

    for (const verse of this.selectedVerseIds) {
      verseSet.delete(verse)
    }

    bookHighlights[chapterKey] = Array.from(verseSet)
    highlights[this.book.id] = bookHighlights
    this.saveStoredHighlights(highlights)
    this.removeHighlightIds(this.selectedVerseIds)
    //this.dismissSelectionMenu()
  }

  addNote(): void {
    const selectionText = this.selectedText.trim()
    if (!selectionText) return

    const range = this.selectedVerseRange
    if (!range && !this.selectedVerseIds.length) return

    const fullText = this.getSelectedVerseText() || selectionText
    const dialogRef = this.dialog.open(NoteDialogComponent, {
      data: { text: fullText },
    })

    dialogRef.afterClosed().subscribe((note?: string) => {
      if (!note) return

      const notes = this.getStoredNotes()
      notes.push({
        id: this.createNoteId(),
        bookId: this.book.id,
        chapterNumber: this.chapterNumber,
        verseStart: range?.start ?? this.selectedVerseIds[0],
        verseEnd:
          range?.end ?? this.selectedVerseIds[this.selectedVerseIds.length - 1],
        text: fullText,
        note,
        createdAt: Date.now(),
      })
      this.saveStoredNotes(notes)
      globalThis.dispatchEvent(new Event("notesChanged"))
      this.snackBar.open("Nota salva.", undefined, { duration: 2000 })
      this.dismissSelectionMenu()
    })
  }

  async shareSelection(): Promise<void> {
    const text = this.selectedText.trim()
    if (!text) return

    const referenceUrl = this.buildReferenceUrl()

    try {
      if (
        "share" in navigator &&
        (!("canShare" in navigator) ||
          navigator.canShare({ text, url: referenceUrl }))
      ) {
        await navigator.share({ text, url: referenceUrl })
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${text}\n${referenceUrl}`)
        this.snackBar.open("Texto copiado.", undefined, { duration: 2000 })
      } 
      this.dismissSelectionMenu()
    } catch (error) {
      console.error(error)
    }
  }

  private buildReferenceUrl(): string {
    const abrv = this.bookService.getUrlAbrv(this.book)
    const url = new URL(
      `/${abrv}/${this.chapterNumber}`,
      globalThis.location.origin,
    )
    const range = this.selectedVerseRange
    if (range) {
      url.searchParams.set("verseStart", range.start.toString())
      if (range.end > range.start) {
        url.searchParams.set("verseEnd", range.end.toString())
      }
      return url.toString()
    }
    if (this.selectedVerseIds.length) {
      const start = Math.min(...this.selectedVerseIds)
      const end = Math.max(...this.selectedVerseIds)
      url.searchParams.set("verseStart", start.toString())
      if (end > start) {
        url.searchParams.set("verseEnd", end.toString())
      }
    }
    return url.toString()
  }

  private getSelectedVerseIds(range: Range): number[] {
    const verseElements = this.getVerseElements()
    if (!verseElements.length) return []

    const startVerse = this.getVerseElementFromNode(range.startContainer)
    const endVerse = this.getVerseElementFromNode(range.endContainer)
    
    const rangeIds = this.getVerseIdsByBoundaryElements(verseElements, startVerse, endVerse)
    if (rangeIds.length) return rangeIds

    const intersectionIds = this.getVerseIdsByIntersection(verseElements, range)
    if (intersectionIds.length) return intersectionIds

    return this.getFallbackVerseId(startVerse, endVerse)
  }

  private getVerseIdsByBoundaryElements(
    verseElements: HTMLElement[],
    startVerse: HTMLElement | null,
    endVerse: HTMLElement | null,
  ): number[] {
    if (!startVerse || !endVerse) return []

    const startIndex = verseElements.indexOf(startVerse)
    const endIndex = verseElements.indexOf(endVerse)
    if (startIndex === -1 || endIndex === -1) return []

    const from = Math.min(startIndex, endIndex)
    const to = Math.max(startIndex, endIndex)
    return verseElements
      .slice(from, to + 1)
      .map((element) => this.getVerseId(element))
      .filter((value) => Number.isFinite(value))
  }

  private getVerseIdsByIntersection(verseElements: HTMLElement[], range: Range): number[] {
    const hits: number[] = []
    for (const verseElement of verseElements) {
      try {
        if (range.intersectsNode(verseElement)) {
          const id = this.getVerseId(verseElement)
          if (Number.isFinite(id)) {
            hits.push(id)
          }
        }
      } catch {
        // Some browsers throw on intersectsNode for certain nodes.
      }
    }
    return hits
  }

  private getFallbackVerseId(startVerse: HTMLElement | null, endVerse: HTMLElement | null): number[] {
    const fallback = startVerse || endVerse
    if (fallback) {
      const id = this.getVerseId(fallback)
      if (Number.isFinite(id)) return [id]
    }
    return []
  }

  private getVerseId(element: HTMLElement): number {
    const id = element.getAttribute("id")
    return Number.parseInt(id || "", 10)
  }

  private getVerseElementFromNode(node: Node | null): HTMLElement | null {
    if (!node) return null
    const element = node instanceof HTMLElement ? node : node.parentElement
    return element?.closest("verse") as HTMLElement | null
  }

  private getVerseRangeFromIds(
    ids: number[],
  ): { start: number; end: number } | null {
    if (!ids.length) return null
    return { start: Math.min(...ids), end: Math.max(...ids) }
  }

  private getVerseElements(): HTMLElement[] {
    if (!this.readerContent?.nativeElement) return []
    return Array.from(
      this.readerContent.nativeElement.querySelectorAll("verse[id]"),
    )
  }

  private applyStoredHighlights(): void {
    setTimeout(() => {
      const highlights = this.getStoredHighlights()
      const chapterKey = this.chapterNumber.toString()
      const verses = highlights[this.book.id]?.[chapterKey] || []
      for (const verse of verses) {
        const element = document.getElementById(`${verse}`)
        if (element) {
          element.classList.add("highlighted")
        }
      }
    }, 0)
  }

  private applyHighlightIds(ids: number[]): void {
    for (const verse of ids) {
      const element = document.getElementById(`${verse}`)
      if (element) {
        element.classList.add("highlighted")
      }
    }
    this.selectionHasHighlight = true
    this.cdr.markForCheck()
  }

  private removeHighlightIds(ids: number[]): void {
    for (const verse of ids) {
      const element = document.getElementById(`${verse}`)
      if (element) {
        element.classList.remove("highlighted")
      }
    }
    this.selectionHasHighlight = false
    this.cdr.markForCheck()
  }

  private idsHaveHighlight(ids: number[]): boolean {
    const highlights = this.getStoredHighlights()
    const chapterKey = this.chapterNumber.toString()
    const verses = highlights[this.book.id]?.[chapterKey] || []
    const verseSet = new Set<number>(verses)
    return ids.some((id) => verseSet.has(id))
  }

  private getStoredHighlights(): Record<string, Record<string, number[]>> {
    try {
      const raw = localStorage.getItem(this.highlightsStorageKey)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }

  private saveStoredHighlights(
    data: Record<string, Record<string, number[]>>,
  ): void {
    localStorage.setItem(this.highlightsStorageKey, JSON.stringify(data))
  }

  private getStoredNotes(): StoredNote[] {
    try {
      const raw = localStorage.getItem(this.notesStorageKey)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }

  private saveStoredNotes(data: StoredNote[]): void {
    localStorage.setItem(this.notesStorageKey, JSON.stringify(data))
  }

  private createNoteId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID()
    }
    return `note_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }

  getBooks() {
    return this.bookService.getBooks()
  }
}
