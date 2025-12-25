import { CommonModule } from "@angular/common"
// biome-ignore lint/style/useImportType: <explanation>
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
} from "@angular/core"
import {
  MatBottomSheet,
  MatBottomSheetModule,
} from "@angular/material/bottom-sheet"
import { RouterModule } from "@angular/router"
import {
  type BibleReference,
  BibleReferenceService,
  type VerseReference,
} from "../../services/bible-reference.service"
import { FootnotesBottomSheetComponent } from "../footnotes-bottom-sheet/footnotes-bottom-sheet.component"
import { VerseSectionComponent } from "../verse-section/verse-section.component"

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

  // Gesture handling state
  private longPressTimer: number | null = null
  private isLongPress = false
  private touchStartX = 0
  private touchStartY = 0
  private readonly LONG_PRESS_DURATION = 500 // ms
  private readonly MOVEMENT_THRESHOLD = 10 // px
  private syntheticClickSuppressed = false

  // Share button state
  showShareButton = false
  shareButtonX = 0
  shareButtonY = 0
  private selectionChangeListener: (() => void) | null = null

  @Input()
  data!: Verse

  constructor(
    private bibleRef: BibleReferenceService,
    private bottomSheet: MatBottomSheet,
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef,
  ) {}

  ngOnInit(): void {
    // Listen for selection changes
    this.selectionChangeListener = () => this.onSelectionChange()
    document.addEventListener("selectionchange", this.selectionChangeListener)
  }

  ngOnDestroy(): void {
    // Clean up event listener
    if (this.selectionChangeListener) {
      document.removeEventListener(
        "selectionchange",
        this.selectionChangeListener,
      )
    }
    this.clearLongPressTimer()
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

  // Gesture handling methods
  onTouchStart(event: TouchEvent): void {
    if (event.touches.length !== 1) return

    this.isLongPress = false
    this.syntheticClickSuppressed = false
    this.touchStartX = event.touches[0].clientX
    this.touchStartY = event.touches[0].clientY

    // Start long-press timer
    this.longPressTimer = window.setTimeout(() => {
      this.isLongPress = true
      this.clearLongPressTimer()
    }, this.LONG_PRESS_DURATION)
  }

  onTouchMove(event: TouchEvent): void {
    if (!this.longPressTimer || event.touches.length !== 1) return

    const deltaX = Math.abs(event.touches[0].clientX - this.touchStartX)
    const deltaY = Math.abs(event.touches[0].clientY - this.touchStartY)

    // Cancel long-press if moved too much
    if (deltaX > this.MOVEMENT_THRESHOLD || deltaY > this.MOVEMENT_THRESHOLD) {
      this.clearLongPressTimer()
    }
  }

  onTouchEnd(event: TouchEvent): void {
    // If long-press happened, suppress the synthetic click
    if (this.isLongPress) {
      this.syntheticClickSuppressed = true
      this.isLongPress = false
      return
    }

    this.clearLongPressTimer()

    // If timer was cleared (tap), handle as tap
    if (!this.isLongPress) {
      this.handleTap(event.target as HTMLElement)
    }
  }

  onTouchCancel(): void {
    this.clearLongPressTimer()
    this.isLongPress = false
  }

  onMouseDown(event: MouseEvent): void {
    this.isLongPress = false
    this.touchStartX = event.clientX
    this.touchStartY = event.clientY

    // Start long-press timer
    this.longPressTimer = window.setTimeout(() => {
      this.isLongPress = true
      this.clearLongPressTimer()
    }, this.LONG_PRESS_DURATION)
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.longPressTimer) return

    const deltaX = Math.abs(event.clientX - this.touchStartX)
    const deltaY = Math.abs(event.clientY - this.touchStartY)

    // Cancel long-press if moved too much
    if (deltaX > this.MOVEMENT_THRESHOLD || deltaY > this.MOVEMENT_THRESHOLD) {
      this.clearLongPressTimer()
    }
  }

  onMouseUp(): void {
    if (this.isLongPress) {
      this.isLongPress = false
      return
    }

    this.clearLongPressTimer()
  }

  onClick(event: MouseEvent): void {
    // Suppress synthetic click after touch
    if (this.syntheticClickSuppressed) {
      event.preventDefault()
      event.stopPropagation()
      this.syntheticClickSuppressed = false
      return
    }

    // Handle normal click (from mouse)
    if (!this.isLongPress) {
      this.handleTap(event.target as HTMLElement)
    }
  }

  private handleTap(target: HTMLElement): void {
    // Don't open footnotes if clicking on a link or footnote indicator
    if (
      target.tagName === "A" ||
      target.classList.contains("footnoteIndicator")
    ) {
      return
    }

    // Open footnotes for tap
    if (this.containsFootnotes()) {
      this.toggleFootnotes()
    }
  }

  private clearLongPressTimer(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer)
      this.longPressTimer = null
    }
  }

  private onSelectionChange(): void {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) {
      this.showShareButton = false
      this.cdr.markForCheck()
      return
    }

    // Check if selection is within this verse element
    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null
    if (!range) {
      this.showShareButton = false
      this.cdr.markForCheck()
      return
    }

    const verseElement = this.elementRef.nativeElement
    const isWithinVerse =
      verseElement.contains(range.startContainer) ||
      verseElement.contains(range.endContainer)

    if (isWithinVerse) {
      // Position the share button near the selection
      const rect = range.getBoundingClientRect()
      // Add boundary checks to keep button within viewport
      const buttonWidth = 80 // Approximate button width
      const buttonHeight = 40 // Approximate button height
      let x = rect.right + 10
      let y = rect.top - 5

      // Keep within horizontal bounds
      if (x + buttonWidth > window.innerWidth) {
        x = window.innerWidth - buttonWidth - 10
      }
      // Keep within vertical bounds
      if (y < 10) {
        y = 10
      }
      if (y + buttonHeight > window.innerHeight) {
        y = window.innerHeight - buttonHeight - 10
      }

      this.shareButtonX = x
      this.shareButtonY = y
      this.showShareButton = true
      this.cdr.markForCheck()
    } else {
      this.showShareButton = false
      this.cdr.markForCheck()
    }
  }

  async shareSelection(): Promise<void> {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return

    const selectedText = selection.toString().trim()
    if (!selectedText) return

    // Add verse reference
    const reference = `${this.data.bookId.toUpperCase()} ${this.data.chapterNumber}:${this.data.number}`
    const textWithReference = `${selectedText} — ${reference}`

    // Try Web Share API first
    if (navigator.share) {
      try {
        await navigator.share({
          text: textWithReference,
        })
      } catch (err) {
        // User cancelled or error occurred - silently ignore
      }
    } else {
      // Fallback to clipboard
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(textWithReference)
          // TODO: Replace alert with MatSnackBar for better UX
          alert("Copied to clipboard!")
        } else {
          // Last resort fallback using deprecated method for older browsers
          const textArea = document.createElement("textarea")
          textArea.value = textWithReference
          textArea.style.position = "fixed"
          textArea.style.left = "-999999px"
          document.body.appendChild(textArea)
          textArea.select()
          const success = document.execCommand("copy")
          document.body.removeChild(textArea)
          if (success) {
            // TODO: Replace alert with MatSnackBar for better UX
            alert("Copied to clipboard!")
          }
        }
      } catch (err) {
        // TODO: Replace alert with MatSnackBar for better UX
        alert("Failed to copy text")
      }
    }

    // Hide share button and clear selection
    this.showShareButton = false
    selection.removeAllRanges()
    this.cdr.markForCheck()
  }
}
