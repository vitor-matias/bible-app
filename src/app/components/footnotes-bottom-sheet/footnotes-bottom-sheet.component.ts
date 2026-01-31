import { Component, Inject } from "@angular/core"

import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
} from "@angular/material/bottom-sheet"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { RouterModule } from "@angular/router"
import { UnifiedGesturesDirective } from "../../directives/unified-gesture.directive"
import {
  BibleReference,
  BibleReferenceService,
  VerseReference,
} from "../../services/bible-reference.service"
import { BookService } from "../../services/book.service"

@Component({
  selector: "footnotes-bottom-sheet",
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    UnifiedGesturesDirective,
    RouterModule,
  ],
  template: `
    <div unifiedGestures class="footnotes-container">
      <div class="footnotes-list">
        @for (footnote of data.footnotes; track footnote) {
          <div class="footnote-item">
            <span class="footnote-reference">{{ footnote.reference }} </span>
            @for(part of parseReferences(footnote.text).parts; track $index){
              @if (typeof part === 'object') {
                <a (click)="close()"
                  [routerLink]="['/', getAbrv(part.book), part.chapter]"
                  [queryParams]="getVerseQueryParams(part.verses)"
                  >{{part.match}}</a
                  >
                } @else {
                  {{part}}
                }
              }
            </div>
          }
        </div>
      </div>
    `,
  styles: [
    `
    .footnotes-container {
      font-family: "PT Serif", serif;
        text-align: justify;

    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .footnote-item {
      margin-bottom: 12px;
      padding: 8px;
      border-radius: 4px;
    }
    .footnote-text {
      font-size: 100%;
      line-height: 1.4;
      
    }
    .footnote-reference { 
      font-weight: bold;
      font-size: 110%;
      margin-right: 8px;
    }
  `,
  ],
})
export class FootnotesBottomSheetComponent {
  constructor(
    private bottomSheetRef: MatBottomSheetRef<FootnotesBottomSheetComponent>,
    @Inject(MAT_BOTTOM_SHEET_DATA)
    // biome-ignore lint/suspicious/noExplicitAny: Data structure from bottom sheet is dynamic and loose typed
    public data: { footnotes: any[]; verse: any },
    private bibleRef: BibleReferenceService,
    private bookService: BookService,
  ) {
    // @ts-expect-error
    if (window.umami) {
      // @ts-expect-error
      window.umami.track("footnotes_opened", {
        book: data.verse.bookId,
        chapter: data.verse.chapterNumber,
        verse: data.verse.verseNumber,
      })
    }
  }

  parseReferences(text: string): { parts: (string | BibleReference)[] } {
    const refs = this.bibleRef.extract(
      text,
      this.data.verse.bookId,
      this.data.verse.chapterNumber,
    )
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

  getAbrv(bookId: string): string {
    const book = this.bookService.findBook(bookId)
    return this.bookService.getUrlAbrv(book)
  }

  close(): void {
    this.bottomSheetRef.dismiss()
  }
}
