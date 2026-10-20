import { isPlatformBrowser } from "@angular/common"
import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  inject,
  OnChanges,
  OnDestroy,
  Output,
  PLATFORM_ID,
  Renderer2,
  SimpleChanges,
} from "@angular/core"

export interface PageState {
  isFirstPage: boolean
  isLastPage: boolean
}

// Tolerates fractional pixel scrolling values typical in zoomed or scaled displays
const SCROLL_THRESHOLD = 5
// Debounce delay to prevent resize reflow thrashing
const RESIZE_DEBOUNCE_MS = 150
// Debounce delay for processing DOM insertions (e.g. newly loaded verses)
const MUTATION_DEBOUNCE_MS = 150
// A smooth page turn has ended by then, even if no scroll event said so
const TURN_SETTLE_MS = 1000
// How long the pages must rest before the verse on screen is noted
const ANCHOR_DEBOUNCE_MS = 150
// The verses in the block: the reader gives each its number as id
const VERSE_SELECTOR = "[id]"

/**
 * Directive that handles "paged" reading mode navigation.
 * It manages horizontal scrolling in a CSS multi-column layout, computing page boundaries
 * (advanceWidth) to snap scrolling to nearest pages and fix off-center alignments.
 */
@Directive({
  selector: "[appPagedNavigation]",
  standalone: true,
})
export class PagedNavigationDirective implements OnChanges, OnDestroy {
  @Input("appPagedNavigation") set bookBlock(value: HTMLElement | undefined) {
    this._bookBlock = value
    this.observeContentChanges()
  }
  get bookBlock(): HTMLElement | undefined {
    return this._bookBlock
  }
  /** Determines if the reader is in continuous scroll or horizontal paged mode. */
  @Input() viewMode: "scrolling" | "paged" = "scrolling"

  @Output() nextChapter = new EventEmitter<void>()
  @Output() prevChapter = new EventEmitter<void>()
  @Output() pageStateChange = new EventEmitter<PageState>()

  private _bookBlock?: HTMLElement
  private resizeTimeout?: number
  private alignmentTimeout?: number
  private mutationObserver?: MutationObserver
  private spacer?: HTMLElement
  private layoutFrame?: number
  private _stayAtEnd = false
  /** A drag under way: the page it started on, and the scroll position then. */
  private drag?: { page: number; left: number }
  /** The page a smooth turn is heading for: another turn goes on from it. */
  private targetPage?: number
  private targetTimeout?: number
  /**
   * Where the page on screen starts: a verse, and how far into it, as a share
   * of the pages it runs over (0 when it starts on the page). A resize (a
   * rotation, a folding phone, Split View) lays the text out anew, so the
   * page is found again by this, not by its pixel offset, which landed up to
   * 16 verses on.
   */
  private anchor?: { verse: HTMLElement; within: number }
  private anchorTimeout?: number
  /** A resize is under way: the layout no longer matches the anchor's page. */
  private resizing = false
  private readonly platformId = inject(PLATFORM_ID)

  constructor(
    private containerRef: ElementRef<HTMLElement>,
    private renderer: Renderer2,
  ) {}

  private get container(): HTMLElement {
    return this.containerRef.nativeElement
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes["viewMode"]) return

    if (this.viewMode !== "paged") {
      this.removeSpacer()
      this.onScroll()
      return
    }

    // Angular writes the column class on the inner block after this hook, so
    // measuring now would see a single column and read as "last page".
    this.afterLayout(() => {
      this.ensureAlignedScrollWidth()
      this.snapToNearestPage()
      this.onScroll()
    })
  }

  /** Runs `fn` after Angular has written the pending DOM changes. */
  private afterLayout(fn: () => void): void {
    if (!isPlatformBrowser(this.platformId)) return
    if (this.layoutFrame !== undefined) cancelAnimationFrame(this.layoutFrame)
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = undefined
      fn()
    })
  }

  ngOnDestroy(): void {
    clearTimeout(this.resizeTimeout)
    clearTimeout(this.alignmentTimeout)
    clearTimeout(this.targetTimeout)
    clearTimeout(this.anchorTimeout)
    if (this.layoutFrame !== undefined) cancelAnimationFrame(this.layoutFrame)
    this.mutationObserver?.disconnect()
    this.removeSpacer()
  }

  private removeSpacer(): void {
    if (this.spacer) {
      this.renderer.removeChild(this.container, this.spacer)
      this.spacer = undefined
    }
  }

  @HostListener("scroll")
  onScroll(): void {
    if (this.viewMode !== "paged" || !this.container) return

    if (this.targetPage !== undefined && this.bookBlock) {
      const left = this.targetPage * this.getAdvanceWidth(this.bookBlock)
      if (Math.abs(this.container.scrollLeft - left) <= SCROLL_THRESHOLD) {
        this.setTarget(undefined)
      }
    }

    const isFirstPage = this.container.scrollLeft <= SCROLL_THRESHOLD
    const maxScroll = this.container.scrollWidth - this.container.clientWidth
    const isLastPage =
      maxScroll <= 0 ||
      this.container.scrollLeft >= maxScroll - SCROLL_THRESHOLD

    this.pageStateChange.emit({ isFirstPage, isLastPage })
    this.noteAnchorSoon()
  }

  @HostListener("window:resize")
  onWindowResize(): void {
    if (this.viewMode === "paged") {
      // The resize's own scroll (the browser clamping the old offset) comes
      // next: it must not replace the verse the reader was on.
      this.resizing = true
      clearTimeout(this.anchorTimeout)
      clearTimeout(this.resizeTimeout)
      this.resizeTimeout = window.setTimeout(() => {
        this.ensureAlignedScrollWidth()
        this.restorePage()
        this.resizing = false
        this.onScroll()
      }, RESIZE_DEBOUNCE_MS)
    }
  }

  /** Back to the place in the verse the reader was on, laid out anew. */
  private restorePage(): void {
    const block = this.bookBlock
    const anchor = this.anchor
    if (!block || !anchor?.verse.isConnected || !block.contains(anchor.verse)) {
      this.snapToNearestPage()
      return
    }
    if (anchor.within === 0) {
      this.scrollToPage(anchor.verse, "instant")
      return
    }
    // A verse longer than a page: as far into it as the reader was.
    const advanceWidth = this.getAdvanceWidth(block)
    if (advanceWidth <= 0) return
    this._stayAtEnd = false
    this.setTarget(undefined)
    const { first, last } = this.pagesOf(anchor.verse, advanceWidth)
    const page = first + Math.round(anchor.within * (last - first + 1))
    this.showPage(Math.min(page, last), advanceWidth, "instant")
  }

  private noteAnchorSoon(): void {
    if (this.resizing || !isPlatformBrowser(this.platformId)) return
    clearTimeout(this.anchorTimeout)
    this.anchorTimeout = window.setTimeout(
      () => this.noteAnchor(),
      ANCHOR_DEBOUNCE_MS,
    )
  }

  /**
   * Notes the first verse that starts on the page on screen, or, on a page
   * that one long verse fills, that verse and how far into it the page is.
   * A verse that starts on the page is kept while it does, so a page found
   * again by it is not noted by an earlier verse sharing it: a few rotations
   * would walk the reader back.
   */
  private noteAnchor(): void {
    const block = this.bookBlock
    if (this.viewMode !== "paged" || !this.container || !block) return
    const advanceWidth = this.getAdvanceWidth(block)
    if (advanceWidth <= 0) return

    const page = Math.round(this.container.scrollLeft / advanceWidth)
    const kept = this.anchor
    if (
      kept?.within === 0 &&
      kept.verse.isConnected &&
      block.contains(kept.verse) &&
      this.pagesOf(kept.verse, advanceWidth).first === page
    ) {
      return
    }

    let verse: HTMLElement | undefined
    for (const candidate of Array.from(
      block.querySelectorAll<HTMLElement>(VERSE_SELECTOR),
    )) {
      const start = this.pagesOf(candidate, advanceWidth).first
      if (start > page) break
      verse = candidate
      if (start === page) break
    }
    if (!verse) {
      this.anchor = undefined
      return
    }
    const { first, last } = this.pagesOf(verse, advanceWidth)
    const within = first < page ? (page - first) / (last - first + 1) : 0
    this.anchor = { verse, within }
  }

  /** The pages an inline verse runs over: its first and last fragments'. */
  private pagesOf(
    element: HTMLElement,
    advanceWidth: number,
  ): { first: number; last: number } {
    const rects = element.getClientRects()
    const box = element.getBoundingClientRect()
    const origin =
      this.container.getBoundingClientRect().left - this.container.scrollLeft
    const pageAt = (rect: DOMRect) =>
      Math.max(
        0,
        Math.floor((rect.left - origin + SCROLL_THRESHOLD) / advanceWidth),
      )
    const first = pageAt(rects[0] ?? box)
    return {
      first,
      last: Math.max(first, pageAt(rects[rects.length - 1] ?? box)),
    }
  }

  /** Advances the scroll position by exactly one "page" width (one column + gap). */
  nextPage(): void {
    if (this.viewMode !== "paged") return
    const block = this.bookBlock
    if (!this.container || !block) return

    this._stayAtEnd = false
    const advanceWidth = this.getAdvanceWidth(block)
    const currentPageIndex = this.currentPage(advanceWidth)
    const maxScroll = this.container.scrollWidth - this.container.clientWidth
    this.releaseDrag()

    if (
      maxScroll <= 0 ||
      currentPageIndex * advanceWidth >= maxScroll - SCROLL_THRESHOLD
    ) {
      this.nextChapter.emit()
    } else {
      this.turnTo(currentPageIndex + 1, advanceWidth)
    }
  }

  /** Regresses the scroll position by exactly one "page" width. */
  prevPage(): void {
    if (this.viewMode !== "paged") return
    const block = this.bookBlock
    if (!this.container || !block) return

    this._stayAtEnd = false
    const advanceWidth = this.getAdvanceWidth(block)
    const currentPageIndex = this.currentPage(advanceWidth)
    this.releaseDrag()

    if (currentPageIndex * advanceWidth <= SCROLL_THRESHOLD) {
      this.prevChapter.emit()
    } else {
      this.turnTo(Math.max(0, currentPageIndex - 1), advanceWidth)
    }
  }

  /**
   * Moves the page with the finger, `dx` px from where it came down. Past the
   * first or last page the text gives, less the further it goes, as iOS
   * content does at an edge: there is no page there.
   */
  dragBy(dx: number): void {
    if (this.viewMode !== "paged") return
    const block = this.bookBlock
    if (!this.container || !block) return

    if (!this.drag) {
      // Caught mid-turn, it counts from the page on screen, as iOS's own
      // paging does, not from where the turn was heading.
      const page = Math.round(
        this.container.scrollLeft / this.getAdvanceWidth(block),
      )
      this.setTarget(undefined)
      this.drag = { page, left: this.container.scrollLeft }
      block.style.transition = "none"
    }
    const maxScroll = Math.max(
      0,
      this.container.scrollWidth - this.container.clientWidth,
    )
    const wanted = this.drag.left - dx
    const left = Math.min(Math.max(wanted, 0), maxScroll)
    this.container.scrollLeft = left
    const overshoot = wanted - left
    block.style.transform = overshoot
      ? `translateX(${-rubberband(overshoot, this.container.clientWidth)}px)`
      : ""
  }

  /** A drag let go without a turn: the page goes back to where it was. */
  cancelDrag(): void {
    const block = this.bookBlock
    if (!this.drag || !this.container || !block) return
    const { page } = this.drag
    this.releaseDrag()
    this.turnTo(page, this.getAdvanceWidth(block))
  }

  /** The page turns are counted from: where a drag or a turn under way began. */
  private currentPage(advanceWidth: number): number {
    return (
      this.drag?.page ??
      this.targetPage ??
      Math.round(this.container.scrollLeft / advanceWidth)
    )
  }

  private turnTo(page: number, advanceWidth: number): void {
    this.setTarget(page)
    this.container.scrollTo({ left: page * advanceWidth, behavior: "smooth" })
  }

  private setTarget(page: number | undefined): void {
    clearTimeout(this.targetTimeout)
    this.targetPage = page
    if (page !== undefined) {
      this.targetTimeout = window.setTimeout(
        () => this.setTarget(undefined),
        TURN_SETTLE_MS,
      )
    }
  }

  /** Ends a drag; text pulled past an edge springs back. */
  private releaseDrag(): void {
    this.drag = undefined
    const block = this.bookBlock
    if (!block?.style.transform) return
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches
    block.style.transition = reduced ? "none" : "transform 0.3s ease-out"
    block.style.transform = ""
  }

  /** Page-aligned: scrollIntoView would stop on a seam between two pages. */
  scrollToPage(
    element: HTMLElement,
    behavior: ScrollBehavior = "smooth",
  ): void {
    if (this.viewMode !== "paged") return
    const block = this.bookBlock
    if (!this.container || !block) return

    this._stayAtEnd = false
    this.setTarget(undefined)
    this.ensureAlignedScrollWidth()

    const advanceWidth = this.getAdvanceWidth(block)
    if (advanceWidth <= 0) return

    this.showPage(
      this.pagesOf(element, advanceWidth).first,
      advanceWidth,
      behavior,
    )
  }

  /** Scrolls to a page, never past the last. */
  private showPage(
    page: number,
    advanceWidth: number,
    behavior: ScrollBehavior,
  ): void {
    const maxScroll = Math.max(
      0,
      this.container.scrollWidth - this.container.clientWidth,
    )
    this.container.scrollTo({
      left: Math.min(page * advanceWidth, maxScroll),
      behavior,
    })
  }

  scrollToEnd(): void {
    this._stayAtEnd = true
    this.setTarget(undefined)
    this.snapToEnd()
  }

  private snapToEnd(): void {
    this.ensureAlignedScrollWidth()
    const block = this.bookBlock
    if (!this.container || !block) return

    const maxScroll = this.container.scrollWidth - this.container.clientWidth
    this.container.scrollLeft = maxScroll > 0 ? maxScroll : 0
  }

  private snapToNearestPage(): void {
    if (this.viewMode !== "paged") return
    const block = this.bookBlock
    if (!this.container || !block) return

    const advanceWidth = this.getAdvanceWidth(block)
    const scrollLeft = this.container.scrollLeft

    this.setTarget(undefined)
    const pageIndex = Math.round(scrollLeft / advanceWidth)
    this.container.scrollTo({
      left: pageIndex * advanceWidth,
      behavior: "smooth",
    })
  }

  /**
   * Calculates the exact pixel width of a single "page" (column) to advance.
   * This includes the visible width minus padding, plus the CSS column gap.
   */
  private getAdvanceWidth(block: HTMLElement): number {
    const style = window.getComputedStyle(block)
    const gap = parseFloat(style.columnGap) || 0
    const paddingLeft = parseFloat(style.paddingLeft) || 0
    const paddingRight = parseFloat(style.paddingRight) || 0
    return block.clientWidth - (paddingLeft + paddingRight) + gap
  }

  /**
   * With a 2-column layout and an odd total number of columns,
   * maxScroll is not a multiple of advanceWidth, causing the last
   * page to be off-center. This method adds a spacer element to
   * extend the scrollable area to the next aligned boundary.
   */
  ensureAlignedScrollWidth(): void {
    this.alignScrollWidth()
    // Late content (lazy introduction, fonts) changes the page count; a stale
    // "last page" state would hide the next control.
    this.onScroll()
  }

  private alignScrollWidth(): void {
    this.removeSpacer()

    const block = this._bookBlock
    if (!this.container || !block || this.viewMode !== "paged") return

    const advanceWidth = this.getAdvanceWidth(block)
    if (advanceWidth <= 0) return

    const scrollWidth = this.container.scrollWidth
    const clientWidth = this.container.clientWidth
    const maxScroll = scrollWidth - clientWidth

    if (maxScroll <= 0) return

    const remainder = maxScroll % advanceWidth
    // A remainder of a pixel or two is the columns' rounding, not a page:
    // padding it out would add a page with nothing on it.
    if (
      remainder > SCROLL_THRESHOLD &&
      advanceWidth - remainder > SCROLL_THRESHOLD
    ) {
      const extra = advanceWidth - remainder
      this.spacer = this.renderer.createElement("div")

      if (this.spacer) {
        this.renderer.setStyle(this.spacer, "position", "absolute")
        this.renderer.setStyle(this.spacer, "top", "0")
        this.renderer.setStyle(
          this.spacer,
          "left",
          `${scrollWidth + extra - 1}px`,
        )
        this.renderer.setStyle(this.spacer, "width", "1px")
        this.renderer.setStyle(this.spacer, "height", "1px")
        this.renderer.setStyle(this.spacer, "pointerEvents", "none")

        this.renderer.appendChild(this.container, this.spacer)
      }
    }
  }

  /**
   * Watches the inner container for newly injected content (like verses loading).
   * Automatically recalculates aligning boundaries to prevent clipping text.
   */
  private observeContentChanges(): void {
    // The server DOM has no observers.
    if (!isPlatformBrowser(this.platformId)) return
    this.mutationObserver?.disconnect()
    const block = this._bookBlock
    if (!block) return

    this.mutationObserver = new MutationObserver(() => {
      clearTimeout(this.alignmentTimeout)
      this.alignmentTimeout = window.setTimeout(() => {
        requestAnimationFrame(() => {
          if (this._stayAtEnd) {
            this.snapToEnd()
          } else {
            this.ensureAlignedScrollWidth()
          }
        })
      }, MUTATION_DEBOUNCE_MS)
    })
    this.mutationObserver.observe(block, { childList: true, subtree: true })
  }
}

/**
 * How far content follows a finger `overshoot` px past an edge of a
 * `dimension` px view: nearly 1:1 at first, ever less after.
 */
function rubberband(overshoot: number, dimension: number): number {
  const constant = 0.55
  return (
    (overshoot * dimension * constant) /
    (dimension + constant * Math.abs(overshoot))
  )
}
