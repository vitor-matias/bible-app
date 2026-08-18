import { Injectable } from "@angular/core"

/** Toggled on the <verse> host; the stroke is styled in verse.component.css. */
export const HIGHLIGHT_CLASS = "verse-highlight"

/** How long a deep-linked verse stays marked before the stroke fades out. */
export const HIGHLIGHT_DURATION_MS = 2500

/**
 * How long the reader keeps correcting the deep-link scroll while the chapter's
 * layout is still settling. Long enough for the indent pass in VerseComponent
 * and a font swap, short enough that it never fights the reader.
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
  private highlightTimeouts = new Map<
    HTMLElement,
    ReturnType<typeof setTimeout>
  >()

  /**
   * Scroll/animation work is meaningless while server-rendering, and the
   * server DOM lacks scrollTo/requestAnimationFrame — skip it entirely.
   */
  private get isBrowser(): boolean {
    return typeof window !== "undefined"
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
    /**
     * How the verse is brought into view. Paged mode scrolls horizontally in
     * whole-page steps, so it passes its own aligning scroll instead.
     */
    bringIntoView: (element: HTMLElement) => void = scrollVerseIntoView,
  ): void {
    if (!this.isBrowser) return
    setTimeout(() => {
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
            // The stroke itself is styled by the verse component; painting it
            // from here (on the inline <verse> host) would colour the empty
            // line fragments and inter-verse spaces too.
            element.classList.add(HIGHLIGHT_CLASS)

            if (this.highlightTimeouts.has(element)) {
              clearTimeout(this.highlightTimeouts.get(element))
            }

            const timeoutId = setTimeout(() => {
              element.classList.remove(HIGHLIGHT_CLASS)
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
   * The chapter keeps growing after the scroll above has been computed: web
   * fonts swap in, and every VerseComponent runs a debounced indent pass once
   * its own layout settles. The browser scrolled as far as the height it knew
   * about allowed, which for a verse near the end of a chapter is short of the
   * verse itself — so bring it back into view once things have stopped moving,
   * unless the reader has taken over in the meantime.
   */
  private realignWhenLayoutSettles(
    element: HTMLElement,
    bringIntoView: (element: HTMLElement) => void,
  ): void {
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

    // Fonts are the slow half of this and can settle either side of the timer,
    // so the guard against a reader who has taken over outlives both.
    // Older WebViews have no FontFaceSet at all.
    const fontsReady = "fonts" in document ? document.fonts.ready : undefined
    let pending = fontsReady ? 2 : 1

    const realign = () => {
      if (!takenOver) bringIntoView(element)
      pending -= 1
      if (pending > 0) return
      for (const event of events) {
        window.removeEventListener(event, takeOver)
      }
    }

    fontsReady?.then(realign)
    setTimeout(realign, LAYOUT_SETTLE_MS)
  }
}
