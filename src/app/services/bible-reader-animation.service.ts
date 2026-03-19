import { Injectable } from "@angular/core"

@Injectable({
  providedIn: "root",
})
export class BibleReaderAnimationService {
  scrollToTop(
    drawerContent: HTMLElement | undefined,
    container: HTMLElement | undefined,
    viewMode: "scrolling" | "paged",
    startAtBottom = false,
    beforeScroll?: () => void,
  ): void {
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
              beforeScroll?.()
              const maxScroll = container.scrollWidth - container.clientWidth
              container.scrollLeft = maxScroll > 0 ? maxScroll : 0
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
            setTimeout(() => {
              element.style.backgroundColor = ""
            }, 2500)
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
