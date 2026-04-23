import { CommonModule } from "@angular/common"
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
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
import { FootnotesBottomSheetComponent } from "../footnotes-bottom-sheet/footnotes-bottom-sheet.component"
import { VerseSectionComponent } from "../verse-section/verse-section.component"
import {
  checkNextIsParagraph,
  checkNextIsQuote,
  computeChapterNumberIndex,
  computeDisplayGroups,
  type DisplayGroup,
  getDataForSection,
  getFirstTextType,
  getVerseQueryParams,
  isFirstDisplayableElement,
  isInSection,
  parseReferences,
  shouldShowParagraph,
} from "./verse.utils"

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
  // ── Pre-computed display state ─────────────────────────────────────────────

  /** Index where the chapter-number badge should render, or -1. */
  chapterNumberDisplayIndex = -1
  /** Whether this verse has any footnotes. */
  hasFootnotes = false
  /** Grouped text elements for rendering. */
  displayGroups: DisplayGroup[] = []
  /** Parsed inline Bible references keyed by text-array index. */
  parsedReferences: Map<number, (string | BibleReference)[]> = new Map()

  // ── Inputs ─────────────────────────────────────────────────────────────────

  @Input() data!: Verse
  @Input() chapterNumber?: number
  @Input() nextVerseStartsWithQuote = false

  // ── DOM refs ───────────────────────────────────────────────────────────────

  @ViewChildren("indentable")
  indentableElements!: QueryList<ElementRef<HTMLElement>>

  @ViewChild("chapterNumber")
  chapterNumberRef?: ElementRef<HTMLElement>

  // ── Indent state (ResizeObserver) ──────────────────────────────────────────

  /** Tracks whether each `#indentable` element should be indented. */
  indentStates: Record<number, boolean> = {}

  private resizeObserver: ResizeObserver | null = null
  private resizeObserverTimeout: ReturnType<typeof setTimeout> | null = null
  private indentableSubscription: Subscription | undefined

  constructor(
    private bibleRef: BibleReferenceService,
    private bottomSheet: MatBottomSheet,
    private cdr: ChangeDetectorRef,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.data) {
      this.chapterNumberDisplayIndex = computeChapterNumberIndex(this.data)
      this.hasFootnotes = this.data.text.some((t) => t.type === "footnote")
      this.parsedReferences = this.computeParsedReferences()
      this.displayGroups = computeDisplayGroups(this.data)
    }
  }

  ngAfterViewInit(): void {
    if (typeof window !== "undefined" && "ResizeObserver" in window) {
      this.setupResizeObserver()

      this.indentableSubscription = this.indentableElements.changes.subscribe(
        () => this.updateIndentableElements(),
      )
    }
  }

  ngOnDestroy(): void {
    this.indentableSubscription?.unsubscribe()
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    if (this.resizeObserverTimeout) {
      clearTimeout(this.resizeObserverTimeout)
    }
  }

  // ── ResizeObserver ─────────────────────────────────────────────────────────

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeObserverTimeout) {
        clearTimeout(this.resizeObserverTimeout)
      }
      this.resizeObserverTimeout = setTimeout(
        () => this.updateIndentation(),
        50,
      )
    })
    this.updateIndentableElements()
  }

  private updateIndentableElements(): void {
    if (!this.resizeObserver) return
    this.resizeObserver.disconnect()

    const chapterNumberEl = this.chapterNumberRef?.nativeElement || null
    if (chapterNumberEl) {
      this.resizeObserver.observe(chapterNumberEl)
    }

    this.indentStates = {}
    this.indentableElements.forEach((el) => {
      if (el.nativeElement) {
        this.resizeObserver?.observe(el.nativeElement)
      }
    })
    this.updateIndentation()
  }

  private updateIndentation(): void {
    if (!this.indentableElements) return

    const chapterNumberEl = this.chapterNumberRef?.nativeElement || null
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

      const chapterRect = chapterNumberEl.getBoundingClientRect()
      const elRect = element.getBoundingClientRect()
      const isTouching =
        chapterRect.bottom > elRect.top + 2 &&
        chapterRect.top < elRect.bottom - 2

      newIndentStates[i] = !isTouching
    })

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

  // ── Template-facing helpers (delegate to pure utils) ───────────────────────

  getFirstTextType(): string | undefined {
    return getFirstTextType(this.data)
  }

  isFirstDisplayableElement(index: number): boolean {
    return isFirstDisplayableElement(this.data, index)
  }

  isInSection(data: TextType[], position: number): boolean {
    return isInSection(data, position)
  }

  getDataForSection(i: number): Verse {
    return getDataForSection(this.data, i)
  }

  shouldShowParagraph(data: Verse, text: Paragraph, i: number): boolean {
    return shouldShowParagraph(data, text, i)
  }

  checkNextIsQuote(i: number): boolean {
    return checkNextIsQuote(this.data, i, this.nextVerseStartsWithQuote)
  }

  checkNextIsParagraph(i: number): boolean {
    return checkNextIsParagraph(this.data, i)
  }

  getQuoteIdentLevel(text: TextType): number {
    return text.type === "quote" ? text.identLevel : 0
  }

  getVerseQueryParams = getVerseQueryParams

  toggleFootnotes(): void {
    const footnotes = this.data.text.filter((t) => t.type === "footnote")
    if (footnotes.length === 0) return
    this.bottomSheet.open(FootnotesBottomSheetComponent, {
      data: { footnotes, verse: this.data },
    })
  }

  // ── Private ────────────────────────────────────────────────────────────────

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
}
