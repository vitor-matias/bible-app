import { isPlatformBrowser } from "@angular/common"
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  Input,
  inject,
  PLATFORM_ID,
} from "@angular/core"
import { MatIconModule } from "@angular/material/icon"
import {
  HIGHLIGHT_COLORS,
  type HighlightColor,
  HighlightService,
} from "../../services/highlight.service"

/** Where the bar sits, in viewport coordinates. */
type BarPosition = { top: number; left: number }

/** Keeps the bar from being pushed off either edge on a narrow window. */
const EDGE_MARGIN = 8
/** Roughly the bar's own width; used only to keep it on screen. */
const BAR_WIDTH = 210
const BAR_HEIGHT = 44

/**
 * Actions on whatever the reader has selected: mark it, or copy it.
 *
 * Built on the browser's own text selection rather than on tapping a verse,
 * which is what makes it work everywhere — both reading layouts, mouse and
 * touch alike — and what lets it act on a phrase or a run of verses rather
 * than only on whole ones. Tapping a verse already means something else in
 * each layout (footnotes in the reader, selection in study mode), so this
 * takes a gesture that meant nothing before.
 */
@Component({
  selector: "selection-actions",
  standalone: true,
  imports: [MatIconModule],
  templateUrl: "./selection-actions.component.html",
  styleUrl: "./selection-actions.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectionActionsComponent {
  @Input() book?: Book
  @Input() chapter: Chapter | null = null

  readonly colors = HIGHLIGHT_COLORS
  position: BarPosition | null = null
  /** The verses the selection touches, in order. */
  verses: Verse["number"][] = []
  copied = false

  private selectedText = ""
  private frame?: number
  private copiedTimer?: ReturnType<typeof setTimeout>

  private readonly highlights = inject(HighlightService)
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly platformId = inject(PLATFORM_ID)

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return

    const onChange = () => this.scheduleSync()
    document.addEventListener("selectionchange", onChange)
    // A selection stays put while the page moves under it, so the bar has to
    // move with it rather than pointing at where the words used to be.
    window.addEventListener("scroll", onChange, true)
    window.addEventListener("resize", onChange)

    const destroyRef = inject(DestroyRef)
    destroyRef.onDestroy(() => {
      document.removeEventListener("selectionchange", onChange)
      window.removeEventListener("scroll", onChange, true)
      window.removeEventListener("resize", onChange)
      if (this.frame !== undefined) cancelAnimationFrame(this.frame)
      if (this.copiedTimer) clearTimeout(this.copiedTimer)
    })
  }

  /** Selection changes arrive far faster than the bar needs to move. */
  private scheduleSync(): void {
    if (this.frame !== undefined) return
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined
      this.sync()
    })
  }

  private sync(): void {
    const selection = document.getSelection()
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      this.hide()
      return
    }

    const range = selection.getRangeAt(0)
    const verses = SelectionActionsComponent.versesIn(range)
    const text = SelectionActionsComponent.textFrom(range)
    if (!verses.length || !text) {
      this.hide()
      return
    }

    const rect = range.getBoundingClientRect()
    if (!rect.width && !rect.height) {
      this.hide()
      return
    }

    this.verses = verses
    this.selectedText = text
    this.position = SelectionActionsComponent.place(rect)
    this.cdr.detectChanges()
  }

  private hide(): void {
    if (!this.position) return
    this.position = null
    this.verses = []
    this.selectedText = ""
    this.copied = false
    this.cdr.detectChanges()
  }

  /**
   * The words in a range, as a reader would quote them.
   *
   * Built from the range's own contents rather than from
   * `Selection.toString()`, which carries the verse numbers along: they are
   * marked unselectable, but that only governs what a drag can take, not what
   * a range reports. Line breaks in poetry are kept — a psalm quoted as one
   * long line is not the psalm — while the spaces that separate verses on
   * screen are collapsed, so nothing trails off the end.
   */
  private static textFrom(range: Range): string {
    const fragment = range.cloneContents()
    for (const apparatus of Array.from(
      fragment.querySelectorAll(
        ".verseNumber, .footnoteIndicator, .quoteVerseNumber",
      ),
    )) {
      apparatus.remove()
    }

    const read = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ""
      if (node.nodeName === "BR") return "\n"
      return Array.from(node.childNodes).map(read).join("")
    }

    return read(fragment)
      .replace(/[^\S\n]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim()
  }

  /** The verse numbers a range touches, read off the elements it crosses. */
  private static versesIn(range: Range): Verse["number"][] {
    const root = document.querySelector(".bookBlock")
    if (!root) return []
    return (
      Array.from(root.querySelectorAll("verse"))
        .filter((element) => range.intersectsNode(element))
        .map((element) => Number(element.id))
        // Verse 0 is the chapter's front matter, not a verse to mark.
        .filter((number) => Number.isFinite(number) && number > 0)
    )
  }

  /** Above the selection, nudged back on screen at the edges. */
  private static place(rect: DOMRect): BarPosition {
    const top =
      rect.top > BAR_HEIGHT + EDGE_MARGIN
        ? rect.top - BAR_HEIGHT
        : rect.bottom + EDGE_MARGIN
    const wanted = rect.left + rect.width / 2 - BAR_WIDTH / 2
    const left = Math.min(
      Math.max(EDGE_MARGIN, wanted),
      window.innerWidth - BAR_WIDTH - EDGE_MARGIN,
    )
    return { top, left }
  }

  /** "22,37" or "22,37-39" — what the selection covers. */
  get reference(): string {
    const chapter = this.chapter?.number
    if (chapter === undefined || !this.verses.length) return ""
    const first = this.verses[0]
    const last = this.verses[this.verses.length - 1]
    return first === last
      ? `${chapter},${first}`
      : `${chapter},${first}-${last}`
  }

  mark(color: HighlightColor): void {
    if (!this.book || !this.chapter) return
    for (const verse of this.verses) {
      // Marking a run of verses sets them all to the chosen colour rather
      // than toggling each, which would leave the ones already marked bare.
      if (
        this.highlights.colorFor(this.book.id, this.chapter.number, verse) !==
        color
      ) {
        this.highlights.toggle(this.book.id, this.chapter.number, verse, color)
      }
    }
    this.dismissSelection()
  }

  clearMarks(): void {
    if (!this.book || !this.chapter) return
    for (const verse of this.verses) {
      this.highlights.clear(this.book.id, this.chapter.number, verse)
    }
    this.dismissSelection()
  }

  async copy(): Promise<void> {
    const reference = this.book
      ? `${this.book.shortName} ${this.reference}`
      : ""
    try {
      await navigator.clipboard.writeText(
        reference ? `${this.selectedText} (${reference})` : this.selectedText,
      )
      this.copied = true
      this.cdr.detectChanges()
      if (this.copiedTimer) clearTimeout(this.copiedTimer)
      this.copiedTimer = setTimeout(() => {
        this.dismissSelection()
      }, 900)
    } catch {
      // No clipboard, or permission refused: the text is still selected, so
      // the reader can copy it the usual way.
    }
  }

  /** Letting the selection go is what takes the bar away. */
  private dismissSelection(): void {
    document.getSelection()?.removeAllRanges()
    this.hide()
  }
}
