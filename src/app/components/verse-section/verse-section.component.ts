import { CommonModule } from "@angular/common"
import { Component, Input, OnChanges, SimpleChanges } from "@angular/core"
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar"
import { Router, RouterModule } from "@angular/router"
import {
  type BibleReference,
  BibleReferenceService,
} from "../../services/bible-reference.service"
import { BookService } from "../../services/book.service"
import { TwoActionSnackComponent } from "../two-action-snackbar/two-action-snackbar.component"
import { getVerseQueryParams, parseReferences } from "../verse/verse.utils"

@Component({
  selector: "verse-section",
  standalone: true,
  imports: [CommonModule, RouterModule, MatSnackBarModule],
  templateUrl: "./verse-section.component.html",
  styleUrl: "./verse-section.component.css",
})
export class VerseSectionComponent implements OnChanges {
  @Input()
  data!: Verse

  @Input()
  changeLine!: boolean

  @Input()
  nextIsQuote = false

  @Input()
  nextIsParagraph = false

  /** Pre-computed parsed references keyed by text index */
  parsedReferences: Map<number, (string | BibleReference)[]> = new Map()

  constructor(
    private bibleRef: BibleReferenceService,
    private bookService: BookService,
    private snackBar: MatSnackBar,
    private router: Router,
  ) {}

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.data) {
      this.parsedReferences = this.computeParsedReferences()
    }
  }

  private computeParsedReferences(): Map<number, (string | BibleReference)[]> {
    const map = new Map<number, (string | BibleReference)[]>()
    for (let i = 0; i < this.data.text.length; i++) {
      const t = this.data.text[i]
      if (t.type === "references") {
        map.set(i, parseReferences(this.bibleRef, t.text, this.data.bookId))
      }
    }
    return map
  }

  getVerseQueryParams = getVerseQueryParams

  showReturnSnackbar() {
    const currentLocation = {
      bookId: this.data.bookId,
      chapterNumber: this.data.chapterNumber,
      verseNumber: this.data.number > 0 ? this.data.number : 1,
    }
    const book = this.bookService.findBook(currentLocation.bookId)

    this.snackBar.openFromComponent(TwoActionSnackComponent, {
      data: {
        message: `Voltar para ${book.shortName} ${currentLocation.chapterNumber},${currentLocation.verseNumber}?`,
        returnUrl: () =>
          this.router.navigate(
            [this.bookService.getUrlAbrv(book), currentLocation.chapterNumber],
            {
              queryParams: {
                verseStart: currentLocation.verseNumber,
                highlight: false,
              },
            },
          ),
      },
    })
  }
}
