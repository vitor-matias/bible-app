import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  Input,
  type OnChanges,
} from "@angular/core"

/** "runIn" is a section header fused with the paragraph that follows it. */
type IntroDisplayElement =
  | { kind: "standalone"; element: IntroElement }
  | {
      kind: "runIn"
      section: IntroSection | IntroMajorSection
      paragraph: IntroParagraph
    }
  | { kind: "list"; items: IntroListItem[] }

@Component({
  selector: "book-intro",
  standalone: true,
  // forwardRef: sidebars render a nested <book-intro>.
  imports: [forwardRef(() => BookIntroComponent)],
  templateUrl: "./book-intro.component.html",
  styleUrl: "./book-intro.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookIntroComponent implements OnChanges {
  @Input()
  introduction: IntroElement[] = []

  displayElements: IntroDisplayElement[] = []

  ngOnChanges(): void {
    this.displayElements = this.buildDisplayElements(this.introduction)
  }

  /**
   * Merges each section header with the paragraph right after it, so the
   * header renders inline with the body as in the printed edition.
   */
  private buildDisplayElements(
    elements: IntroElement[],
  ): IntroDisplayElement[] {
    const result: IntroDisplayElement[] = []
    let i = 0

    while (i < elements.length) {
      const el = elements[i]

      if (el.type === "introListItem") {
        // One real list, so screen readers announce it as a list.
        const items: IntroListItem[] = []
        while (i < elements.length && elements[i].type === "introListItem") {
          items.push(elements[i] as IntroListItem)
          i++
        }
        result.push({ kind: "list", items })
      } else if (
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
