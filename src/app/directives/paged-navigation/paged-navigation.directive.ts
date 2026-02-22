import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from "@angular/core"

export interface PageState {
  isFirstPage: boolean
  isLastPage: boolean
}

@Directive({
  selector: "[appPagedNavigation]",
  standalone: true,
})
export class PagedNavigationDirective {
  @Input("appPagedNavigation") bookBlock?: HTMLElement
  @Input() viewMode: "scrolling" | "paged" = "scrolling"

  @Output() nextChapter = new EventEmitter<void>()
  @Output() prevChapter = new EventEmitter<void>()
  @Output() pageStateChange = new EventEmitter<PageState>()

  private resizeTimeout?: number

  constructor(private containerRef: ElementRef<HTMLElement>) {}

  private get container(): HTMLElement {
    return this.containerRef.nativeElement
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
        this.snapToNearestPage()
        this.onScroll()
      }, 150)
    }
  }

  nextPage(): void {
    if (this.viewMode !== "paged") return
    const block = this.bookBlock
    if (!this.container || !block) return

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

  private snapToNearestPage(): void {
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
}
