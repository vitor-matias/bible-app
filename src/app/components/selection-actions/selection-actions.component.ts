import { LiveAnnouncer } from "@angular/cdk/a11y"
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
import { MatSnackBar } from "@angular/material/snack-bar"
import {
  HIGHLIGHT_COLOR_NAMES,
  HIGHLIGHT_COLORS,
  type HighlightColor,
  HighlightService,
} from "../../services/highlight.service"
import { formatPassage } from "../../utils/text"

/** Where the bar sits, in viewport coordinates. */
type BarPosition = {
  top: number
  left: number
  /** Set under the selection, for want of room above it. */
  below: boolean
  /** Where the selection's middle is, across the bar, for it to grow from. */
  originX: number
}

/** Keeps the bar from being pushed off either edge on a narrow window. */
const EDGE_MARGIN = 8
/** Roughly the bar's own width; used only to keep it on screen. */
const BAR_WIDTH = 210
const BAR_HEIGHT = 44
/** How long a destructive action can be taken back. */
const UNDO_WINDOW_MS = 6000

/**
 * What the page prints around the words without being the words: numbers,
 * footnote markers, headings, the cross references set inline. None of it
 * belongs in a quotation, and none of it makes a verse "selected".
 */
const APPARATUS =
  ".verseNumber, .footnoteIndicator, .quoteVerseNumber, .chapterNumber, " +
  ".references, h3, verse-section"
/** The passage study mode opens beside the chapter. */
const PARALLEL = ".study-parallel"
const PARALLEL_ID_PREFIX = "parallel-"

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
  /** The passage study mode has open beside the chapter, if there is one. */
  @Input() parallelBook?: Book
  @Input() parallelChapter: Chapter | null = null

  /**
   * The book and chapter the selection was made in. Two texts can be on
   * screen, and a selection in the second marked, and was cited as, the same
   * verse numbers of the first.
   */
  private source: { book: Book; chapter: Chapter } | null = null

  readonly colors = HIGHLIGHT_COLORS
  readonly colorNames = HIGHLIGHT_COLOR_NAMES
  position: BarPosition | null = null
  /** The verses the selection touches, in order. */
  verses: Verse["number"][] = []
  copied = false
  /** The clipboard refused: shown, since a silent failure reads as no press. */
  copyFailed = false

  private selectedText = ""
  private frame?: number
  private copiedTimer?: ReturnType<typeof setTimeout>

  private readonly highlights = inject(HighlightService)
  private readonly snackBar = inject(MatSnackBar)
  private readonly announcer = inject(LiveAnnouncer)
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

    const chosen = selection.getRangeAt(0)
    const block = SelectionActionsComponent.blockFor(chosen)
    const source = block ? this.sourceOf(block) : null
    const range =
      block && source
        ? SelectionActionsComponent.clipToBlock(chosen, block)
        : null
    const verses =
      range && block ? SelectionActionsComponent.versesIn(range, block) : []
    const text = range ? SelectionActionsComponent.textFrom(range) : ""
    if (!range || !source || !verses.length || !text) {
      this.hide()
      return
    }

    const rect = range.getBoundingClientRect()
    if (!rect.width && !rect.height) {
      this.hide()
      return
    }

    // A new selection made while the last one still says "copied" is not
    // copied, and the timer that was going to dismiss the old one must not
    // dismiss this one instead.
    if (text !== this.selectedText) this.resetCopied()
    this.source = source
    this.verses = verses
    this.selectedText = text
    this.position = SelectionActionsComponent.place(rect)
    this.cdr.detectChanges()
  }

  private hide(): void {
    if (!this.position) return
    this.position = null
    this.source = null
    this.verses = []
    this.selectedText = ""
    this.resetCopied()
    this.cdr.detectChanges()
  }

  private resetCopied(): void {
    this.copied = false
    this.copyFailed = false
    if (this.copiedTimer) clearTimeout(this.copiedTimer)
    this.copiedTimer = undefined
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
    for (const apparatus of Array.from(fragment.querySelectorAll(APPARATUS))) {
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

  /**
   * The verses a range takes words from, read off the elements it crosses.
   *
   * Touching a verse is not enough: the space between two verses belongs to
   * the second one, so a selection that runs a character past the end of
   * verse 37 touches verse 38 without taking a word of it.
   */
  private static versesIn(range: Range, block: Element): Verse["number"][] {
    return (
      Array.from(block.querySelectorAll("verse"))
        .filter((element) =>
          SelectionActionsComponent.takesWordsOf(range, element),
        )
        // The passage beside the chapter prefixes its ids, the two texts
        // being one document: "parallel-12" is its verse 12.
        .map((element) => Number(element.id.replace(PARALLEL_ID_PREFIX, "")))
        // Verse 0 is the chapter's front matter, not a verse to mark.
        .filter((number) => Number.isFinite(number) && number > 0)
    )
  }

  private static takesWordsOf(range: Range, verse: Element): boolean {
    if (!range.intersectsNode(verse)) return false
    const within = range.cloneRange()
    const whole = document.createRange()
    whole.selectNodeContents(verse)
    if (within.compareBoundaryPoints(Range.START_TO_START, whole) < 0) {
      within.setStart(whole.startContainer, whole.startOffset)
    }
    if (within.compareBoundaryPoints(Range.END_TO_END, whole) > 0) {
      within.setEnd(whole.endContainer, whole.endOffset)
    }
    return SelectionActionsComponent.textFrom(within).length > 0
  }

  /**
   * The reading block a selection is in.
   *
   * Study mode renders two — the chapter and whatever is open beside it — so
   * the first block on the page is not necessarily the one being read from.
   * A selection that starts outside any block — select-all — is read against
   * the chapter.
   */
  private static blockFor(range: Range): Element | null {
    const node = range.startContainer
    const element = node instanceof Element ? node : node.parentElement
    return (
      element?.closest(".bookBlock") ??
      Array.from(document.querySelectorAll(".bookBlock")).find(
        (candidate) => !candidate.closest(PARALLEL),
      ) ??
      null
    )
  }

  /** Which text a block is, so what is done to a selection lands in it. */
  private sourceOf(block: Element): { book: Book; chapter: Chapter } | null {
    const [book, chapter] = block.closest(PARALLEL)
      ? [this.parallelBook, this.parallelChapter]
      : [this.book, this.chapter]
    return book && chapter ? { book, chapter } : null
  }

  /**
   * The part of a range that lies in the reading block: a drag that runs off
   * the last verse, or select-all, would otherwise quote the page's footer
   * and chrome along with the passage.
   */
  private static clipToBlock(range: Range, block: Element): Range | null {
    if (!range.intersectsNode(block)) return null
    const clipped = range.cloneRange()
    const whole = document.createRange()
    whole.selectNodeContents(block)
    if (clipped.compareBoundaryPoints(Range.START_TO_START, whole) < 0) {
      clipped.setStart(whole.startContainer, whole.startOffset)
    }
    if (clipped.compareBoundaryPoints(Range.END_TO_END, whole) > 0) {
      clipped.setEnd(whole.endContainer, whole.endOffset)
    }
    return clipped
  }

  /** Above the selection, nudged back on screen at the edges. */
  private static place(rect: DOMRect): BarPosition {
    const below = rect.top <= BAR_HEIGHT + EDGE_MARGIN
    const top = below ? rect.bottom + EDGE_MARGIN : rect.top - BAR_HEIGHT
    const wanted = rect.left + rect.width / 2 - BAR_WIDTH / 2
    const left = Math.min(
      Math.max(EDGE_MARGIN, wanted),
      window.innerWidth - BAR_WIDTH - EDGE_MARGIN,
    )
    const middle = rect.left + rect.width / 2
    const originX = Math.min(BAR_WIDTH, Math.max(0, middle - left))
    return { top, left, below, originX }
  }

  /** "22,37" or "22,37-39" — what the selection covers. */
  get reference(): string {
    if (!this.source || !this.verses.length) return ""
    const chapter = this.source.chapter.number
    const first = this.verses[0]
    const last = this.verses[this.verses.length - 1]
    return first === last
      ? `${chapter},${first}`
      : `${chapter},${first}-${last}`
  }

  mark(color: HighlightColor): void {
    if (!this.source) return
    const { book, chapter } = this.source
    for (const verse of this.verses) {
      // Marking a run of verses sets them all to the chosen colour rather
      // than toggling each, which would leave the ones already marked bare.
      if (this.highlights.colorFor(book.id, chapter.number, verse) !== color) {
        this.highlights.toggle(book.id, chapter.number, verse, color)
      }
    }
    this.dismissSelection()
  }

  clearMarks(): void {
    if (!this.source) return
    const { book, chapter } = this.source
    // What is about to go, so it can come back: one press takes the marks
    // off a whole run of verses, and until now took them for good.
    const taken = this.verses.flatMap((verse) => {
      const color = this.highlights.colorFor(book.id, chapter.number, verse)
      return color ? [{ verse, color }] : []
    })
    for (const { verse } of taken) {
      this.highlights.clear(book.id, chapter.number, verse)
    }
    this.dismissSelection()
    if (!taken.length) return

    this.snackBar
      .open(
        taken.length === 1
          ? "Marca retirada"
          : `${taken.length} marcas retiradas`,
        "Anular",
        { duration: UNDO_WINDOW_MS },
      )
      .onAction()
      .subscribe(() => {
        for (const { verse, color } of taken) {
          if (
            this.highlights.colorFor(book.id, chapter.number, verse) !== color
          ) {
            this.highlights.toggle(book.id, chapter.number, verse, color)
          }
        }
      })
  }

  async copy(): Promise<void> {
    const reference = this.source
      ? `${this.source.book.shortName} ${this.reference}`
      : ""
    try {
      await navigator.clipboard.writeText(
        formatPassage(this.selectedText, reference),
      )
      this.copied = true
      this.copyFailed = false
      this.cdr.detectChanges()
      void this.announcer.announce(`${reference} copiado.`)
      if (this.copiedTimer) clearTimeout(this.copiedTimer)
      this.copiedTimer = setTimeout(() => {
        this.dismissSelection()
      }, 900)
    } catch {
      // No clipboard, or permission refused: the text is still selected, so
      // the reader can copy it the usual way — once they know they have to.
      // The button used to do nothing at all, which read as a button that
      // had not been pressed.
      this.copyFailed = true
      this.cdr.detectChanges()
      void this.announcer.announce("Não foi possível copiar.")
    }
  }

  /** Letting the selection go is what takes the bar away. */
  private dismissSelection(): void {
    document.getSelection()?.removeAllRanges()
    this.hide()
  }
}
