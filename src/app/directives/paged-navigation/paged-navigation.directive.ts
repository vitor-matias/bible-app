import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from "@angular/core"

export interface PageState {
  isFirstPage: boolean
  isLastPage: boolean
}

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

  constructor(private containerRef: ElementRef<HTMLElement>) {}

  private get container(): HTMLElement {
    return this.containerRef.nativeElement
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["viewMode"]) {
      if (this.viewMode === "paged") {
        this.ensureAlignedScrollWidth()
        this.snapToNearestPage()
      } else {
        this.spacer?.remove()
        this.spacer = undefined
      }
      this.onScroll()
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.resizeTimeout)
    clearTimeout(this.alignmentTimeout)
    this.mutationObserver?.disconnect()
    this.spacer?.remove()
  }

  @HostListener("scroll")
  onScroll(): void {
    if (this.viewMode !== "paged" || !this.container) return

    const isFirstPage = this.container.scrollLeft <= 5
    const maxScroll = this.container.scrollWidth - this.container.clientWidth
    const isLastPage =
      maxScroll <= 0 || this.container.scrollLeft >= maxScroll - 5

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
      }, 150)
    }
  }

  nextPage(): void {
    if (this.viewMode !== "paged") return
    const block = this.bookBlock
    if (!this.container || !block) return

    this._stayAtEnd = false
    const advanceWidth = this.getAdvanceWidth(block)
    const scrollLeft = this.container.scrollLeft
    const scrollWidth = this.container.scrollWidth
    const maxScroll = scrollWidth - this.container.clientWidth

    if (maxScroll <= 0 || scrollLeft >= maxScroll - 5) {
      this.nextChapter.emit()
    } else {
      const currentPageIndex = Math.round(scrollLeft / advanceWidth)
      const nextScrollLeft = (currentPageIndex + 1) * advanceWidth
      this.container.scrollTo({ left: nextScrollLeft, behavior: "smooth" })
    }
  }

  prevPage(): void {
    if (this.viewMode !== "paged") return
    const block = this.bookBlock
    if (!this.container || !block) return

    this._stayAtEnd = false
    const advanceWidth = this.getAdvanceWidth(block)
    const scrollLeft = this.container.scrollLeft

    if (scrollLeft <= 5) {
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
    this.spacer?.remove()
    this.spacer = undefined

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
      const spacer = document.createElement("div")
      spacer.style.position = "absolute"
      spacer.style.top = "0"
      spacer.style.left = `${scrollWidth + extra - 1}px`
      spacer.style.width = "1px"
      spacer.style.height = "1px"
      spacer.style.pointerEvents = "none"
      this.container.appendChild(spacer)
      this.spacer = spacer
    }
  }

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
      }, 150)
    })
    this.mutationObserver.observe(block, { childList: true, subtree: true })
  }
}
