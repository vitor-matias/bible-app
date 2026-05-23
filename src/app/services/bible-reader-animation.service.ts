import { Injectable } from "@angular/core"

@Injectable({
  providedIn: "root",
})
export class BibleReaderAnimationService {
  private highlightTimeouts = new Map<
    HTMLElement,
    ReturnType<typeof setTimeout>
  >()
  /**
   * Scrolls the drawer content to the top and orchestrates the transition animations for chapters.
   * Uses `requestAnimationFrame` to ensure the browser has painted the new DOM nodes before
   * calculating layout metrics like `scrollWidth` or applying sliding animations.
   */
  scrollToTop(
    drawerContent: HTMLElement | undefined,
    container: HTMLElement | undefined,
    viewMode: "scrolling" | "paged",
    startAtBottom = false,
    beforeScroll?: () => void,
  ): void {
    if (drawerContent) {
      // Small timeout to decouple from synchronous change detection
      setTimeout(
        () => drawerContent.scrollTo({ top: 0, behavior: "smooth" }),
        0,
      )
    }

    if (!container) return

    // Defer execution until the browser has painted the new chapter layout
    requestAnimationFrame(() => {
      if (viewMode === "paged" && startAtBottom) {
        // Layout using CSS columns sometimes takes more than a single event loop tick
        // to calculate the final scrollWidth. Give it a tiny delay to reflow.
        setTimeout(() => {
          if (beforeScroll) {
            beforeScroll()
          } else {
            const maxScroll = container.scrollWidth - container.clientWidth
            container.scrollLeft = maxScroll > 0 ? maxScroll : 0
          }
          this.triggerSlideAnimation(drawerContent, container, true)
        }, 50)
      } else {
        beforeScroll?.()
        if (viewMode === "paged") {
          container.scrollLeft = 0
        }
        this.triggerSlideAnimation(drawerContent, container, startAtBottom)
      }
    })
  }

  /**
   * Resets and triggers the CSS slide-in animation for chapter navigation.
   * Uses CSS classes and forces a browser reflow to restart the animation if needed.
   */
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

  /**
   * Triggers the CSS slide-out animation, returning a Promise that resolves when
   * the animation completes (or falls back safely after a timeout).
   */
  triggerSlideOutAnimation(
    container: HTMLElement,
    isBackward: boolean,
  ): Promise<void> {
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

  /**
   * Smoothly scrolls to a specific verse within the chapter and briefly highlights it.
   * Tracks and clears ongoing highlight timeouts to prevent UI glitches if scrolling rapidly.
   */
  scrollToVerseElement(
    bookBlock: HTMLElement | undefined,
    bookContainer: HTMLElement | undefined,
    verseStart: number,
    verseEnd?: number,
    highlight = true,
    startAtBottom = false,
  ): void {
    setTimeout(() => {
      let scrolled = false
      if (!bookBlock) return

      for (let i = verseStart; i <= (verseEnd || verseStart); i++) {
        // Scope search to the book block
        const element = bookBlock.querySelector(`[id="${i}"]`) as HTMLElement
        if (element) {
          if (!scrolled) {
            element.scrollIntoView({
              behavior: "smooth",
              block: "center",
              inline: "nearest",
            })
            scrolled = true
          }
          if (highlight) {
            element.style.transition = "background-color 0.5s ease"
            element.style.backgroundColor = "var(--highlight-color)"

            if (this.highlightTimeouts.has(element)) {
              clearTimeout(this.highlightTimeouts.get(element))
            }

            const timeoutId = setTimeout(() => {
              element.style.backgroundColor = ""
              this.highlightTimeouts.delete(element)
            }, 2500)
            this.highlightTimeouts.set(element, timeoutId)
          }
        }
      }

      if (bookContainer) {
        // Note: we don't have access to drawerContent here unless appended,
        // let's assume we can optionally pass it or handle overflow elsewhere.
        // Actually, triggerSlideAnimation just removes overflow from drawerContent if provided.
        // Let's pass undefined here since it was using this.triggerSlideAnimation(bookContainer, startAtBottom) previously.
        this.triggerSlideAnimation(undefined, bookContainer, startAtBottom)
      }
    }, 100)
  }
}
