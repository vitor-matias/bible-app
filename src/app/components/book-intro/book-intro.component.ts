import { CommonModule } from "@angular/common"
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  type OnChanges,
} from "@angular/core"

/**
 * A merged display element: either a standalone element or a section header
 * fused with the paragraph that follows (run-in style, matching the physical
 * edition layout).
 */
type IntroDisplayElement =
  | { kind: "standalone"; element: IntroElement }
  | {
      kind: "runIn"
      section: IntroSection | IntroMajorSection
      paragraph: IntroParagraph
    }

@Component({
  selector: "book-intro",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./book-intro.component.html",
  styleUrl: "./book-intro.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookIntroComponent implements OnChanges {
  @Input()
  introduction: IntroElement[] = []

  @Input()
  bookName = ""

  /** Pre-processed display list that merges section + following paragraph. */
  displayElements: IntroDisplayElement[] = []

  ngOnChanges(): void {
    this.displayElements = this.buildDisplayElements(this.introduction)
  }

  /**
   * Walk the flat intro array and, whenever a section/majorSection is
   * immediately followed by a paragraph, merge them into a single "runIn"
   * display element so the template can render the bold header inline with
   * the paragraph body — exactly as in the printed edition.
   */
  private buildDisplayElements(
    elements: IntroElement[],
  ): IntroDisplayElement[] {
    const result: IntroDisplayElement[] = []
    let i = 0

    while (i < elements.length) {
      const el = elements[i]

      if (
        (el.type === "introSection" || el.type === "introMajorSection") &&
        i + 1 < elements.length &&
        elements[i + 1].type === "introParagraph"
      ) {
        result.push({
          kind: "runIn",
          section: el as IntroSection | IntroMajorSection,
          paragraph: elements[i + 1] as IntroParagraph,
        })
        i += 2
      } else {
        result.push({ kind: "standalone", element: el })
        i++
      }
    }

    return result
  }
}
