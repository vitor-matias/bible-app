import { isPlatformBrowser } from "@angular/common"
import { Injectable, inject, PLATFORM_ID } from "@angular/core"

/** Toggled on the <verse> host; the stroke is styled in verse.component.css. */
export const HIGHLIGHT_CLASS = "verse-highlight"

/**
 * Marks a verse whose predecessor is highlighted too. The stroke stops at a
 * verse's last word, so a range would otherwise break at every verse number;
 * this tells the verse to paint the gap and the number it opens with.
 */
export const HIGHLIGHT_CONTINUES_CLASS = "highlight-continues"

/** How long a deep-linked verse stays marked before the stroke fades out. */
export const HIGHLIGHT_DURATION_MS = 2500

/**
 * How long a deep-link scroll keeps being corrected while the layout settles
 * (VerseComponent's indent pass, a font swap).
 */
export const LAYOUT_SETTLE_MS = 600

/** Default for scrolling mode: centre the verse in the vertical scroller. */
const scrollVerseIntoView = (element: HTMLElement): void => {
  element.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest",
  })
}

@Injectable({
  providedIn: "root",
})
export class BibleReaderAnimationService {
  private readonly platformId = inject(PLATFORM_ID)

  private highlightTimeouts = new Map<
    HTMLElement,
    ReturnType<typeof setTimeout>
  >()

  /** Cancels the pending realign pass; undefined when none is pending. */
  private cancelRealign?: () => void

  /** The not-yet-fired deep-link scroll scheduled by scrollToVerseElement. */
  private pendingVerseScroll?: ReturnType<typeof setTimeout>

  /** The server DOM lacks scrollTo/requestAnimationFrame. */
  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId)
  }

  /**
   * Called on chapter swap and destroy: a pending pass holds the previous
   * chapter's verse element and must not fire against its replacement.
   */
  cancelPendingRealign(): void {
    if (this.pendingVerseScroll !== undefined) {
      clearTimeout(this.pendingVerseScroll)
      this.pendingVerseScroll = undefined
    }
    this.cancelRealign?.()
    this.cancelRealign = undefined
  }

  scrollToTop(
    drawerContent: HTMLElement | undefined,
    container: HTMLElement | undefined,
    viewMode: "scrolling" | "paged",
    startAtBottom = false,
    beforeScroll?: () => void,
  ): void {
    if (!this.isBrowser) return
    setTimeout(() => {
      if (drawerContent) {
        drawerContent.scrollTo({ top: 0, behavior: "smooth" })
      }

      if (container) {
        if (viewMode === "paged" && startAtBottom) {
          // Layout using CSS columns often takes more than a single event loop tick
          // to calculate the final scrollWidth.
          // We'll give it a slightly longer timeout and use a requestAnimationFrame chain.
          setTimeout(() => {
            requestAnimationFrame(() => {
              if (beforeScroll) {
                beforeScroll()
              } else {
                const maxScroll = container.scrollWidth - container.clientWidth
                container.scrollLeft = maxScroll > 0 ? maxScroll : 0
              }
              this.triggerSlideAnimation(drawerContent, container, true)
            })
          }, 100)
        } else {
          setTimeout(() => {
            requestAnimationFrame(() => {
              beforeScroll?.()
              if (viewMode === "paged") {
                container.scrollLeft = 0
              }
              this.triggerSlideAnimation(
                drawerContent,
                container,
                startAtBottom,
              )
            })
          }, 0)
        }
      }
    }, 0)
  }

  triggerSlideAnimation(
    drawerContent: HTMLElement | undefined,
    container: HTMLElement,
    isBackward: boolean,
  ): void {
    container.style.transition = ""
    container.style.opacity = ""

    // Restore overflow on the scroll container now that content is positioned
    if (drawerContent) {
      drawerContent.style.overflow = ""
    }

    const animationClass = isBackward ? "slide-in-left" : "slide-in-right"

    // Trigger reflow to restart animation reliably
    container.classList.remove(
      "slide-in-left",
      "slide-in-right",
      "slide-out-left",
      "slide-out-right",
    )
    void container.offsetWidth

    container.classList.add(animationClass)

    setTimeout(() => {
      container.classList.remove(animationClass)
    }, 600)
  }

  triggerSlideOutAnimation(
    container: HTMLElement,
    isBackward: boolean,
  ): Promise<void> {
    if (!this.isBrowser) return Promise.resolve()
    return new Promise((resolve) => {
      const animationClass = isBackward ? "slide-out-right" : "slide-out-left"

      container.classList.remove(
        "slide-in-left",
        "slide-in-right",
        "slide-out-left",
        "slide-out-right",
      )
      void container.offsetWidth

      container.classList.add(animationClass)

      const onEnd = () => {
        container.removeEventListener("animationend", onEnd)
        container.classList.remove(animationClass)
        resolve()
      }
      container.addEventListener("animationend", onEnd, { once: true })

      // Safety fallback in case animationend never fires
      setTimeout(() => {
        container.removeEventListener("animationend", onEnd)
        container.classList.remove(animationClass)
        resolve()
      }, 600)
    })
  }

  scrollToVerseElement(
    bookBlock: HTMLElement | undefined,
    bookContainer: HTMLElement | undefined,
    verseStart: number,
    verseEnd?: number,
    highlight = true,
    startAtBottom = false,
    /** Paged mode passes its own page-aligned scroll. */
    bringIntoView: (element: HTMLElement) => void = scrollVerseIntoView,
  ): void {
    if (!this.isBrowser) return
    // A newer deep link supersedes one still inside its 100ms window.
    this.cancelPendingRealign()
    this.pendingVerseScroll = setTimeout(() => {
      this.pendingVerseScroll = undefined
      let scrolled = false
      if (!bookBlock) return

      for (let i = verseStart; i <= (verseEnd || verseStart); i++) {
        // Scope search to the book block
        const element = bookBlock.querySelector(`[id="${i}"]`) as HTMLElement
        if (element) {
          if (!scrolled) {
            bringIntoView(element)
            this.realignWhenLayoutSettles(element, bringIntoView)
            scrolled = true
          }
          if (highlight) {
            element.classList.add(HIGHLIGHT_CLASS)
            // Every verse of the range but the first opens inside the stroke.
            element.classList.toggle(HIGHLIGHT_CONTINUES_CLASS, i > verseStart)

            if (this.highlightTimeouts.has(element)) {
              clearTimeout(this.highlightTimeouts.get(element))
            }

            const timeoutId = setTimeout(() => {
              element.classList.remove(HIGHLIGHT_CLASS)
              element.classList.remove(HIGHLIGHT_CONTINUES_CLASS)
              this.highlightTimeouts.delete(element)
            }, HIGHLIGHT_DURATION_MS)
            this.highlightTimeouts.set(element, timeoutId)
          }
        }
      }

      if (bookContainer) {
        // drawerContent is not available here; triggerSlideAnimation only uses it
        // to clear overflow, which is handled elsewhere, so pass undefined.
        this.triggerSlideAnimation(undefined, bookContainer, startAtBottom)
      }
    }, 100)
  }

  /**
   * The chapter keeps growing after the first scroll (font swap, debounced
   * verse indent passes), which leaves a verse near the end short of view.
   * Scroll again once the layout settles, unless the reader has taken over.
   */
  private realignWhenLayoutSettles(
    element: HTMLElement,
    bringIntoView: (element: HTMLElement) => void,
  ): void {
    this.cancelPendingRealign()

    let takenOver = false
    const takeOver = () => {
      takenOver = true
    }
    const events: Array<keyof WindowEventMap> = [
      "wheel",
      "touchmove",
      "keydown",
    ]
    for (const event of events) {
      window.addEventListener(event, takeOver, { passive: true })
    }

    // Wait on a font swap too, but only while one is loading. Older WebViews
    // have no FontFaceSet at all.
    const fonts = "fonts" in document ? document.fonts : undefined
    const fontsLoading = fonts?.status === "loading" ? fonts.ready : undefined
    let pending = fontsLoading ? 2 : 1

    const detach = () => {
      pending = 0
      for (const event of events) {
        window.removeEventListener(event, takeOver)
      }
      if (this.cancelRealign === cancel) this.cancelRealign = undefined
    }

    // Scrolls once, on the last completion (timer, font swap). `pending <= 0`
    // stops a font promise that resolves after teardown from scrolling.
    const release = () => {
      if (pending <= 0) return
      pending -= 1
      if (pending > 0) return
      detach()
      if (!takenOver) bringIntoView(element)
    }

    const settleTimeout = setTimeout(release, LAYOUT_SETTLE_MS)

    const cancel = () => {
      clearTimeout(settleTimeout)
      detach()
    }
    this.cancelRealign = cancel

    // A rejected FontFaceSet counts as settled, or the listeners never come off.
    fontsLoading?.then(release, release)
  }
}
