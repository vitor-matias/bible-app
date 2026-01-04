import { Component, Inject } from '@angular/core'

import { MatBottomSheetRef, MAT_BOTTOM_SHEET_DATA } from '@angular/material/bottom-sheet'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { UnifiedGesturesDirective } from '../../directives/unified-gesture.directive'
import { BibleReference, BibleReferenceService, VerseReference } from '../../services/bible-reference.service'
import { RouterModule } from '@angular/router'
import { BookService } from '../../services/book.service'
import { MatDividerModule } from '@angular/material/divider'

@Component({
  selector: 'footnotes-bottom-sheet',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, UnifiedGesturesDirective, RouterModule, MatDividerModule],
  templateUrl: './footnotes-bottom-sheet.component.html',
  styleUrl: './footnotes-bottom-sheet.component.css',
})
export class FootnotesBottomSheetComponent {
  constructor(
    private readonly bottomSheetRef: MatBottomSheetRef<FootnotesBottomSheetComponent>,
    @Inject(MAT_BOTTOM_SHEET_DATA)
    public data: { footnotes: any[], notes?: StoredNote[], verse: any },
    private readonly bibleRef: BibleReferenceService,
    private readonly bookService: BookService,
  ) {
    // @ts-ignore
    if(globalThis.umami) {
      // @ts-ignore
      globalThis.umami.track('footnotes_opened', { book: data.verse.bookId, chapter: data.verse.chapterNumber, verse: data.verse.verseNumber });
    }
  }

  parseReferences(text: string): { parts: (string | BibleReference)[] } {
    const refs = this.bibleRef.extract(text, this.data.verse.bookId, this.data.verse.chapterNumber)
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
      if (!verses?.length) return null
      const first = verses[0]
      if (first.type === "single") {
        return { verseStart: first.verse }
      }
      if (first.type === "range") {
        return { verseStart: first.start, verseEnd: first.end }
      }
      return null
    }

    getAbrv(bookId: string): string {
      const book = this.bookService.findBook(bookId)
      return this.bookService.getUrlAbrv(book)
    }

    close(): void {
      this.bottomSheetRef.dismiss()
    }

    formatNoteRange(note: StoredNote): string {
      if (note.verseStart === note.verseEnd) {
        return `${note.verseStart}.`
      }
      return `${note.verseStart}-${note.verseEnd}.`
    }

}