import { OverlayContainer } from "@angular/cdk/overlay"
import { DOCUMENT } from "@angular/common"
import { Injectable, inject, NgZone } from "@angular/core"
import { Capacitor } from "@capacitor/core"
import { Subject } from "rxjs"
import type { OnboardingResult } from "../components/onboarding/onboarding.component"
import type { NativeOnboardingStep } from "../components/onboarding/onboarding-content"
import { NATIVE_CHROME_PLUGIN } from "../tokens"
import type { PassagePickerData } from "../utils/passage-picker"
import {
  currentSectionHeading,
  presented,
  scrollProgress,
} from "./native-chrome.helpers"
import type {
  AutoScrollChrome,
  BookmarksSheetState,
  ChromeInsets,
  FootnotesSheetState,
  NativeChromeAction,
  NativeChromeState,
  NativePalette,
  NativeShareOptions,
  NativeToastOptions,
  PageChrome,
  ReportSheetState,
} from "./native-chrome.types"

/** Backdrop of an open dialog or bottom sheet (menus use a transparent one). */
const MODAL_BACKDROP = ".cdk-overlay-dark-backdrop.cdk-overlay-backdrop-showing"

/** What a tap in the text belongs to, rather than to the bars. */
const TAP_TARGETS =
  'a[href], button, input, select, textarea, label, [role="button"], [role="link"], [contenteditable="true"]'

/** Scroll this far in one direction to hide or bring back the reader's bars. */
export const COLLAPSE_DISTANCE = 24

/**
 * The Android app's: hidden after a line and a bit down, back after two
 * lines up, so re-reading a line doesn't bring the bar over the text.
 */
export const ANDROID_HIDE_DISTANCE = 32
export const ANDROID_REVEAL_DISTANCE = 64

/** Or a flick up at this speed (px/ms; 1 is 1000 dp/s): someone looking for the bars. */
export const FLING_REVEAL_SPEED = 1

/**
 * How long after a touch a scroll still counts as the reader's own, which
 * covers momentum scrolling. Other scrolls (opening a verse, restoring the
 * position) don't hide the bars.
 */
export const USER_SCROLL_WINDOW_MS = 2000

/** The apps whose shells draw the bars: UIKit on iOS, Material 3 on Android. */
const NATIVE_CHROME_PLATFORMS = ["ios", "android"]

/** The reading position is worked out at most this often while the text moves. */
const READING_INTERVAL_MS = 50

/** How long the reader may still be landing on a passage after "Voltar para …" shows. */
const RETURN_TOAST_SETTLE_MS = 1500

/** Scrolled this far, the text has reached the bar: the reader's top margin. */
const SCROLLED_UNDER_BAR = 8

/**
 * The native apps draw their bars natively, so they get the system's look:
 * Liquid Glass on iOS, Material 3 on Android (NativeChromePlugin.kt).
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
  /** Counts the toasts shown, so a stale one's hide does nothing. */
  private toastCount = 0
  /** The bars' state as last sent to the shell (push). */
  private lastSent?: string
  /** The shell says whether its bars did hide (ChromeInsets.collapsed). */
  private collapseReported = false
  /** Text under the top bar; followed in the Android app only (see scrolled). */
  private scrolled = false
  /** The section heading under the passage (Android); see currentSectionHeading. */
  private subtitle: string | null = null
  /** The reader's scrolling element (trackScroll), and the one that last scrolled in it. */
  private tracked?: HTMLElement
  private lastScroller?: Element
  private readingFrame?: number
  /** The progress line's value as last sent. */
  private sentProgress?: number | null
  /** When the reading position was last worked out (scheduleReading). */
  private lastReading = Number.NEGATIVE_INFINITY
  /** Takes the "Voltar para …" toast down once the reader reads on (Android). */
  private returnToastHide?: () => void
  /** Where the page was scrolled to when that toast showed, and when. */
  private returnToastScrollStart?: number
  private returnToastShownAt = 0
  /** Where the top bar ends, in CSS pixels (--native-chrome-top). */
  private insetTop = 0

  /** True in the iOS and Android apps, whose shells provide the NativeChrome plugin. */
  readonly enabled =
    NATIVE_CHROME_PLATFORMS.includes(Capacitor.getPlatform()) &&
    Capacitor.isPluginAvailable("NativeChrome")

  /**
   * The Android app: Material's bars, which scroll away with the text, show
   * where in the chapter the reader is, and leave chapter cards in the text.
   */
  readonly android = this.enabled && Capacitor.getPlatform() === "android"

  /**
   * Taps on the native bars. The app is zoneless: a handler re-renders what it
   * changes by marking it (markForCheck, detectChanges, or an output).
   */
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
        } else if (action.id === "show-bars") {
          this.setCollapsed(false)
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
    void this.plugin.addListener("palette", (palette) =>
      this.applyPalette(palette),
    )

    // Whichever element a page scrolls in: scroll events don't bubble, but
    // they pass the document on their way down. Only the Android bar shows
    // it; on iOS each push rebuilds the bars, for nothing.
    if (Capacitor.getPlatform() === "android") {
      this.ngZone.runOutsideAngular(() =>
        this.document.addEventListener(
          "scroll",
          (event) => this.onScroll(event),
          { capture: true, passive: true },
        ),
      )
    }

    // The theme can change under the page without a page asking: the
    // system's switch, which "Automático" follows (ThemeService). The bars
    // take the page's colour again, as when a page shows them.
    new MutationObserver(() => this.push()).observe(
      this.document.documentElement,
      { attributes: true, attributeFilter: ["class"] },
    )

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
    // Another kind of page starts at its top.
    if (this.requested?.mode !== page.mode) this.scrolled = false
    this.requested = page
    this.push()
    // A chapter of its own: where it is read from may not scroll to tell.
    this.scheduleReading()
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

  /** Shows auto-scroll's controls above the reader's toolbar; null hides them. */
  setAutoScroll(state: AutoScrollChrome | null): void {
    if (!this.enabled) return
    const wasPlaying = this.autoScroll?.playing ?? false
    if (!state) {
      // Leaving auto-scroll leaves the bars up: its own scrolling doesn't
      // count as reading on.
      this.collapsed = false
    } else if (state.playing !== wasPlaying) {
      // Reading hands-free, the bars make way and auto-scroll's controls
      // take the toolbar's place; pausing brings them back.
      this.collapsed = state.playing
    }
    this.autoScroll = state
    this.push()
  }

  showPicker(data: PassagePickerData): void {
    if (!this.enabled) return
    this.plugin.showPicker(data).catch(() => {})
  }

  /** Whether the sheet came up; it doesn't over another one. */
  showBookmarks(state: BookmarksSheetState): Promise<boolean> {
    if (!this.enabled) return Promise.resolve(false)
    return presented(this.plugin.showBookmarks(state))
  }

  updateBookmarks(state: BookmarksSheetState): void {
    if (!this.enabled) return
    this.plugin.updateBookmarks(state).catch(() => {})
  }

  /**
   * A glass toast above the bottom bar; see ToastService. Returns what takes
   * it down early, which leaves a toast that has replaced it alone.
   */
  toast(message: string, options: NativeToastOptions = {}): () => void {
    if (!this.enabled) return () => {}
    const { onTap, symbol, returnToPage } = options
    // It replaces the toast before, and that one's action with it.
    this.toastAction = onTap
    const shown = ++this.toastCount
    this.returnToastHide = undefined
    this.returnToastScrollStart = undefined
    this.plugin
      .showToast(
        onTap
          ? { message, button: true, ...(symbol && { symbol }) }
          : { message },
      )
      .catch(() => {})
    const hide = () => {
      if (shown !== this.toastCount) return
      this.toastAction = undefined
      this.returnToastHide = undefined
      this.plugin.hideToast().catch(() => {})
    }
    if (onTap && returnToPage) {
      this.returnToastHide = hide
      this.returnToastShownAt = performance.now()
    }
    return hide
  }

  /** Whether the sheet came up; it doesn't over another one. */
  showReport(state: ReportSheetState): Promise<boolean> {
    if (!this.enabled) return Promise.resolve(false)
    return presented(this.plugin.showReport(state))
  }

  finishReport(result: { sent: boolean; message?: string }): void {
    if (!this.enabled) return
    this.plugin.finishReport(result).catch(() => {})
  }

  /** Whether the sheet came up; it doesn't over another one. */
  showFootnotes(state: FootnotesSheetState): Promise<boolean> {
    if (!this.enabled) return Promise.resolve(false)
    return presented(this.plugin.showFootnotes(state))
  }

  /**
   * The system share sheet, which previews the link with the app's icon: left
   * to itself, iOS fetches the website's, which has the WEB sash. Whether
   * something was shared.
   */
  share(options: NativeShareOptions): Promise<boolean> {
    if (!this.enabled) return Promise.resolve(false)
    return this.plugin.share(options).then(
      (result) => result?.completed === true,
      () => false,
    )
  }

  /**
   * The onboarding as a native sheet; resolves when it is dismissed, or with
   * null when it never came up (e.g. over a sheet still on its way), which
   * isn't the onboarding seen.
   */
  showOnboarding(
    steps: NativeOnboardingStep[],
  ): Promise<OnboardingResult | null> {
    return this.plugin.showOnboarding({ steps }).then(
      (result) =>
        result?.presented === true
          ? {
              completed: result.completed ?? false,
              lastStep: result.lastStep ?? "",
            }
          : null,
      () => null,
    )
  }

  /**
   * Hides the reader's bars while `element` scrolls down and brings them back
   * when it scrolls up or reaches either end. A tap on the text shows them, or
   * hides them again, as in Photos and Books; a tap on a link, a notes marker or
   * another control stays that control's. On Android the bars follow the
   * scrolling, as Material's do, with more scrolling up than down to bring
   * them back, or a flick; a tap only shows hidden ones, except in pages,
   * which don't scroll and keep the toggle. Returns the cleanup.
   */
  trackScroll(element: HTMLElement): () => void {
    if (!this.enabled) return () => {}
    this.tracked = element
    this.lastScroller = undefined
    this.scheduleReading()
    let lastTop = element.scrollTop
    let lastTime = performance.now()
    let anchor = lastTop
    let direction = 0
    let lastTouch = Number.NEGATIVE_INFINITY
    const hideAfter = this.android ? ANDROID_HIDE_DISTANCE : COLLAPSE_DISTANCE
    const showAfter = this.android ? ANDROID_REVEAL_DISTANCE : COLLAPSE_DISTANCE
    const onTouch = () => {
      lastTouch = performance.now()
    }
    const onScroll = () => {
      const top = element.scrollTop
      const now = performance.now()
      const step = Math.sign(top - lastTop)
      // How fast it is going up, px/ms.
      const upSpeed = (lastTop - top) / Math.max(now - lastTime, 1)
      if (step !== 0 && step !== direction) {
        // Turned around: measure from here.
        direction = step
        anchor = lastTop
      }
      lastTop = top
      lastTime = now
      const atEnd =
        top <= 0 || top + element.clientHeight >= element.scrollHeight - 1
      if (now - lastTouch > USER_SCROLL_WINDOW_MS) {
        // Not the reader's scroll: start measuring afresh from here. In the
        // Android app, a scroll up that is no finger's (a keyboard, Voice
        // Access, a switch) brings the bars back, as scrolling up does.
        anchor = top
        if (atEnd || (this.android && step < 0)) this.setCollapsed(false)
        return
      }
      if (
        atEnd ||
        anchor - top >= showAfter ||
        (this.android && upSpeed >= FLING_REVEAL_SPEED)
      ) {
        this.setCollapsed(false)
      } else if (top - anchor >= hideAfter) {
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
      if (this.android && element.scrollHeight > element.clientHeight + 1) {
        // Material's bars follow the scrolling; a tap only brings hidden
        // ones back, for whoever doesn't think to scroll up. Not while
        // auto-scroll reads on.
        if (this.collapsed && !this.autoScroll?.playing) {
          this.setCollapsed(false)
        }
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
      if (this.tracked === element) {
        this.tracked = undefined
        this.lastScroller = undefined
        this.subtitle = null
        this.sendProgress(null)
      }
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

  private onScroll(event: Event): void {
    const target = event.target instanceof Element ? event.target : null
    let top: number
    if (this.tracked) {
      // The reader: its own text, read from its scroller, whichever part of
      // it moved (pages scroll across in an element inside). Not a list
      // beside it, such as the book drawer's.
      if (
        !target ||
        !(target === this.tracked || this.tracked.contains(target))
      ) {
        return
      }
      this.lastScroller = target
      this.scheduleReading()
      top = this.tracked.scrollTop
    } else {
      // Other pages scroll in an element of their own, but a menu's or a
      // dialog's list isn't the page.
      if (
        target &&
        this.overlayContainer.getContainerElement().contains(target)
      ) {
        return
      }
      top = target
        ? target.scrollTop
        : (this.document.scrollingElement?.scrollTop ?? 0)
    }
    this.dismissReturnToastAfterScroll(top)
    // The text reaches the bar only past the reader's own top margin.
    const scrolled = top > SCROLLED_UNDER_BAR
    if (scrolled === this.scrolled) return
    this.scrolled = scrolled
    this.push()
  }

  /**
   * "Voltar para …" stays until it is used, closed, or the reader has read
   * on a screen's height from where it showed (Android): never on a timer,
   * which hurries slow readers.
   */
  private dismissReturnToastAfterScroll(top: number): void {
    if (!this.android || this.returnToastHide === undefined) return
    // The reader lands on the verse as the toast shows: that scroll is the
    // app's, so the reading is measured from where it settles.
    if (performance.now() - this.returnToastShownAt < RETURN_TOAST_SETTLE_MS) {
      this.returnToastScrollStart = top
      return
    }
    this.returnToastScrollStart ??= top
    const view = this.document.defaultView
    if (!view) return
    if (Math.abs(top - this.returnToastScrollStart) < view.innerHeight) return
    const hide = this.returnToastHide
    this.returnToastHide = undefined
    hide()
  }

  /**
   * Where the reader is (Android): the progress line and the section's
   * heading, once a frame at most while the text moves.
   */
  private scheduleReading(): void {
    if (!this.android || this.readingFrame !== undefined) return
    const view = this.document.defaultView
    if (!view) return
    // At most 20 times a second: each update reads the layout and crosses
    // the bridge. The last scroll still gets its update, a little later.
    const wait = Math.max(
      0,
      READING_INTERVAL_MS - (performance.now() - this.lastReading),
    )
    this.ngZone.runOutsideAngular(() => {
      this.readingFrame = view.setTimeout(() => {
        view.requestAnimationFrame(() => {
          this.readingFrame = undefined
          this.lastReading = performance.now()
          this.updateReading()
        })
      }, wait)
    })
  }

  private updateReading(): void {
    const element = this.tracked
    if (!element || this.requested?.mode !== "reader") return
    const scroller = this.lastScroller?.isConnected
      ? this.lastScroller
      : element
    this.sendProgress(scrollProgress(scroller) ?? scrollProgress(element))
    const subtitle = currentSectionHeading(element, this.insetTop)
    if (subtitle === this.subtitle) return
    this.subtitle = subtitle
    this.push()
  }

  private sendProgress(value: number | null): void {
    if (!this.android || value === this.sentProgress) return
    this.sentProgress = value
    this.plugin.setProgress({ value }).catch(() => {})
  }

  /** The page's background colour as declared (`#ffffff`, `#121212`). */
  private pageColor(): string | null {
    const view = this.document.defaultView
    const root = this.document.documentElement
    if (typeof view?.getComputedStyle !== "function" || !root) return null
    return (
      view
        .getComputedStyle(root)
        .getPropertyValue("--background-color")
        .trim() || null
    )
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
          // While auto-scroll plays, its controls stay within reach as the
          // bars hide; paused, its play button hides with them.
          collapsed: reader && (this.modalOpen || this.collapsed),
          scrolled: this.scrolled,
          autoScroll: reader ? this.autoScroll : null,
          subtitle: reader ? this.subtitle : null,
          pageColor: this.pageColor(),
        }
      : { mode: "none" }
    // Lets the page draw its edge effects to match. Once the shell says
    // whether the bars did hide (applyInsets), it decides: under VoiceOver
    // they stay, and the text mustn't show where the fades were.
    if (!this.collapseReported) {
      this.document.body.classList.toggle(
        "native-chrome-collapsed",
        state.mode === "reader" && state.collapsed,
      )
    }
    // Pages ask for the same bars several times as they start; each push has
    // the shell rebuild them.
    const sent = JSON.stringify(state)
    if (sent === this.lastSent) return
    this.lastSent = sent
    this.plugin.setState(state).then(
      (insets) => this.applyInsets(insets),
      () => {
        // Not applied: the next push must not be skipped as a repeat.
        if (this.lastSent === sent) this.lastSent = undefined
      },
    )
  }

  /**
   * The Android bars take the wallpaper's colours (or the brown): the
   * chapter cards, which sit among them, follow (styles.css). On the body,
   * over the stylesheet's own fallback there.
   */
  private applyPalette({ surfaceContainerHigh }: NativePalette): void {
    if (!surfaceContainerHigh) return
    this.document.body.style.setProperty(
      "--android-surface-container-high",
      surfaceContainerHigh,
    )
  }

  private applyInsets({ top, bottom, collapsed }: ChromeInsets): void {
    this.insetTop = top
    const style = this.document.documentElement.style
    style.setProperty("--native-chrome-top", `${top}px`)
    style.setProperty("--native-chrome-bottom", `${bottom}px`)
    if (collapsed !== undefined) {
      this.collapseReported = true
      this.document.body.classList.toggle("native-chrome-collapsed", collapsed)
    }
  }
}
