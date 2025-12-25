import { CommonModule } from "@angular/common"
// biome-ignore lint/style/useImportType: <explanation>
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit } from "@angular/core"
import { RouterModule } from "@angular/router"
import {
  BibleReference,
  BibleReferenceService,
  VerseReference,
} from "../../services/bible-reference.service"
import { VerseSectionComponent } from "../verse-section/verse-section.component"
import {
  MatBottomSheet,
  MatBottomSheetModule,
} from "@angular/material/bottom-sheet"
import { FootnotesBottomSheetComponent } from "../footnotes-bottom-sheet/footnotes-bottom-sheet.component"

@Component({
  selector: "verse",
  imports: [
    CommonModule,
    VerseSectionComponent,
    RouterModule,
    MatBottomSheetModule,
  ],
  templateUrl: "./verse.component.html",
  styleUrls: ["./verse.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class VerseComponent implements OnInit, OnDestroy {
  isChapterNumberDisplayed = false
  chapterNumberIndex = 0
  skip = false

  @Input()
  data!: Verse

  // Gesture handling properties
  private readonly LONG_PRESS_MS = 500
  private readonly MOVE_THRESHOLD_PX = 10
  private readonly SYNTHETIC_CLICK_THRESHOLD_MS = 500
  private longPressTimer: number | null = null
  private gestureStartX = 0
  private gestureStartY = 0
  private isLongPress = false
  private lastTouchTime = 0

  // Selection and share properties
  showShareButton = false
  shareButtonX = 0
  shareButtonY = 0
  private selectionChangeListener: (() => void) | null = null

  constructor(
    private bibleRef: BibleReferenceService,
    private bottomSheet: MatBottomSheet,
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef,
  ) {}

  ngOnInit(): void {
    // Listen to selection changes
    this.selectionChangeListener = () => this.onSelectionChange()
    document.addEventListener('selectionchange', this.selectionChangeListener)
  }

  ngOnDestroy(): void {
    // Clean up listeners
    if (this.selectionChangeListener) {
      document.removeEventListener('selectionchange', this.selectionChangeListener)
    }
    this.clearLongPressTimer()
  }

  // Gesture handling methods
  onGestureStart(event: TouchEvent | MouseEvent): void {
    const isTouch = event.type.startsWith('touch')
    
    if (isTouch) {
      const touchEvent = event as TouchEvent
      // For touchstart, touches should always have at least one touch
      // But we'll add a safety check anyway
      if (!touchEvent.touches || touchEvent.touches.length === 0) return
      const touch = touchEvent.touches[0]
      this.gestureStartX = touch.clientX
      this.gestureStartY = touch.clientY
      this.lastTouchTime = Date.now()
    } else {
      this.gestureStartX = (event as MouseEvent).clientX
      this.gestureStartY = (event as MouseEvent).clientY
    }

    this.isLongPress = false
    this.clearLongPressTimer()
    
    this.longPressTimer = window.setTimeout(() => {
      this.isLongPress = true
    }, this.LONG_PRESS_MS)
  }

  onGestureMove(event: TouchEvent | MouseEvent): void {
    const isTouch = event.type.startsWith('touch')
    let currentX: number
    let currentY: number

    if (isTouch) {
      const touchEvent = event as TouchEvent
      // For touchmove, touches should always have at least one touch
      // But we'll add a safety check anyway
      if (!touchEvent.touches || touchEvent.touches.length === 0) return
      const touch = touchEvent.touches[0]
      currentX = touch.clientX
      currentY = touch.clientY
    } else {
      currentX = (event as MouseEvent).clientX
      currentY = (event as MouseEvent).clientY
    }

    const deltaX = Math.abs(currentX - this.gestureStartX)
    const deltaY = Math.abs(currentY - this.gestureStartY)

    if (deltaX > this.MOVE_THRESHOLD_PX || deltaY > this.MOVE_THRESHOLD_PX) {
      this.clearLongPressTimer()
    }
  }

  onGestureEnd(event: TouchEvent | MouseEvent): void {
    const wasLongPress = this.isLongPress
    this.clearLongPressTimer()

    // For touch events, prevent synthetic click if it was a tap
    if (event.type.startsWith('touch') && !wasLongPress) {
      // Will be a tap, footnotes will open
    }

    // Open footnotes on short tap (not long press)
    if (!wasLongPress && this.containsFootnotes()) {
      this.toggleFootnotes()
    }
  }

  onClick(event: MouseEvent): void {
    // Suppress synthetic click after touch
    const timeSinceTouch = Date.now() - this.lastTouchTime
    if (timeSinceTouch < this.SYNTHETIC_CLICK_THRESHOLD_MS) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
  }

  private clearLongPressTimer(): void {
    if (this.longPressTimer !== null) {
      window.clearTimeout(this.longPressTimer)
      this.longPressTimer = null
    }
  }

  // Selection handling methods
  private onSelectionChange(): void {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      this.hideShareButton()
      return
    }

    const range = selection.getRangeAt(0)
    if (range.collapsed) {
      this.hideShareButton()
      return
    }

    // Check if selection is within this verse component instance
    // Handle both Element and Text nodes for commonAncestorContainer
    const verseElement = this.elementRef.nativeElement
    let containerNode: Node | null = range.commonAncestorContainer
    
    // If it's a text node, use its parent element
    if (containerNode.nodeType === Node.TEXT_NODE) {
      containerNode = containerNode.parentElement
    }
    
    if (!verseElement || !containerNode || !verseElement.contains(containerNode)) {
      this.hideShareButton()
      return
    }

    // Position share button near the selection
    const rect = range.getBoundingClientRect()
    this.shareButtonX = rect.left + (rect.width / 2)
    this.shareButtonY = rect.top - 40 // Above the selection
    this.showShareButton = true
    this.cdr.markForCheck()
  }

  private hideShareButton(): void {
    if (this.showShareButton) {
      this.showShareButton = false
      this.cdr.markForCheck()
    }
  }

  async shareSelection(): Promise<void> {
    const selection = window.getSelection()
    if (!selection) return

    const text = selection.toString().trim()
    if (!text) return

    // Try Web Share API first
    if (navigator.share) {
      try {
        await navigator.share({
          text: text,
          title: 'Bible Verse',
        })
        return
      } catch (err) {
        // User cancelled or error, fall through to clipboard
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Share failed:', err)
        }
      }
    }

    // Fallback to clipboard
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        // Legacy fallback
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      // Minimal feedback - could add a toast notification here
      console.log('Text copied to clipboard')
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

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

  getVerseQueryParams(verses?: VerseReference[]) {
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

  containsFootnotes(): boolean {
    return this.data.text.some((t) => t.type === "footnote")
  }

  toggleFootnotes(): void {
    const footnotes = this.data.text.filter((t) => t.type === "footnote")
    if (footnotes.length === 0) return
    this.bottomSheet.open(FootnotesBottomSheetComponent, {
      data: { footnotes, verse: this.data },
    })
  }
}
