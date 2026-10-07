import { CommonModule } from "@angular/common"
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  inject,
  OnChanges,
  SimpleChanges,
} from "@angular/core"
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar"
import { Router, RouterModule } from "@angular/router"
import {
  type BibleReference,
  BibleReferenceService,
} from "../../services/bible-reference.service"
import { BookService } from "../../services/book.service"
import { NativeChromeService } from "../../services/native-chrome.service"
import { TwoActionSnackComponent } from "../two-action-snackbar/two-action-snackbar.component"
import { getVerseQueryParams, parseReferences } from "../verse/verse.utils"

@Component({
  selector: "verse-section",
  standalone: true,
  imports: [CommonModule, RouterModule, MatSnackBarModule],
  templateUrl: "./verse-section.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
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

  private readonly nativeChrome = inject(NativeChromeService)

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
    const place = `${book.shortName} ${currentLocation.chapterNumber},${currentLocation.verseNumber}`
    const goBack = () =>
      this.router.navigate(
        [this.bookService.getUrlAbrv(book), currentLocation.chapterNumber],
        {
          queryParams: {
            verseStart: currentLocation.verseNumber,
            highlight: false,
          },
        },
      )

    // iOS: the glass toast is the button, as Books' "Back to Page" is.
    if (this.nativeChrome.enabled) {
      this.nativeChrome.toast(`Voltar para ${place}`, {
        symbol: "arrow.uturn.backward",
        onTap: goBack,
      })
      return
    }
    this.snackBar.openFromComponent(TwoActionSnackComponent, {
      data: { message: `Voltar para ${place}?`, returnUrl: goBack },
    })
  }
}
