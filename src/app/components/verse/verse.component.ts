import { CommonModule } from "@angular/common"
// biome-ignore lint/style/useImportType: <explanation>
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  Input,
} from "@angular/core"
import { RouterModule } from "@angular/router"
import {
  BibleReference,
  BibleReferenceService,
  VerseReference,
} from "../../services/bible-reference.service"
import { VerseSectionComponent } from "../verse-section/verse-section.component"
import {
  MatBottomSheet,
  MatBottomSheetModule,
} from "@angular/material/bottom-sheet"
import { FootnotesBottomSheetComponent } from "../footnotes-bottom-sheet/footnotes-bottom-sheet.component"

@Component({
  selector: "verse",
  imports: [
    CommonModule,
    VerseSectionComponent,
    RouterModule,
    MatBottomSheetModule,
  ],
  templateUrl: "./verse.component.html",
  styleUrls: ["./verse.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class VerseComponent {
  private readonly notesStorageKey = "bibleNotes"
  chapterNumberIndex = -1
  skip = false

  @Input()
  data!: Verse

  constructor(
    private bibleRef: BibleReferenceService,
    private bottomSheet: MatBottomSheet,
    private cdr: ChangeDetectorRef,
  ) {}

  shouldDisplayChapterNumber(
    data: Verse,
    text: TextType,
    index: number,
    isLast: boolean,
  ): boolean {
    if (data.number !== 0) return false

    if (text.type === "section" && text.tag === "s2") {
      const hasPreviousSection = data.text
        .slice(0, index)
        .some((item) => item.type === "section" && item.tag === "s2")
      if (!hasPreviousSection) {
        this.chapterNumberIndex = index
        return true
      }
      return false
    }

    if (!this.hasSection(data.text) && isLast) {
      this.chapterNumberIndex = index
      return true
    }

    return false
  }

  hasSection(data: TextType[]): boolean {
    return data.some((text) => text.type === "section" && text.tag === "s2")
  }

  isInSection(data: TextType[], position: number): boolean {
    const beforeData = data.slice(0, position)

    for (let i = beforeData.length - 1; i >= 0; i--) {
      const currentData = beforeData[i]
      if (currentData.type === "section" && currentData.tag === "s2") {
        return true
      }
      if (currentData.type === "paragraph" || currentData.type === "quote") {
        return false
      }
    }
    return false
  }

  getDataForSection(i: number) {
    const afterText = this.data.text.slice(i)

    const sectionText = []

    for (let index = 0; index < afterText.length; index++) {
      if (afterText[index].type === "paragraph") {
        break
      }
      sectionText.push(afterText[index])
    }

    return { ...this.data, text: sectionText }
  }

  checkIfIsTouchingChapterNumber(element: HTMLSpanElement): boolean {
    const chapterNumberElement = document.querySelector(
      ".chapterNumber",
    ) as HTMLDivElement
    if (!element || !chapterNumberElement) return false
    const rect1 = chapterNumberElement.getBoundingClientRect()
    const rect2 = element.getBoundingClientRect()

    return rect1.bottom >= rect2.top && rect1.top <= rect2.bottom
  }

  shouldShowParagraph(data: Verse, text: Paragraph, i: number): boolean {
    return (
      data.number > 0 &&
      ((data.text[i - 1]?.type !== "section" &&
        data.text[i - 1]?.type !== "references" &&
        (data.text[i - 1]?.type !== "paragraph" ||
          (data.text[i - 1]?.type === "paragraph" && text.text.length > 2))) ||
        data.bookId === "psa")
    )
  }

  parseReferences(text: string): { parts: (string | BibleReference)[] } {
    const refs = this.bibleRef.extract(text, this.data.bookId)
    if (!refs.length) return { parts: [text] }

    const parts: (string | BibleReference)[] = []
    let lastIdx = 0
    for (const ref of refs) {
      if (ref.index > lastIdx) {
        parts.push(text.slice(lastIdx, ref.index))
      }
      parts.push(ref)
      lastIdx = ref.index + ref.match.length
    }
    if (lastIdx < text.length) {
      parts.push(text.slice(lastIdx))
    }
    return { parts }
  }

  getVerseQueryParams(verses?: VerseReference[]) {
    if (!verses || !verses.length) return null
    const first = verses[0]
    if (first.type === "single") {
      return { verseStart: first.verse }
    }
    if (first.type === "range") {
      return { verseStart: first.start, verseEnd: first.end }
    }
    return null
  }

  containsFootnotes(): boolean {
    if (this.data.text.some((t) => t.type === "footnote")) return true
    return this.getNotesForVerse().length > 0
  }

  toggleFootnotes(): void {
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed) return

    const footnotes = this.data.text.filter((t) => t.type === "footnote")
    const notes = this.getNotesForVerse()
    if (footnotes.length === 0 && notes.length === 0) return
    this.bottomSheet.open(FootnotesBottomSheetComponent, {
      data: { footnotes, notes, verse: this.data },
    })
  }

  @HostListener("window:notesChanged")
  onNotesChanged(): void {
    this.cdr.markForCheck()
  }

  private getNotesForVerse(): StoredNote[] {
    try {
      const raw = localStorage.getItem(this.notesStorageKey)
      const notes = raw ? (JSON.parse(raw) as StoredNote[]) : []
      return notes.filter((note) => {
        return (
          note.bookId === this.data.bookId &&
          note.chapterNumber === this.data.chapterNumber &&
          this.data.number >= note.verseStart &&
          this.data.number <= note.verseEnd
        )
      })
    } catch {
      return []
    }
  }
}

type StoredNote = {
  id: string
  bookId: string
  chapterNumber: number
  verseStart: number
  verseEnd: number
  text: string
  note: string
  createdAt: number
}
