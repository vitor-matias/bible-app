import {
  ChangeDetectionStrategy,
  Component,
  Input,
  type OnChanges,
} from "@angular/core"
import { VerseComponent } from "../verse/verse.component"
import { toVerseCards } from "./verse-cards"

/**
 * BibleScroll, the experimental feed-style view of a chapter: one verse to a
 * full-screen card, flicked through one at a time, with nothing on the card
 * but the verse. It only lays the cards out — the reader hosting it owns the
 * chapter, the scrolling and the snapping, so deep links, chapter navigation
 * and the book/chapter pickers all keep working.
 */
@Component({
  selector: "verse-cards",
  templateUrl: "./verse-cards.component.html",
  styleUrl: "./verse-cards.component.css",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VerseComponent],
})
export class VerseCardsComponent implements OnChanges {
  @Input({ required: true }) chapter!: Chapter

  verses: Verse[] = []

  ngOnChanges(): void {
    this.verses = toVerseCards(this.chapter)
  }
}
