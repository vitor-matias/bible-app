import { ChangeDetectionStrategy, Component, Inject } from "@angular/core"

import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
} from "@angular/material/bottom-sheet"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { RouterModule } from "@angular/router"
import { UnifiedGesturesDirective } from "../../directives/unified-gesture.directive"
import { AnalyticsService } from "../../services/analytics.service"
import {
  BibleReference,
  BibleReferenceService,
} from "../../services/bible-reference.service"
import { BookService } from "../../services/book.service"
import { ToastService } from "../../services/toast.service"
import { getVerseQueryParams, parseReferences } from "../verse/verse.utils"

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
    <div unifiedGestures fontSizeContext="footnotes" class="footnotes-container">
      <div class="footnotes-list">
        @for (footnote of data.footnotes; track footnote) {
        <div class="footnote-item">
          <span class="footnote-reference">{{ footnote.reference }} </span>
          @for(part of parseReferences(footnote.text).parts; track $index){ @if
          (typeof part === 'object') {
          <a
            (click)="followReference()"
            [routerLink]="['/', getAbrv(part.book), part.chapter]"
            [queryParams]="getVerseQueryParams(part.verses, part.crossChapter)"
          >{{ part.match }}</a>
          } @else {
          {{ part }}
          } }
        </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .footnotes-container {
        font-family: var(--font-reading);
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
    public data: { footnotes: _Footnote[]; verse: Verse },
    private bibleRef: BibleReferenceService,
    private bookService: BookService,
    private analyticsService: AnalyticsService,
    private toast: ToastService,
  ) {
    void this.analyticsService.track("footnotes_opened", {
      book: data.verse.bookId,
      chapter: data.verse.chapterNumber,
      verse: data.verse.number,
    })
  }

  parseReferences(text: string): { parts: (string | BibleReference)[] } {
    return {
      parts: parseReferences(
        this.bibleRef,
        text,
        this.data.verse.bookId,
        this.data.verse.chapterNumber,
      ),
    }
  }

  /** As the verse's own links and the iOS sheet have it. */
  getVerseQueryParams = getVerseQueryParams

  getAbrv(bookId: string): string {
    const book = this.bookService.findBook(bookId)
    return this.bookService.getUrlAbrv(book)
  }

  close(): void {
    this.bottomSheetRef.dismiss()
  }

  /** The link navigates; this closes the sheet and offers the way back. */
  followReference(): void {
    this.close()
    this.toast.showReturn(this.data.verse)
  }
}
