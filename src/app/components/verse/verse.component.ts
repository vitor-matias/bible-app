import { CommonModule } from "@angular/common"
// biome-ignore lint/style/useImportType: <explanation>
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
} from "@angular/core"
import { VerseSectionComponent } from "../verse-section/verse-section.component"

@Component({
  selector: "verse",
  standalone: true,
  imports: [CommonModule, VerseSectionComponent],
  templateUrl: "./verse.component.html",
  styleUrl: "./verse.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerseComponent {
  isChapterNumberDisplayed = false
  chapterNumberIndex = 0
  skip = false

  @Input()
  data!: Verse



  constructor(private cdr: ChangeDetectorRef) {}

  shouldDisplayChapterNumber(
    data: Verse,
    text: TextType,
    index: number,
    isLast: boolean,
  ): boolean {
    if (
      !this.isChapterNumberDisplayed &&
      data.number === 0 &&
      ((text.type === "section" && text.tag === "s2") ||
        (!this.hasSection(data.text) && isLast))
    ) {
      this.isChapterNumberDisplayed = true
      this.chapterNumberIndex = index
      return true
    }
    return false
  }

  hasSection(data: TextType[]): boolean {
    return data.some((text) => text.type === "section" && text.tag === "s2")
  }

  isInSection(data: TextType[], position: number): boolean {
    const beforeData = data.slice(0, position)

    for (let i = beforeData.length - 1; i >= 0; i--) {
      const currentData = beforeData[i]
      if (currentData.type === "section" && currentData.tag === "s2") {
        return true
      }
      if (currentData.type === "paragraph" || currentData.type === "quote") {
        return false
      }
    }
    return false
  }

  getDataForSection(i: number) {
    const afterText = this.data.text.slice(i)

    const sectionText = []

    for (let index = 0; index < afterText.length; index++) {
      if (afterText[index].type === "paragraph") {
        break
      }
      sectionText.push(afterText[index])
    }

    return { ...this.data, text: sectionText }
  }

  checkIfIsTouchingChapterNumber(element: HTMLSpanElement): boolean {
    const chapterNumberElement = document.querySelector(
      ".chapterNumber",
    ) as HTMLDivElement
    if (!element || !chapterNumberElement) return false
    const rect1 = chapterNumberElement.getBoundingClientRect()
    const rect2 = element.getBoundingClientRect()

    return rect1.bottom >= rect2.top && rect1.top <= rect2.bottom
  }
}
