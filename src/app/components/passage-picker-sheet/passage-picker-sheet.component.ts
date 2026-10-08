import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
} from "@angular/core"
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
} from "@angular/material/bottom-sheet"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { PreferencesService } from "../../services/preferences.service"
import type {
  PassagePickerData,
  PickerBook,
  PickerChapter,
} from "../../utils/passage-picker"
import { foldText } from "../../utils/text-search"

/** What the sheet closes with: a book, and its chapter unless it has none. */
export interface PickedPassage {
  bookId: string
  chapter?: number
}

/** A section of book tiles: a canon group, or a testament's introduction. */
interface BookSection {
  title: string
  books: PickerBook[]
}

/**
 * The passage picker of the Android app and phone browsers, as the iOS app's
 * (PassagePicker.swift), from the same data (buildPassagePicker): the books
 * as tiles by canon group, by name or abbreviation, with a filter; then a
 * book's chapters as a grid, a psalm's liturgical number under its own, and
 * a dot in the colour of a chapter's ribbon.
 */
@Component({
  selector: "app-passage-picker-sheet",
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: "./passage-picker-sheet.component.html",
  styleUrl: "./passage-picker-sheet.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PassagePickerSheetComponent implements AfterViewInit {
  readonly data = inject<PassagePickerData>(MAT_BOTTOM_SHEET_DATA)
  private readonly sheet =
    inject<MatBottomSheetRef<PassagePickerSheetComponent, PickedPassage>>(
      MatBottomSheetRef,
    )
  private readonly preferences = inject(PreferencesService)
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef)

  /**
   * The book whose chapters show, or null for the books. It opens on the
   * book being read, as the iOS picker does.
   */
  readonly book = signal<PickerBook | null>(this.openingBook())
  /** Books by abbreviation ("Gn") rather than name; remembered. */
  readonly abbreviations = signal(this.preferences.getPickerAbbreviations())
  readonly filter = signal("")

  /** The books matching the filter, a section per canon group. */
  readonly sections = computed<BookSection[]>(() => {
    const query = foldText(this.filter().trim())
    const matches = (book: PickerBook) =>
      !query ||
      [book.label, book.name, book.abbreviation].some((text) =>
        foldText(text).includes(query),
      )
    const sections: BookSection[] = []
    for (const testament of this.data.sections) {
      for (const group of testament.groups) {
        const books = group.books.filter(matches)
        // A testament's own introduction sits under the testament's name.
        const title = group.title ?? testament.title
        if (!books.length || sections.some((s) => s.title === title)) continue
        sections.push({ title, books })
      }
    }
    return sections
  })

  ngAfterViewInit(): void {
    this.revealCurrent()
  }

  isCurrentBook(book: PickerBook): boolean {
    return book.id === this.data.currentBookId
  }

  isCurrentChapter(book: PickerBook, chapter: PickerChapter): boolean {
    return (
      this.isCurrentBook(book) && chapter.number === this.data.currentChapter
    )
  }

  /** A book without chapters (an introduction, About) opens at once. */
  openBook(book: PickerBook): void {
    if (!book.chapters.length) {
      this.sheet.dismiss({ bookId: book.id })
      return
    }
    this.book.set(book)
    this.scrollBodyTo(0)
    this.revealCurrent()
  }

  pickChapter(book: PickerBook, chapter: PickerChapter): void {
    this.sheet.dismiss({ bookId: book.id, chapter: chapter.number })
  }

  showBooks(): void {
    this.book.set(null)
    this.revealCurrent()
  }

  toggleAbbreviations(): void {
    const next = !this.abbreviations()
    this.abbreviations.set(next)
    this.preferences.setPickerAbbreviations(next)
  }

  close(): void {
    this.sheet.dismiss()
  }

  /** "Salmo 23, na liturgia 22, O bom pastor", as VoiceOver reads it on iOS. */
  chapterLabel(chapter: PickerChapter): string {
    if (!chapter.label) return chapter.title ?? "Introdução"
    const spoken = chapter.spoken ?? `Capítulo ${chapter.label}`
    return chapter.title ? `${spoken}, ${chapter.title}` : spoken
  }

  private openingBook(): PickerBook | null {
    for (const testament of this.data.sections) {
      for (const group of testament.groups) {
        const book = group.books.find((b) => b.id === this.data.currentBookId)
        if (book) return book.chapters.length ? book : null
      }
    }
    return null
  }

  /** Brings the tile being read into view, once it has rendered. */
  private revealCurrent(): void {
    requestAnimationFrame(() => {
      this.host.nativeElement
        .querySelector(".tile.current")
        ?.scrollIntoView?.({ block: "center" })
    })
  }

  private scrollBodyTo(top: number): void {
    this.host.nativeElement.querySelector(".picker-body")?.scrollTo?.({ top })
  }
}
