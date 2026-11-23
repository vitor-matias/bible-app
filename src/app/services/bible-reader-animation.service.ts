import { isPlatformBrowser } from "@angular/common"
import { Injectable, inject, PLATFORM_ID } from "@angular/core"
import { MatDialog } from "@angular/material/dialog"
import { NavigationStart, Router } from "@angular/router"
import { filter, take } from "rxjs/operators"

/** Toggled on the <verse> host; the stroke is styled in verse.component.css. */
export const HIGHLIGHT_CLASS = "verse-highlight"

/**
 * How long a deep-linked verse stays marked before the stroke fades out. A
 * range stays marked: see keepMarked.
 */
export const HIGHLIGHT_DURATION_MS = 2500

/**
 * How long a deep-link scroll keeps being corrected while the layout settles
 * (VerseComponent's indent pass, a font swap).
 */
export const LAYOUT_SETTLE_MS = 600

/** A verse range from a link goes no further; the longest chapter has 176. */
const MAX_VERSE_RANGE = 200

/**
 * Default for scrolling mode: centre the verse's start, its number, in the
 * vertical scroller. Not the <verse> host: it is an inline box over several
 * lines, and WebKit scrolls one that opens a paragraph as if it began at the
 * top of the chapter, so Safari opened Jo 3,16 on verses 4-12.
 */
const scrollVerseIntoView = (element: HTMLElement): void => {
  const start =
    element.querySelector<HTMLElement>(".verseNumber") ??
    element.querySelector<HTMLElement>(".verseRun") ??
    element
  start.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest",
  })
}

/** The chapter then changes in place, without sliding. */
const reducedMotion = (): boolean =>
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

@Injectable({
  providedIn: "root",
})
export class BibleReaderAnimationService {
  private readonly platformId = inject(PLATFORM_ID)
  private readonly dialog = inject(MatDialog)
  private readonly router = inject(Router)

  /** Cancels each marked verse's pending fade. */
  private highlightFades = new Map<HTMLElement, () => void>()

  /** Unmarks the linked range showing, if any. */
  private unmarkRange?: () => void

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
                container.scrollLeft = Math.max(maxScroll, 0)
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

    if (reducedMotion()) return
    container.classList.add(animationClass)

    setTimeout(() => {
      container.classList.remove(animationClass)
    }, 600)
  }

  triggerSlideOutAnimation(
    container: HTMLElement,
    isBackward: boolean,
  ): Promise<void> {
    if (!this.isBrowser || reducedMotion()) return Promise.resolve()
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
      let startsInAddition: boolean | undefined
      if (!bookBlock) return
      this.unmarkRange?.()

      const extraVerses = Math.min(
        (verseEnd || verseStart) - verseStart,
        MAX_VERSE_RANGE,
      )
      const range: HTMLElement[] = []
      // Counted from the start: from 2^53 or Infinity, i++ would not advance.
      for (let offset = 0; offset <= extraVerses; offset++) {
        // Scope search to the book block
        const element = bookBlock.querySelector(
          `[id="${verseStart + offset}"]`,
        ) as HTMLElement
        // A range runs through the verses of its start's kind: an addition's
        // (Ester) lie between a chapter's, numbered apart, and are not in it.
        if (element) {
          const addition = element.classList.contains("supplement")
          startsInAddition ??= addition
          if (addition !== startsInAddition) continue
          if (!scrolled) {
            bringIntoView(element)
            this.realignWhenLayoutSettles(element, bringIntoView)
            scrolled = true
          }
          if (highlight) {
            element.classList.add(HIGHLIGHT_CLASS)
            this.highlightFades.get(element)?.()
            // Joining a range, it has no fade: its entry would keep the
            // element after the chapter goes.
            this.highlightFades.delete(element)
            if (extraVerses > 0) range.push(element)
            else this.fadeHighlight(element)
          }
        }
      }
      if (range.length > 0) this.keepMarked(range)

      if (bookContainer) {
        // drawerContent is not available here; triggerSlideAnimation only uses it
        // to clear overflow, which is handled elsewhere, so pass undefined.
        this.triggerSlideAnimation(undefined, bookContainer, startAtBottom)
      }
    }, 100)
  }

  /**
   * A linked or searched range is the reading: faded, a reader who looked a
   * moment later couldn't tell which verses it was. It stays marked until a
   * tap elsewhere (not on it, nor in a dialog, menu or sheet over it) or the
   * next navigation.
   */
  private keepMarked(verses: HTMLElement[]): void {
    const unmark = () => {
      for (const verse of verses) verse.classList.remove(HIGHLIGHT_CLASS)
      document.removeEventListener("click", onClick, true)
      navigation.unsubscribe()
      if (this.unmarkRange === unmark) this.unmarkRange = undefined
    }
    const onClick = ({ target }: MouseEvent) => {
      if (
        target instanceof Element &&
        (target.closest(".cdk-overlay-container") ||
          verses.some((verse) => verse.contains(target)))
      ) {
        return
      }
      unmark()
    }
    const navigation = this.router.events
      .pipe(filter((event) => event instanceof NavigationStart))
      .subscribe(unmark)
    document.addEventListener("click", onClick, true)
    this.unmarkRange = unmark
  }

  /**
   * Unmarks the verse after HIGHLIGHT_DURATION_MS. Under a dialog then (a first
   * visit's onboarding opens over a shared link), nobody saw it: it stays
   * marked until the dialogs close, and for the full time from then.
   */
  private fadeHighlight(element: HTMLElement): void {
    const timeout = setTimeout(() => {
      if (this.dialog.openDialogs.length > 0) {
        const closed = this.dialog.afterAllClosed
          .pipe(take(1))
          .subscribe(() => this.fadeHighlight(element))
        this.highlightFades.set(element, () => closed.unsubscribe())
        return
      }
      element.classList.remove(HIGHLIGHT_CLASS)
      this.highlightFades.delete(element)
    }, HIGHLIGHT_DURATION_MS)
    this.highlightFades.set(element, () => clearTimeout(timeout))
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
