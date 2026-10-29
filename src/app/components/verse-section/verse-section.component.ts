import { CommonModule } from "@angular/common"
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  inject,
  OnChanges,
  SimpleChanges,
} from "@angular/core"
import { RouterModule } from "@angular/router"
import {
  type BibleReference,
  BibleReferenceService,
} from "../../services/bible-reference.service"
import { ToastService } from "../../services/toast.service"
import { getVerseQueryParams, parseReferences } from "../verse/verse.utils"

@Component({
  selector: "verse-section",
  standalone: true,
  imports: [CommonModule, RouterModule],
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

  /** Whether the chapter's drop-cap number floats beside this heading. */
  @Input()
  besideChapterNumber = false

  private readonly toast = inject(ToastService)

  /** Pre-computed parsed references keyed by text index */
  parsedReferences: Map<number, (string | BibleReference)[]> = new Map()

  constructor(private bibleRef: BibleReferenceService) {}

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
        map.set(
          i,
          parseReferences(
            this.bibleRef,
            t.text,
            this.data.bookId,
            this.data.chapterNumber,
          ),
        )
      }
    }
    return map
  }

  getVerseQueryParams = getVerseQueryParams

  showReturnSnackbar() {
    this.toast.showReturn(this.data)
  }
}
