import { CommonModule } from "@angular/common"
import { Component, Input } from "@angular/core"
import {
  type MatSnackBar,
  MatSnackBarModule,
} from "@angular/material/snack-bar"
import { type Router, RouterModule } from "@angular/router"
import type {
  BibleReference,
  BibleReferenceService,
  CrossChapterRange,
  VerseReference,
} from "../../services/bible-reference.service"
import type { BookService } from "../../services/book.service"
import { TwoActionSnackComponent } from "../two-action-snackbar/two-action-snackbar.component"

@Component({
  selector: "verse-section",
  standalone: true,
  imports: [CommonModule, RouterModule, MatSnackBarModule],
  templateUrl: "./verse-section.component.html",
  styleUrl: "./verse-section.component.css",
})
export class VerseSectionComponent {
  @Input()
  data!: Verse

  @Input()
  changeLine!: boolean

  constructor(
    private bibleRef: BibleReferenceService,
    private bookService: BookService,
    private snackBar: MatSnackBar,
    private router: Router,
  ) {}

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

  getVerseQueryParams(
    verses?: VerseReference[],
    crossChapter?: CrossChapterRange,
  ) {
    if (crossChapter) {
      return { verseStart: crossChapter.startVerse }
    }

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
