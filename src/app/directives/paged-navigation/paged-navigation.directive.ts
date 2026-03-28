import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
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
  private _stayAtEnd = false

  constructor(
    private containerRef: ElementRef<HTMLElement>,
    private renderer: Renderer2,
  ) {}

  private get container(): HTMLElement {
    return this.containerRef.nativeElement
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["viewMode"]) {
      if (this.viewMode === "paged") {
        this.ensureAlignedScrollWidth()
        this.snapToNearestPage()
      } else {
        this.removeSpacer()
      }
      this.onScroll()
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.resizeTimeout)
    clearTimeout(this.alignmentTimeout)
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

    const isFirstPage = this.container.scrollLeft <= SCROLL_THRESHOLD
    const maxScroll = this.container.scrollWidth - this.container.clientWidth
    const isLastPage =
      maxScroll <= 0 ||
      this.container.scrollLeft >= maxScroll - SCROLL_THRESHOLD

    this.pageStateChange.emit({ isFirstPage, isLastPage })
  }

  @HostListener("window:resize")
  onWindowResize(): void {
    if (this.viewMode === "paged") {
      clearTimeout(this.resizeTimeout)
      this.resizeTimeout = window.setTimeout(() => {
        this.ensureAlignedScrollWidth()
        this.snapToNearestPage()
        this.onScroll()
      }, RESIZE_DEBOUNCE_MS)
    }
  }

  /** Advances the scroll position by exactly one "page" width (one column + gap). */
  nextPage(): void {
    if (this.viewMode !== "paged") return
    const block = this.bookBlock
    if (!this.container || !block) return

    this._stayAtEnd = false
    const advanceWidth = this.getAdvanceWidth(block)
    const scrollLeft = this.container.scrollLeft
    const scrollWidth = this.container.scrollWidth
    const maxScroll = scrollWidth - this.container.clientWidth

    if (maxScroll <= 0 || scrollLeft >= maxScroll - SCROLL_THRESHOLD) {
      this.nextChapter.emit()
    } else {
      const currentPageIndex = Math.round(scrollLeft / advanceWidth)
      const nextScrollLeft = (currentPageIndex + 1) * advanceWidth
      this.container.scrollTo({ left: nextScrollLeft, behavior: "smooth" })
    }
  }

  /** Regresses the scroll position by exactly one "page" width. */
  prevPage(): void {
    if (this.viewMode !== "paged") return
    const block = this.bookBlock
    if (!this.container || !block) return

    this._stayAtEnd = false
    const advanceWidth = this.getAdvanceWidth(block)
    const scrollLeft = this.container.scrollLeft

    if (scrollLeft <= SCROLL_THRESHOLD) {
      this.prevChapter.emit()
    } else {
      const currentPageIndex = Math.round(scrollLeft / advanceWidth)
      const prevScrollLeft = Math.max(0, (currentPageIndex - 1) * advanceWidth)
      this.container.scrollTo({ left: prevScrollLeft, behavior: "smooth" })
    }
  }

  scrollToEnd(): void {
    this._stayAtEnd = true
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
    if (remainder > 1 && advanceWidth - remainder > 1) {
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
