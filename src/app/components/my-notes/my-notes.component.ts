import { DOCUMENT } from "@angular/common"
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  type OnInit,
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { MatToolbarModule } from "@angular/material/toolbar"
import { RouterLink } from "@angular/router"
import { catchError, combineLatest, EMPTY, mergeMap, Subject } from "rxjs"
import { appConfig } from "../../config"
import { BibleApiService } from "../../services/bible-api.service"
import { BookService } from "../../services/book.service"
import {
  HIGHLIGHT_COLOR_NAMES,
  HIGHLIGHT_COLORS,
  HighlightService,
  type VerseHighlight,
} from "../../services/highlight.service"
import { NotesService, type VerseNote } from "../../services/notes.service"
import { SeoService } from "../../services/seo.service"
import {
  buildBackup,
  dayStamp,
  type NotebookContext,
  type NotebookEntry,
  notebookEntries,
  parseBackup,
  toMarkdown,
  toPlainText,
} from "../../utils/study-backup"
import { EDITION } from "../../utils/text"
import { verseText } from "../../utils/text-search"

/** What the list can be narrowed to besides a colour: see matchesFilter. */
type Filter = "all" | "notes" | "marks" | (typeof HIGHLIGHT_COLORS)[number]

/** Chapters asked for at once, to quote the verses: a notebook can span many. */
const QUOTE_REQUESTS_AT_ONCE = 3

/**
 * Everything the reader has written and marked, in one place.
 *
 * Notes and marks are kept in this browser and nowhere else, which is a thing
 * a reader should be able to see and to act on: so this lists them in the
 * Bible's order, each a link back to its verse, and is where they leave —
 * printed, copied, saved as a file and read back in. The colour of a mark is
 * said in words, so it does not depend on being seen.
 */
@Component({
  selector: "my-notes",
  imports: [RouterLink, MatToolbarModule, MatButtonModule, MatIconModule],
  templateUrl: "./my-notes.component.html",
  styleUrl: "./my-notes.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyNotesComponent implements OnInit {
  private readonly notesService = inject(NotesService)
  private readonly highlights = inject(HighlightService)
  private readonly bookService = inject(BookService)
  private readonly api = inject(BibleApiService)
  private readonly seo = inject(SeoService)
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly document = inject(DOCUMENT)

  readonly colorNames = HIGHLIGHT_COLOR_NAMES
  readonly filters: { value: Filter; label: string }[] = [
    { value: "all", label: "Tudo" },
    { value: "notes", label: "Só com nota" },
    { value: "marks", label: "Só com marca" },
    ...HIGHLIGHT_COLORS.map((color) => ({
      value: color,
      label: `Marca ${HIGHLIGHT_COLOR_NAMES[color]}`,
    })),
  ]

  /** Everything, in the Bible's order. */
  entries: NotebookEntry[] = []
  /** What the filters leave of it. */
  visible: NotebookEntry[] = []
  books: { id: Book["id"]; name: string }[] = []
  /**
   * Whether the book list has come. Until it has, a reference cannot be named
   * or linked — the service answers with the About page — so nothing is listed
   * rather than listed under the wrong name.
   */
  booksKnown = false
  filter: Filter = "all"
  bookId = ""
  /** What the last thing the reader asked for came to, read out as it changes. */
  status = ""
  confirmingDelete = false
  /** The browser is refusing to keep what is written: see saveFailed$. */
  storageFailed = false
  readonly day = dayStamp(new Date())
  readonly edition = EDITION

  /** The records themselves, for a copy: the list is only how they are shown. */
  private noteRecords: VerseNote[] = []
  private markRecords: VerseHighlight[] = []
  private quotes = new Map<string, string>()
  private readonly requested = new Set<string>()
  private readonly chapterRequests = new Subject<{
    bookId: Book["id"]
    chapter: Chapter["number"]
  }>()

  constructor() {
    this.chapterRequests
      .pipe(
        mergeMap(
          (request) =>
            this.api
              .getChapter(request.bookId, request.chapter)
              // No quote is better than no list: the reference still says where.
              .pipe(
                catchError(() => {
                  // Asked for again when the notes next change, not never.
                  this.requested.delete(`${request.bookId}:${request.chapter}`)
                  return EMPTY
                }),
              ),
          QUOTE_REQUESTS_AT_ONCE,
        ),
        takeUntilDestroyed(),
      )
      .subscribe((chapter) => {
        for (const verse of chapter.verses ?? []) {
          const text = verseText(verse)
          if (text) {
            this.quotes.set(
              this.keyOf(chapter.bookId, chapter.number, verse.number),
              text,
            )
          }
        }
        this.cdr.markForCheck()
      })

    combineLatest([this.notesService.notes$, this.highlights.highlights$])
      .pipe(takeUntilDestroyed())
      .subscribe(([notes, marks]) => {
        this.noteRecords = notes
        this.markRecords = marks
        this.entries = notebookEntries(notes, marks)
        this.books = this.bookOptions()
        if (this.bookId && !this.books.some((b) => b.id === this.bookId)) {
          this.bookId = ""
        }
        this.narrow()
        this.askForQuotes()
        this.cdr.markForCheck()
      })

    this.bookService.books$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.booksKnown = true
      this.books = this.bookOptions()
      this.cdr.markForCheck()
    })

    combineLatest([this.notesService.saveFailed$, this.highlights.saveFailed$])
      .pipe(takeUntilDestroyed())
      .subscribe(([notes, marks]) => {
        this.storageFailed = notes || marks
        this.cdr.markForCheck()
      })
  }

  ngOnInit(): void {
    this.seo.updateForMyNotes()
  }

  // ---- what is shown ------------------------------------------------------

  get noteCount(): number {
    return this.entries.filter((entry) => entry.note).length
  }

  get markCount(): number {
    return this.entries.filter((entry) => entry.color).length
  }

  onFilter(value: string): void {
    this.filter = value as Filter
    this.narrow()
  }

  onBook(value: string): void {
    this.bookId = value
    this.narrow()
  }

  keyFor(entry: NotebookEntry): string {
    return this.keyOf(entry.bookId, entry.chapter, entry.verse)
  }

  reference(entry: NotebookEntry): string {
    return `${this.bookService.findBook(entry.bookId).shortName} ${entry.chapter},${entry.verse}`
  }

  link(entry: NotebookEntry): string[] {
    const book = this.bookService.findBook(entry.bookId)
    return [
      "/",
      this.bookService.getUrlAbrv(book),
      this.bookService.getChapterUrlSegment(entry.chapter),
    ]
  }

  queryParams(entry: NotebookEntry): { verseStart: number } {
    return { verseStart: entry.verse }
  }

  quote(entry: NotebookEntry): string | undefined {
    return this.quotes.get(this.keyFor(entry))
  }

  // ---- what leaves --------------------------------------------------------

  print(): void {
    this.document.defaultView?.print()
  }

  async copyList(): Promise<void> {
    try {
      await navigator.clipboard.writeText(
        toPlainText(this.visible, this.notebookContext()),
      )
      this.say(
        `${this.visible.length} ${this.visible.length === 1 ? "entrada copiada" : "entradas copiadas"}.`,
      )
    } catch {
      this.say("Não foi possível copiar. Guarde um ficheiro de texto.")
    }
  }

  saveMarkdown(): void {
    this.download(
      `biblia-notas-${this.day}.md`,
      toMarkdown(this.visible, this.notebookContext()),
      "text/markdown",
    )
    this.say("Ficheiro de texto guardado.")
  }

  /** Everything, whatever the filters say: a copy that left things out is not a copy. */
  saveBackup(): void {
    const backup = buildBackup(this.noteRecords, this.markRecords, new Date())
    this.download(
      `biblia-copia-${this.day}.json`,
      JSON.stringify(backup, null, 2),
      "application/json",
    )
    this.say("Cópia guardada. Guarde-a num sítio seguro.")
  }

  async onFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0]
    input.value = ""
    if (!file) return
    const result = parseBackup(await file.text())
    if (!result.ok) {
      this.say(result.reason)
      return
    }
    const notes = this.notesService.importNotes(result.backup.notes)
    const marks = this.highlights.importHighlights(result.backup.highlights)
    const kept = notes.kept + marks.kept
    this.say(
      `Lidas ${notes.added + notes.replaced} notas e ${marks.added + marks.replaced} marcas.` +
        (kept ? ` ${kept} já cá estavam, mais recentes.` : "") +
        (result.dropped ? ` ${result.dropped} não puderam ser lidas.` : ""),
    )
  }

  askToDelete(): void {
    this.confirmingDelete = true
  }

  cancelDelete(): void {
    this.confirmingDelete = false
  }

  deleteEverything(): void {
    this.notesService.deleteAll()
    this.highlights.clearAll()
    this.confirmingDelete = false
    this.say("Notas e marcas apagadas deste navegador.")
  }

  // ---- inside -------------------------------------------------------------

  private say(message: string): void {
    this.status = message
    this.cdr.markForCheck()
  }

  private narrow(): void {
    this.visible = this.entries.filter(
      (entry) =>
        (!this.bookId || entry.bookId === this.bookId) &&
        this.matchesFilter(entry),
    )
  }

  private matchesFilter(entry: NotebookEntry): boolean {
    switch (this.filter) {
      case "all":
        return true
      case "notes":
        return !!entry.note
      case "marks":
        return !!entry.color
      default:
        return entry.color === this.filter
    }
  }

  private bookOptions(): { id: Book["id"]; name: string }[] {
    const seen = new Set<string>()
    const options: { id: Book["id"]; name: string }[] = []
    for (const entry of this.entries) {
      if (seen.has(entry.bookId)) continue
      seen.add(entry.bookId)
      options.push({
        id: entry.bookId,
        name: this.bookService.findBook(entry.bookId).shortName,
      })
    }
    return options
  }

  /** The words of each verse, once its chapter has come. */
  private askForQuotes(): void {
    for (const entry of this.entries) {
      const chapter = `${entry.bookId}:${entry.chapter}`
      if (this.requested.has(chapter)) continue
      this.requested.add(chapter)
      this.chapterRequests.next({
        bookId: entry.bookId,
        chapter: entry.chapter,
      })
    }
  }

  private notebookContext(): NotebookContext {
    return {
      reference: (entry) => this.reference(entry),
      url: (entry) => {
        const [, abrv, chapter] = this.link(entry)
        return `https://${appConfig.domain}/${abrv}/${chapter}?verseStart=${entry.verse}`
      },
      quote: (entry) => this.quote(entry),
      edition: EDITION,
      day: this.day,
    }
  }

  private keyOf(bookId: string, chapter: number, verse: number): string {
    return `${bookId}:${chapter}:${verse}`
  }

  private download(name: string, text: string, type: string): void {
    const url = URL.createObjectURL(new Blob([text], { type }))
    const link = this.document.createElement("a")
    link.href = url
    link.download = name
    this.document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
