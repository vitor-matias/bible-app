import { CommonModule } from "@angular/common"
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  QueryList,
  SimpleChanges,
  ViewChild,
  ViewChildren,
} from "@angular/core"
import {
  MatBottomSheet,
  MatBottomSheetModule,
} from "@angular/material/bottom-sheet"
import { RouterModule } from "@angular/router"
import { Subscription } from "rxjs"
import {
  type BibleReference,
  BibleReferenceService,
} from "../../services/bible-reference.service"
import type { HighlightColor } from "../../services/highlight.service"
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
  host: {
    "[class.verse-selected]": "selected",
    "[class.verse-quotation]": "isQuotation",
    "[class.verse-marked]": "highlight",
    "[attr.data-highlight]": "highlight ?? null",
  },
})
export class VerseComponent implements OnChanges, AfterViewInit, OnDestroy {
  /** Pre-computed index where the chapter number should be displayed, or -1 */
  chapterNumberDisplayIndex = -1

  /** Pre-computed: does this verse have footnotes? */
  hasFootnotes = false

  /**
   * Whether this verse's poetry is a passage being quoted, rather than the
   * verse form the book is written in.
   *
   * Decided by the reader, not here: a quotation runs across verses, and its
   * later verses look exactly like a psalm from inside a single verse. See
   * BibleReaderComponent.markQuotationVerses.
   */
  @Input()
  isQuotation = false

  /** Groups for rendering - quotes and their continuations */
  displayGroups: DisplayGroup[] = []

  private resizeObserver: ResizeObserver | null = null
  private resizeObserverTimeout: ReturnType<typeof setTimeout> | null = null

  /** Pre-computed parsed references keyed by text index */
  parsedReferences: Map<number, (string | BibleReference)[]> = new Map()

  /**
   * Pre-computed "the element after this section is a quote" flag by text
   * index. The template asks for it twice per section, and change detection
   * runs once per animation frame while auto-scrolling, so it is computed with
   * the rest of the derived state instead of on every pass.
   */
  nextIsQuoteStates: Record<number, boolean> = {}

  @Input()
  data!: Verse

  @Input()
  chapterNumber?: number

  @Input()
  nextVerseStartsWithQuote = false

  /**
   * Study mode turns the verse into the study panel's selector: a click picks
   * the verse instead of opening the footnotes sheet, which in that layout is
   * a column already on screen.
   */
  @Input()
  studyMode = false

  /** True while this verse is the one the study panel is showing. */
  @Input()
  selected = false

  /**
   * The colour the reader has marked this verse with, if any. Rendered
   * everywhere, not only in study mode: marks are made there, but they are
   * part of the text from then on.
   */
  @Input()
  highlight?: HighlightColor

  @Output()
  verseSelected = new EventEmitter<VerseSelection>()

  @ViewChildren("indentable")
  indentableElements!: QueryList<ElementRef<HTMLElement>>

  @ViewChild("chapterNumber")
  chapterNumberRef?: ElementRef<HTMLElement>

  private indentableSubscription: Subscription | undefined

  // Track the indentation state of each #indentable element by data-index
  // so the template can bind to this state rather than us directly mutating the DOM
  indentStates: Record<number, boolean> = {}

  constructor(
    private bibleRef: BibleReferenceService,
    private bottomSheet: MatBottomSheet,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.data) {
      this.chapterNumberDisplayIndex = this.computeChapterNumberIndex()
      this.hasFootnotes = this.data.text.some((t) => t.type === "footnote")
      this.parsedReferences = this.computeParsedReferences()
      this.displayGroups = this.computeDisplayGroups()
      this.nextIsQuoteStates = this.computeNextIsQuoteStates()
    }
  }

  ngAfterViewInit(): void {
    if (typeof window !== "undefined" && "ResizeObserver" in window) {
      this.setupResizeObserver()

      this.indentableSubscription = this.indentableElements.changes.subscribe(
        () => {
          this.updateIndentableElements()
        },
      )
    }
  }

  ngOnDestroy(): void {
    if (this.indentableSubscription) {
      this.indentableSubscription.unsubscribe()
    }
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

    // Reset indent states – entries are computed by updateIndentation()
    this.indentStates = {}

    // Observe indentable elements
    this.indentableElements.forEach((el) => {
      if (el.nativeElement) {
        this.resizeObserver?.observe(el.nativeElement)
      }
    })

    this.updateIndentation()
  }

  private getChapterNumberEl(): HTMLElement | null {
    return this.chapterNumberRef?.nativeElement || null
  }

  private updateIndentation(): void {
    if (!this.indentableElements) return

    const chapterNumberEl = this.getChapterNumberEl()

    const newIndentStates: Record<number, boolean> = {}

    this.indentableElements.forEach((el) => {
      const element = el.nativeElement
      const dataIndexStr = element.getAttribute("data-index")
      if (dataIndexStr === null) return

      const i = parseInt(dataIndexStr, 10)

      if (!chapterNumberEl) {
        newIndentStates[i] = true
        return
      }

      // We still need to do getBoundingClientRect here, but because it's in a ResizeObserver
      // microtask/timeout and NOT in ngAfterViewChecked, it doesn't cause synchronous
      // layout thrashing during the Angular digest cycle.
      const chapterRect = chapterNumberEl.getBoundingClientRect()
      const elRect = element.getBoundingClientRect()
      // Use a small vertical buffer to avoid issues with display: block and line heights
      const isTouching =
        chapterRect.bottom > elRect.top + 2 &&
        chapterRect.top < elRect.bottom - 2

      newIndentStates[i] = !isTouching
    })

    // Only update if changes occurred to avoid unnecessary CD triggers
    const hasChanges =
      Object.keys(newIndentStates).length !==
        Object.keys(this.indentStates).length ||
      Object.keys(newIndentStates).some(
        (key) =>
          newIndentStates[Number(key)] !== this.indentStates[Number(key)],
      )
    if (hasChanges) {
      this.indentStates = newIndentStates
      this.cdr.detectChanges()
    }
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

  private computeNextIsQuoteStates(): Record<number, boolean> {
    const states: Record<number, boolean> = {}
    this.data.text.forEach((_, index) => {
      states[index] = this.checkNextIsQuote(index)
    })
    return states
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

  checkNextIsParagraph(i: number): boolean {
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
        return this.data.text[nextDisplayableIdx].type === "paragraph"
      }
    }
    return false
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

  getQuoteIdentLevel(text: TextType): number {
    return text.type === "quote" ? text.identLevel : 0
  }

  /**
   * Anywhere in the verse selects it, so the reader can aim at the words they
   * are reading rather than at a control. References inside the verse stay
   * links: they navigate, and selecting the verse they are leaving would be
   * beside the point.
   */
  @HostListener("click", ["$event"])
  onHostClick(event: Event): void {
    if (!this.studyMode || !this.isSelectable) return
    const target = event.target as HTMLElement | null
    if (target?.closest("a")) return
    this.emitSelection()
  }

  /** A run only carries a handler when the verse has footnotes to open. */
  onRunClick(event: Event): void {
    // Study mode has no bottom sheet: the host listener above takes the click.
    if (this.studyMode) return
    this.toggleFootnotes(event)
  }

  onFootnoteMarkerClick(event: Event): void {
    // Verse 0 carries the chapter's front matter, footnotes included, and
    // cannot be selected — so in study mode too the marker opens the sheet
    // rather than doing nothing at all.
    if (!this.studyMode || !this.isSelectable) {
      this.toggleFootnotes(event)
      return
    }
    // Stop the host listener from following with a plain selection, which
    // would land the reader on the references tab they did not ask for.
    event.stopPropagation()
    this.emitSelection("footnotes")
  }

  onVerseNumberKeydown(event: Event): void {
    if (!this.studyMode || !this.isSelectable) return
    event.preventDefault()
    this.emitSelection()
  }

  /** Verse 0 is the chapter's front matter: there is no verse to point at. */
  get isSelectable(): boolean {
    return this.studyMode && this.data?.number > 0
  }

  private emitSelection(panel?: VerseSelection["panel"]): void {
    if (!this.isSelectable) return
    this.verseSelected.emit({ verse: this.data, panel })
  }

  toggleFootnotes(event?: Event): void {
    const footnotes = this.data.text.filter((t) => t.type === "footnote")
    if (footnotes.length === 0) return
    // Capture the marker that opened the sheet so we can restore focus to it
    // ourselves. We disable Material's automatic restoreFocus because its
    // .focus() scrolls the marker into view, which in paged (column) mode
    // yanks the reader back to the start of the chapter. Refocusing with
    // preventScroll keeps a11y intact without moving the page.
    const trigger = event?.currentTarget as HTMLElement | null
    const ref = this.bottomSheet.open(FootnotesBottomSheetComponent, {
      data: { footnotes, verse: this.data },
      restoreFocus: false,
    })
    ref.afterDismissed().subscribe(() => {
      trigger?.focus({ preventScroll: true })
    })
  }

  /**
   * An element that carries no words and no structure. The USFM the edition
   * is built from leaves empty text and poetry elements behind, and each one
   * rendered a stray blank line in the middle of a verse — visible in the
   * psalms, where a run of poetry could be split in two by a gap that is in
   * no printed edition.
   *
   * A paragraph element is never blank in this sense, however empty its text:
   * the element IS the paragraph break, and dropping the empty ones ran the
   * new paragraph on into the end of the previous one.
   */
  static isBlank(text: TextType): boolean {
    return (
      (text.type === "quote" || text.type === "text") && text.text.trim() === ""
    )
  }

  private computeDisplayGroups(): DisplayGroup[] {
    const groups: DisplayGroup[] = []
    let currentGroup: DisplayGroup | null = null

    this.data.text.forEach((text, originalIndex) => {
      if (VerseComponent.isBlank(text)) return

      // Elements that should be considered continuation if they follow a quote
      const isContinuationType =
        text.type === "text" ||
        text.type === "references" ||
        text.type === "footnote"

      if (text.type === "quote") {
        // Start a new quote group
        currentGroup = {
          type: "quote",
          elements: [{ data: text, originalIndex }],
        }
        groups.push(currentGroup)
      } else if (currentGroup?.type === "quote" && isContinuationType) {
        // Continue existing quote group
        currentGroup.elements.push({ data: text, originalIndex })
      } else {
        // Start or continue a normal group
        if (currentGroup?.type !== "normal") {
          currentGroup = {
            type: "normal",
            elements: [{ data: text, originalIndex }],
          }
          groups.push(currentGroup)
        } else {
          currentGroup.elements.push({ data: text, originalIndex })
        }
      }
    })

    return groups
  }
}

interface DisplayElement {
  data: TextType
  originalIndex: number
}

interface DisplayGroup {
  type: "normal" | "quote"
  elements: DisplayElement[]
}
