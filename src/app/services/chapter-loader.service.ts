import { Injectable } from "@angular/core"
import { Router } from "@angular/router"
import { Subscription } from "rxjs"
import { BibleApiService } from "./bible-api.service"
import { BibleReaderAnimationService } from "./bible-reader-animation.service"
import { BookService } from "./book.service"
import { PreferencesService } from "./preferences.service"

export interface ChapterContainers {
  bookBlock: HTMLElement | undefined
  bookContainer: HTMLElement | undefined
  drawerContent: HTMLElement | undefined
  effectiveViewMode: "scrolling" | "paged"
  pagedNav?: {
    scrollToEnd(): void
    ensureAlignedScrollWidth(): void
  } | null
}

export interface ChapterLoadOptions {
  verseStart?: number
  verseEnd?: number
  highlight?: boolean
}

/**
 * Owns the chapter-loading lifecycle: API call, slide-out animation,
 * navigation-direction flags, and preference persistence.
 *
 * The component keeps DOM references and change detection; it passes
 * them in per-call via `ChapterContainers` and the `onUpdate` callback.
 */
@Injectable({ providedIn: "root" })
export class ChapterLoaderService {
  /** Set by the component before navigating so the service knows which
   *  slide animation to trigger. Reset to false after each load. */
  isNavigatingForwards = false
  isNavigatingBackwards = false

  private activeSubscription?: Subscription
  private loadToken = 0

  constructor(
    private apiService: BibleApiService,
    private animationService: BibleReaderAnimationService,
    private preferencesService: PreferencesService,
    private bookService: BookService,
    private router: Router,
  ) {}

  /**
   * Fetches a chapter, runs the appropriate animation, then calls
   * `onUpdate` at the exact moment the component should update its state
   * and run change detection before the scroll begins.
   */
  loadChapter(
    book: Book,
    chapterNumber: number,
    containers: ChapterContainers,
    onUpdate: (chapter: Chapter, chapterNumber: number) => void,
    opts: ChapterLoadOptions = {},
  ): void {
    const { verseStart, verseEnd, highlight = true } = opts
    const token = ++this.loadToken

    this.activeSubscription?.unsubscribe()
    this.activeSubscription = this.apiService
      .getChapter(book.id, chapterNumber)
      .subscribe({
        next: (res) => {
          this.dispatchWithAnimation(containers.bookContainer, token, () => {
            this.runFinalize(
              token,
              book,
              chapterNumber,
              res,
              containers,
              onUpdate,
              verseStart,
              verseEnd,
              highlight,
            )
          })
        },

        error: (err) => {
          this.dispatchWithAnimation(containers.bookContainer, token, () => {
            if (token !== this.loadToken) {
              return
            }

            if (book.id === "about") {
              this.runFinalize(
                token,
                book,
                chapterNumber,
                { bookId: "about", number: 1 } as Chapter,
                containers,
                onUpdate,
                verseStart,
                verseEnd,
                highlight,
              )
            } else {
              this.resetNavigationState()
              this.router.navigate(["/", this.bookService.getUrlAbrv(book), 1])
            }

            console.error(err)
          })
        },
      })
  }

  /** Cancel any in-flight chapter load (call from ngOnDestroy). */
  cancel(): void {
    this.loadToken++
    this.activeSubscription?.unsubscribe()
    this.activeSubscription = undefined
    this.resetNavigationState()
  }

  private runFinalize(
    token: number,
    book: Book,
    chapterNumber: number,
    chapter: Chapter,
    containers: ChapterContainers,
    onUpdate: (chapter: Chapter, chapterNumber: number) => void,
    verseStart?: number,
    verseEnd?: number,
    highlight = true,
  ): void {
    if (token !== this.loadToken) {
      return
    }

    if (containers.bookContainer) {
      containers.bookContainer.style.transition = "none"
      containers.bookContainer.style.opacity = "0"
    }

    onUpdate(chapter, chapterNumber)

    const startAtBottom = this.isNavigatingBackwards
    this.resetNavigationState()

    this._scroll(containers, startAtBottom, verseStart, verseEnd, highlight)
    this.preferencesService.setLastBookId(book.id)
    this.preferencesService.setLastChapterNumber(chapterNumber)
  }

  private dispatchWithAnimation(
    container: HTMLElement | undefined,
    token: number,
    callback: () => void,
  ): void {
    if (
      container &&
      (this.isNavigatingBackwards || this.isNavigatingForwards)
    ) {
      const navigatingBackwards = this.isNavigatingBackwards
      this.animationService
        .triggerSlideOutAnimation(container, navigatingBackwards)
        .then(() => {
          if (token !== this.loadToken) {
            return
          }
          callback()
        })
      return
    }

    callback()
  }

  private resetNavigationState(): void {
    this.isNavigatingBackwards = false
    this.isNavigatingForwards = false
  }

  private _scroll(
    containers: ChapterContainers,
    startAtBottom: boolean,
    verseStart?: number,
    verseEnd?: number,
    highlight = true,
  ): void {
    if (!verseStart) {
      this.animationService.scrollToTop(
        containers.drawerContent,
        containers.bookContainer,
        containers.effectiveViewMode,
        startAtBottom,
        startAtBottom
          ? () => containers.pagedNav?.scrollToEnd()
          : () => containers.pagedNav?.ensureAlignedScrollWidth(),
      )
    } else {
      this.animationService.scrollToVerseElement(
        containers.bookBlock,
        containers.bookContainer,
        verseStart,
        verseEnd,
        highlight,
      )
    }
  }
}
