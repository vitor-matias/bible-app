import { CommonModule } from "@angular/common"
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  QueryList,
  SimpleChanges,
  ViewChildren,
} from "@angular/core"
import {
  MatBottomSheet,
  MatBottomSheetModule,
} from "@angular/material/bottom-sheet"
import { RouterModule } from "@angular/router"
import {
  type BibleReference,
  BibleReferenceService,
} from "../../services/bible-reference.service"
import { FootnotesBottomSheetComponent } from "../footnotes-bottom-sheet/footnotes-bottom-sheet.component"
import { VerseSectionComponent } from "../verse-section/verse-section.component"
import { getVerseQueryParams, parseReferences } from "./verse.utils"

@Component({
  selector: "verse",
  imports: [
    CommonModule,
    RouterModule,
    MatBottomSheetModule,
    VerseSectionComponent,
  ],
  templateUrl: "./verse.component.html",
  styleUrls: ["./verse.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class VerseComponent implements OnChanges, AfterViewInit, OnDestroy {
  /** Pre-computed index where the chapter number should be displayed, or -1 */
  chapterNumberDisplayIndex = -1

  /** Pre-computed: does this verse have footnotes? */
  hasFootnotes = false

  private resizeObserver: ResizeObserver | null = null
  private resizeObserverTimeout: ReturnType<typeof setTimeout> | null = null

  /** Pre-computed parsed references keyed by text index */
  parsedReferences: Map<number, (string | BibleReference)[]> = new Map()

  @Input()
  data!: Verse

  @Input()
  nextVerseStartsWithQuote = false

  @ViewChildren("indentable")
  indentableElements!: QueryList<ElementRef<HTMLElement>>

  constructor(
    private bibleRef: BibleReferenceService,
    private bottomSheet: MatBottomSheet,
  ) {}

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.data) {
      this.chapterNumberDisplayIndex = this.computeChapterNumberIndex()
      this.hasFootnotes = this.data.text.some((t) => t.type === "footnote")
      this.parsedReferences = this.computeParsedReferences()
    }
  }

  ngAfterViewInit(): void {
    if (typeof window !== "undefined" && "ResizeObserver" in window) {
      this.setupResizeObserver()

      this.indentableElements.changes.subscribe(() => {
        this.updateIndentableElements()
      })
    }
  }

  ngOnDestroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }
    if (this.resizeObserverTimeout) {
      clearTimeout(this.resizeObserverTimeout)
    }
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      // Debounce the calculation slightly to avoid excessive layout thrashing
      if (this.resizeObserverTimeout) {
        clearTimeout(this.resizeObserverTimeout)
      }
      this.resizeObserverTimeout = setTimeout(() => {
        this.updateIndentation()
      }, 50)
    })

    this.updateIndentableElements()
  }

  private updateIndentableElements(): void {
    if (!this.resizeObserver) return

    this.resizeObserver.disconnect()

    // Always observe the chapter number if it exists
    const chapterNumberEl = this.getChapterNumberEl()
    if (chapterNumberEl) {
      this.resizeObserver.observe(chapterNumberEl)
    }

    // Observe indentable elements
    this.indentableElements.forEach((el) => {
      if (el.nativeElement) {
        this.resizeObserver?.observe(el.nativeElement)
      }
    })

    this.updateIndentation()
  }

  private getChapterNumberEl(): HTMLElement | null {
    if (!this.indentableElements || this.indentableElements.length === 0)
      return null
    return (
      this.indentableElements.first.nativeElement.closest("verse") ?? document
    ).querySelector(".chapterNumber") as HTMLElement | null
  }

  private updateIndentation(): void {
    if (!this.indentableElements) return

    const chapterNumberEl = this.getChapterNumberEl()

    this.indentableElements.forEach((el) => {
      const element = el.nativeElement
      if (!chapterNumberEl) {
        element.classList.add("indent")
        return
      }

      // We still need to do getBoundingClientRect here, but because it's in a ResizeObserver
      // microtask/timeout and NOT in ngAfterViewChecked, it doesn't cause synchronous
      // layout thrashing during the Angular digest cycle.
      const chapterRect = chapterNumberEl.getBoundingClientRect()
      const elRect = element.getBoundingClientRect()
      const isTouching =
        chapterRect.bottom >= elRect.top && chapterRect.top <= elRect.bottom

      if (isTouching) {
        element.classList.remove("indent")
      } else {
        element.classList.add("indent")
      }
    })
  }

  getFirstTextType(): string | undefined {
    return this.data.text.find(
      (t) => t.type !== "footnote" && t.type !== "references",
    )?.type
  }

  isFirstDisplayableElement(index: number): boolean {
    const firstIdx = this.data.text.findIndex(
      (t) => t.type !== "footnote" && t.type !== "references",
    )
    return index === firstIdx
  }

  checkNextIsQuote(i: number): boolean {
    const sectionText = this.getDataForSection(i).text
    const lastElementIndex = i + sectionText.length - 1

    if (lastElementIndex + 1 < this.data.text.length) {
      const nextDisplayableIdx = this.data.text.findIndex(
        (t, idx) =>
          idx > lastElementIndex &&
          t.type !== "footnote" &&
          t.type !== "references",
      )

      if (nextDisplayableIdx !== -1) {
        return this.data.text[nextDisplayableIdx].type === "quote"
      }
    }

    return this.nextVerseStartsWithQuote
  }

  private computeChapterNumberIndex(): number {
    if (this.data.number !== 0) return -1

    const hasS2 = this.data.text.some(
      (text) => text.type === "section" && text.tag === "s2",
    )

    for (let i = 0; i < this.data.text.length; i++) {
      const text = this.data.text[i]
      const isLast = i === this.data.text.length - 1

      if (
        (text.type === "section" && text.tag === "s2") ||
        (!hasS2 && isLast)
      ) {
        return i
      }
    }

    return -1
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
      if (
        afterText[index].type === "paragraph" ||
        (afterText[index].type === "quote" && index > 0)
      ) {
        break
      }
      sectionText.push(afterText[index])
    }

    return { ...this.data, text: sectionText }
  }

  shouldShowParagraph(data: Verse, text: Paragraph, i: number): boolean {
    return (
      data.number > 0 &&
      ((data.text[i - 1]?.type !== "section" &&
        data.text[i - 1]?.type !== "references" &&
        (data.text[i - 1]?.type !== "paragraph" ||
          (data.text[i - 1]?.type === "paragraph" && text.text.length > 2))) ||
        data.bookId === "psa")
    )
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

  toggleFootnotes(): void {
    const footnotes = this.data.text.filter((t) => t.type === "footnote")
    if (footnotes.length === 0) return
    this.bottomSheet.open(FootnotesBottomSheetComponent, {
      data: { footnotes, verse: this.data },
    })
  }
}
