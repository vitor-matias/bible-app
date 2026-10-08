import { OverlayContainer } from "@angular/cdk/overlay"
import { DOCUMENT } from "@angular/common"
import { Injectable, inject, NgZone } from "@angular/core"
import { Capacitor, type PluginListenerHandle } from "@capacitor/core"
import { Subject } from "rxjs"
import type { OnboardingResult } from "../components/onboarding/onboarding.component"
import type { NativeOnboardingStep } from "../components/onboarding/onboarding-content"
import { NATIVE_CHROME_PLUGIN } from "../tokens"
import type { PassagePickerData } from "../utils/passage-picker"
import type { ThemeMode } from "./theme.service"

/** A tap on a native bar, its menu, the passage picker or the search field. */
export type NativeChromeAction =
  | {
      id:
        | "passage"
        | "previous"
        | "next"
        | "search"
        | "back"
        | "theme-system"
        | "theme-light"
        | "theme-dark"
        | "view-mode"
        | "font-decrease"
        | "font-increase"
        | "bookmarks"
        | "auto-scroll"
        | "auto-scroll-toggle"
        | "auto-scroll-slower"
        | "auto-scroll-faster"
        | "share"
        | "report"
        | "help"
        | "privacy"
        | "report-closed"
        /** A tap on the status bar; handled here (scrollToTop). */
        | "scroll-top"
        /** A tap on the toast's button; handled here (toast). */
        | "toast-action"
    }
  | { id: "goto"; bookId: string; chapter?: number }
  | { id: "bookmark-open" | "bookmark-set" | "bookmark-remove"; color: string }
  | { id: "bookmarks-closed" }
  | { id: "footnote-link"; index: number }
  | { id: "footnotes-closed" }
  | { id: "search-input"; text: string }
  | { id: "search-submit"; text: string }
  | { id: "report-submit"; topic: string; details: string }

/** The reader's bars: the More menu on top; arrows, passage and search below. */
export interface ReaderChrome {
  mode: "reader"
  themeMode: ThemeMode
  passageLabel: string
  passageAccessibilityLabel: string
  chapterNavigation: boolean
  canGoPrevious: boolean
  canGoNext: boolean
  search: boolean
  /** null hides the view-mode toggle. */
  viewMode: "scrolling" | "paged" | null
  autoScrollVisible: boolean
  autoScrollAvailable: boolean
  canShare: boolean
  canReport: boolean
  /** The colour of the ribbon on this chapter, shown on the passage button. */
  bookmarkColor: string | null
}

/** The search page's bars: Back on top, the search field at the bottom. */
export interface SearchChrome {
  mode: "search"
  themeMode: ThemeMode
  query: string
}

/** A plain page's bars (e.g. the book index): Back, its title and search. */
export interface TitledPageChrome {
  mode: "page"
  themeMode: ThemeMode
  title: string
  search: boolean
}

export type PageChrome = ReaderChrome | SearchChrome | TitledPageChrome

/** Auto-scroll's controls, which take over the reader's toolbar while shown. */
export interface AutoScrollChrome {
  playing: boolean
  speedLabel: string
  canSlower: boolean
  canFaster: boolean
}

/** Mirrors ChromeState in ios/App/App/NativeChrome.swift. */
export type NativeChromeState =
  | (PageChrome & {
      inert: boolean
      collapsed: boolean
      autoScroll: AutoScrollChrome | null
    })
  | { mode: "none" }

/** The bookmarks sheet. Mirrors BookmarksSheetState in BookmarksSheet.swift. */
export interface BookmarksSheetState {
  /** What a free ribbon would mark, e.g. "Mateus 11". */
  currentLabel: string
  ribbons: {
    /** The CSS colour name the bookmark stores. */
    color: string
    /** Spoken name, e.g. "Vermelho". */
    name: string
    /** The passage the ribbon marks, e.g. "Mt 5"; null when it is free. */
    label: string | null
    /** Marks the chapter being read. */
    current: boolean
  }[]
}

/** A verse's footnotes. Mirrors FootnotesSheetState in FootnotesSheet.swift. */
export interface FootnotesSheetState {
  /** The verse, e.g. "Mateus 11,3". */
  title: string
  /** The reader's footnote text size, 1 = 100%. */
  fontScale: number
  notes: {
    /** The note's marker, e.g. "3". */
    reference: string
    /** Text runs; a run with `link` is a reference, reported by index. */
    parts: { text: string; link?: number }[]
  }[]
}

/** The report form. Mirrors ReportSheetState in ReportSheet.swift. */
export interface ReportSheetState {
  /** What is being reported on, e.g. "Encontrou algum problema em …?". */
  message: string
  topics: readonly { value: string; label: string }[]
  placeholder: string
  maxLength: number
}

export interface NativeToastOptions {
  /** Hold the toast until the keyboard closes, so it never covers typing. */
  afterKeyboard?: boolean
  /**
   * Makes the whole toast a button, the message its label, with a close
   * button beside it, as Books' "Back to Page" is. It stays until one of them
   * is tapped or another toast replaces it.
   */
  onTap?: () => void
  /** An SF Symbol before the button's label. */
  symbol?: string
}

/** The space the bars cover, in CSS pixels. */
export interface ChromeInsets {
  top: number
  bottom: number
}

export interface NativeChromePlugin {
  setState(state: NativeChromeState): Promise<ChromeInsets>
  showPicker(data: PassagePickerData): Promise<void>
  showBookmarks(state: BookmarksSheetState): Promise<void>
  /** Refreshes the bookmarks sheet if it is still open. */
  updateBookmarks(state: BookmarksSheetState): Promise<void>
  showFootnotes(state: FootnotesSheetState): Promise<void>
  showToast(options: {
    message: string
    afterKeyboard: boolean
    button?: boolean
    symbol?: string
  }): Promise<void>
  showReport(state: ReportSheetState): Promise<void>
  /** The answer to report-submit: the sheet closes, or shows `message`. */
  finishReport(result: { sent: boolean; message?: string }): Promise<void>
  /** Resolves once the sheet is dismissed, however that happened. */
  showOnboarding(options: {
    steps: NativeOnboardingStep[]
  }): Promise<OnboardingResult>
  addListener(
    eventName: "action",
    listener: (action: NativeChromeAction) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: "insets",
    listener: (insets: ChromeInsets) => void,
  ): Promise<PluginListenerHandle>
}

/** Backdrop of an open dialog or bottom sheet (menus use a transparent one). */
const MODAL_BACKDROP = ".cdk-overlay-dark-backdrop.cdk-overlay-backdrop-showing"

/** What a tap in the text belongs to, rather than to the bars. */
const TAP_TARGETS =
  'a[href], button, input, select, textarea, label, [role="button"], [role="link"], [contenteditable="true"]'

/** Scroll this far in one direction to hide or bring back the reader's bars. */
export const COLLAPSE_DISTANCE = 24

/**
 * How long after a touch a scroll still counts as the reader's own, which
 * covers momentum scrolling. Other scrolls (opening a verse, restoring the
 * position) don't hide the bars.
 */
export const USER_SCROLL_WINDOW_MS = 2000

/**
 * The iOS app draws its bars natively, so they get the system's Liquid Glass.
 * Pages stay in charge: they send what the bars show (`show`), render no web
 * header of their own, and handle the taps from `actions$`.
 *
 * The bars float over the web view without changing its safe area, so the
 * page pads its scrolling content by `--native-chrome-top` and
 * `--native-chrome-bottom`, set here, and the text scrolls under the glass.
 * The bars sit above the whole web view, so a panel or dialog would open under
 * them; while one is open (a dark backdrop shows) the reader's bars slide away,
 * and any bars left turn inert.
 */
@Injectable({
  providedIn: "root",
})
export class NativeChromeService {
  private readonly document = inject(DOCUMENT)
  private readonly ngZone = inject(NgZone)
  private readonly plugin = inject(NATIVE_CHROME_PLUGIN)
  private readonly overlayContainer = inject(OverlayContainer)
  private readonly actionSubject = new Subject<NativeChromeAction>()
  private initialized = false
  private pendingHide?: ReturnType<typeof setTimeout>
  /** What the current page asked for; null when it has no native bars. */
  private requested: PageChrome | null = null
  private modalOpen = false
  private collapsed = false
  private autoScroll: AutoScrollChrome | null = null
  /** What tapping the current toast does, when it is a button. */
  private toastAction?: () => void

  /** True in the iOS app, whose shell provides the NativeChrome plugin. */
  readonly enabled =
    Capacitor.getPlatform() === "ios" &&
    Capacitor.isPluginAvailable("NativeChrome")

  /** Taps on the native bars, delivered inside the Angular zone. */
  readonly actions$ = this.actionSubject.asObservable()

  init(): void {
    if (!this.enabled || this.initialized) return
    this.initialized = true
    // Layout hook: pages drop the space they keep for their web headers.
    this.document.body.classList.add("native-chrome")
    void this.plugin.addListener("action", (action) =>
      this.ngZone.run(() => {
        if (action.id === "scroll-top") {
          this.scrollToTop()
        } else if (action.id === "toast-action") {
          const run = this.toastAction
          this.toastAction = undefined
          run?.()
        } else {
          this.actionSubject.next(action)
        }
      }),
    )
    void this.plugin.addListener("insets", (insets) => this.applyInsets(insets))

    const overlays = this.overlayContainer.getContainerElement()
    new MutationObserver(() => {
      const modalOpen = overlays.querySelector(MODAL_BACKDROP) !== null
      if (modalOpen === this.modalOpen) return
      this.modalOpen = modalOpen
      this.push()
    }).observe(overlays, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    })
  }

  show(page: PageChrome): void {
    if (!this.enabled) return
    clearTimeout(this.pendingHide)
    this.pendingHide = undefined
    this.requested = page
    this.push()
  }

  /**
   * Deferred, so that a page handing over to the next one (a route change
   * recreates the reader) doesn't flash the bars out and back in.
   */
  hide(): void {
    if (!this.enabled) return
    clearTimeout(this.pendingHide)
    this.pendingHide = setTimeout(() => {
      this.pendingHide = undefined
      this.requested = null
      this.push()
    })
  }

  /** Shows auto-scroll's controls in the reader's toolbar; null restores it. */
  setAutoScroll(state: AutoScrollChrome | null): void {
    if (!this.enabled) return
    // Leaving auto-scroll leaves the bars up: its own scrolling doesn't count
    // as reading on.
    if (!state) this.collapsed = false
    this.autoScroll = state
    this.push()
  }

  showPicker(data: PassagePickerData): void {
    if (!this.enabled) return
    this.plugin.showPicker(data).catch(() => {})
  }

  showBookmarks(state: BookmarksSheetState): void {
    if (!this.enabled) return
    this.plugin.showBookmarks(state).catch(() => {})
  }

  updateBookmarks(state: BookmarksSheetState): void {
    if (!this.enabled) return
    this.plugin.updateBookmarks(state).catch(() => {})
  }

  /** A glass toast above the bottom bar; see ToastService. */
  toast(message: string, options: NativeToastOptions = {}): void {
    if (!this.enabled) return
    const { afterKeyboard = false, onTap, symbol } = options
    // It replaces the toast before, and that one's action with it.
    this.toastAction = onTap
    this.plugin
      .showToast(
        onTap
          ? { message, afterKeyboard, button: true, ...(symbol && { symbol }) }
          : { message, afterKeyboard },
      )
      .catch(() => {})
  }

  showReport(state: ReportSheetState): void {
    if (!this.enabled) return
    this.plugin.showReport(state).catch(() => {})
  }

  finishReport(result: { sent: boolean; message?: string }): void {
    if (!this.enabled) return
    this.plugin.finishReport(result).catch(() => {})
  }

  showFootnotes(state: FootnotesSheetState): void {
    if (!this.enabled) return
    this.plugin.showFootnotes(state).catch(() => {})
  }

  /** The onboarding as a native sheet; resolves when it is dismissed. */
  showOnboarding(steps: NativeOnboardingStep[]): Promise<OnboardingResult> {
    return this.plugin
      .showOnboarding({ steps })
      .catch(() => ({ completed: false, lastStep: steps[0]?.id ?? "" }))
  }

  /**
   * Hides the reader's bars while `element` scrolls down and brings them back
   * when it scrolls up or reaches either end. A tap on the text shows them, or
   * hides them again, as in Photos and Books; a tap on a link, an asterisk or
   * another control stays that control's. Returns the cleanup.
   */
  trackScroll(element: HTMLElement): () => void {
    if (!this.enabled) return () => {}
    let lastTop = element.scrollTop
    let anchor = lastTop
    let direction = 0
    let lastTouch = Number.NEGATIVE_INFINITY
    const onTouch = () => {
      lastTouch = performance.now()
    }
    const onScroll = () => {
      const top = element.scrollTop
      const step = Math.sign(top - lastTop)
      if (step !== 0 && step !== direction) {
        // Turned around: measure from here.
        direction = step
        anchor = lastTop
      }
      lastTop = top
      const atEnd =
        top <= 0 || top + element.clientHeight >= element.scrollHeight - 1
      if (performance.now() - lastTouch > USER_SCROLL_WINDOW_MS) {
        // Not the reader's scroll: start measuring afresh from here.
        anchor = top
        if (atEnd) this.setCollapsed(false)
        return
      }
      if (atEnd || anchor - top >= COLLAPSE_DISTANCE) {
        this.setCollapsed(false)
      } else if (top - anchor >= COLLAPSE_DISTANCE) {
        this.setCollapsed(true)
      }
    }
    // A tap that only dismisses a text selection isn't meant for the bars.
    let selecting = false
    const onPointerDown = () => {
      selecting = !(this.document.getSelection?.()?.isCollapsed ?? true)
    }
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null
      if (event.defaultPrevented || selecting || target?.closest(TAP_TARGETS)) {
        return
      }
      this.setCollapsed(!this.collapsed)
    }
    const events = ["touchstart", "touchmove", "touchend", "wheel"]
    // Scrolling needs no change detection.
    this.ngZone.runOutsideAngular(() => {
      element.addEventListener("scroll", onScroll, { passive: true })
      for (const event of events) {
        element.addEventListener(event, onTouch, { passive: true })
      }
      element.addEventListener("pointerdown", onPointerDown, { passive: true })
      element.addEventListener("click", onClick)
    })
    return () => {
      element.removeEventListener("scroll", onScroll)
      for (const event of events) element.removeEventListener(event, onTouch)
      element.removeEventListener("pointerdown", onPointerDown)
      element.removeEventListener("click", onClick)
      this.setCollapsed(false)
    }
  }

  /**
   * A tap on the status bar. iOS scrolls the web view to the top, but pages
   * scroll in elements of their own: this scrolls the one under the middle of
   * the screen (the reader's text, the search results) and brings the bars
   * back, as iOS does.
   */
  private scrollToTop(): void {
    const view = this.document.defaultView
    if (!view) return
    this.setCollapsed(false)
    let element = this.document.elementFromPoint(
      view.innerWidth / 2,
      view.innerHeight / 2,
    )
    // The document itself is the web view's to scroll.
    while (element && element !== this.document.scrollingElement) {
      if (element.scrollTop > 0) {
        // Auto-scroll moves the text every frame, which would stop a glide.
        const jump =
          this.autoScroll?.playing ||
          view.matchMedia("(prefers-reduced-motion: reduce)").matches
        element.scrollTo({ top: 0, behavior: jump ? "auto" : "smooth" })
        return
      }
      element = element.parentElement
    }
  }

  private setCollapsed(collapsed: boolean): void {
    if (collapsed === this.collapsed) return
    this.collapsed = collapsed
    this.push()
  }

  private push(): void {
    const reader = this.requested?.mode === "reader"
    const state: NativeChromeState = this.requested
      ? {
          ...this.requested,
          inert: this.modalOpen,
          // Auto-scroll's pause button must stay within reach, except under
          // a panel, which the bars would cover.
          collapsed:
            reader && (this.modalOpen || (this.collapsed && !this.autoScroll)),
          autoScroll: reader ? this.autoScroll : null,
        }
      : { mode: "none" }
    // Lets the page draw its edge effects to match.
    this.document.body.classList.toggle(
      "native-chrome-collapsed",
      state.mode === "reader" && state.collapsed,
    )
    this.plugin.setState(state).then(
      (insets) => this.applyInsets(insets),
      () => {},
    )
  }

  private applyInsets({ top, bottom }: ChromeInsets): void {
    const style = this.document.documentElement.style
    style.setProperty("--native-chrome-top", `${top}px`)
    style.setProperty("--native-chrome-bottom", `${bottom}px`)
  }
}
