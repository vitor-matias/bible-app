import { Injectable, OnDestroy } from "@angular/core"
import { KeepAwakeService } from "./keep-awake.service"

type AutoScrollConfig = {
  scrollElement: HTMLElement | null
  lineHeightElement?: HTMLElement | null
  onStop?: () => void
}

@Injectable({
  providedIn: "root",
})
export class AutoScrollService implements OnDestroy {
  autoScrollEnabled = false
  autoScrollLinesPerSecond = 1
  readonly MIN_AUTO_SCROLL_LPS = 1 / 6
  readonly MAX_AUTO_SCROLL_LPS = 4
  readonly AUTO_SCROLL_STEP = 0.25
  private readonly FRACTIONAL_SPEED_STEPS = [
    { value: 1 / 6, label: "1/6", spoken: "um sexto de linha" },
    { value: 1 / 5, label: "1/5", spoken: "um quinto de linha" },
    { value: 1 / 4, label: "1/4", spoken: "um quarto de linha" },
    { value: 1 / 3, label: "1/3", spoken: "um terço de linha" },
    { value: 1 / 2, label: "1/2", spoken: "meia linha" },
    { value: 2 / 3, label: "2/3", spoken: "dois terços de linha" },
    { value: 3 / 4, label: "3/4", spoken: "três quartos de linha" },
    { value: 4 / 5, label: "4/5", spoken: "quatro quintos de linha" },
  ]
  private readonly FRACTIONAL_EPSILON = 0.002
  /** Pixels the page may sit from where auto-scroll left it: rounding, not a reader. */
  private readonly USER_SCROLL_TOLERANCE = 1
  /** How long the page has to stand still before play takes it over. */
  private readonly SETTLE_MS = 100

  private autoScrollFrame?: number
  private lastAutoScrollTimestamp?: number
  private accumulatedScrollDelta = 0
  /**
   * Where auto-scroll left the page. Found anywhere else on the next frame, a
   * finger, the wheel, a key or the scrollbar moved it: the reader took over.
   */
  private expectedScrollTop = 0
  /**
   * How tall the text was then. When it changed too, the text reflowed (a
   * new text size, verses loading) and the browser moved the page to keep
   * the reader's place: that is no reader scrolling.
   */
  private expectedScrollHeight = 0
  /**
   * Play waits for the page to stand still. Pressed while a flick still
   * carries it (iOS's momentum runs on, as the native ▶ is no touch on the
   * text), that coast is not the reader taking over.
   */
  private settling = false
  /** Since when the page has stood still, while play waits. */
  private stillSince?: number
  private cachedLineHeight = 24
  private lineHeightObserver?: ResizeObserver
  private scrollElement?: HTMLElement
  private lineHeightElement?: HTMLElement
  private onStop?: () => void

  constructor(private keepAwakeService: KeepAwakeService) {}

  ngOnDestroy(): void {
    this.stop()
  }

  setAutoScrollLinesPerSecond(value: number): number {
    const nextSpeed = Math.min(
      this.MAX_AUTO_SCROLL_LPS,
      Math.max(this.MIN_AUTO_SCROLL_LPS, value),
    )
    this.autoScrollLinesPerSecond = Number(nextSpeed.toFixed(4))
    return this.autoScrollLinesPerSecond
  }

  updateAutoScrollSpeed(delta: number): number {
    const direction = Math.sign(delta)
    if (direction === 0) {
      return this.autoScrollLinesPerSecond
    }
    // Speeds below 1 line/sec snap through the curated fractional presets so the
    // UI exposes readable labels such as 1/2 or 3/4 instead of awkward decimals.
    const nextSpeed = this.getNextSpeed(
      this.autoScrollLinesPerSecond,
      direction,
    )
    return this.setAutoScrollLinesPerSecond(nextSpeed)
  }

  getAutoScrollSpeedLabel(value: number): string {
    const fractionalLabel = this.getFractionalLabel(value)
    if (fractionalLabel) {
      return fractionalLabel
    }
    const rounded = Number(value.toFixed(2))
    return Number.isInteger(rounded) ? rounded.toString() : rounded.toString()
  }

  /**
   * The speed in words, for screen readers, which can't say "1/2 ln/s":
   * "meia linha por segundo", "1,25 linhas por segundo".
   */
  getAutoScrollSpeedSpokenLabel(value: number): string {
    const fraction = this.getFractionalStep(value)
    if (fraction) {
      return `${fraction.spoken} por segundo`
    }
    const rounded = Number(value.toFixed(2))
    const lines = rounded === 1 ? "linha" : "linhas"
    return `${String(rounded).replace(".", ",")} ${lines} por segundo`
  }

  private getFractionalLabel(value: number): string | null {
    return this.getFractionalStep(value)?.label ?? null
  }

  private getFractionalStep(value: number) {
    if (value >= 1) {
      return undefined
    }
    return this.FRACTIONAL_SPEED_STEPS.find(
      (step) => Math.abs(step.value - value) <= this.FRACTIONAL_EPSILON,
    )
  }

  private getNextSpeed(current: number, direction: number): number {
    if (direction > 0) {
      if (current < 1) {
        const nextFraction = this.FRACTIONAL_SPEED_STEPS.find(
          (step) => step.value - current > this.FRACTIONAL_EPSILON,
        )
        if (nextFraction) {
          return nextFraction.value
        }
        return 1
      }
      return current + this.AUTO_SCROLL_STEP
    }

    if (current <= 1) {
      const reversed = [...this.FRACTIONAL_SPEED_STEPS].reverse()
      const prevFraction = reversed.find(
        (step) => current - step.value > this.FRACTIONAL_EPSILON,
      )
      return prevFraction?.value ?? this.FRACTIONAL_SPEED_STEPS[0].value
    }

    return current - this.AUTO_SCROLL_STEP
  }

  start({ scrollElement, lineHeightElement, onStop }: AutoScrollConfig): void {
    // Restart from a clean state so switching chapters or containers never keeps
    // an old frame loop or observer alive.
    this.stop()
    this.scrollElement = scrollElement ?? undefined
    this.lineHeightElement = lineHeightElement ?? undefined
    this.onStop = onStop
    if (!this.scrollElement) {
      this.autoScrollEnabled = false
      return
    }

    this.lastAutoScrollTimestamp = undefined
    this.accumulatedScrollDelta = 0
    this.expectedScrollTop = this.scrollElement.scrollTop
    this.expectedScrollHeight = this.scrollElement.scrollHeight
    this.settling = true
    this.stillSince = undefined
    this.autoScrollEnabled = true
    this.keepAwakeService.start()
    this.setupLineHeightObserver()
    this.requestNextStep()
  }

  stop(): void {
    const wasActive = this.autoScrollEnabled
    this.autoScrollEnabled = false
    if (this.autoScrollFrame) {
      window.cancelAnimationFrame(this.autoScrollFrame)
      this.autoScrollFrame = undefined
    }
    this.lastAutoScrollTimestamp = undefined
    this.settling = false
    this.stillSince = undefined
    this.cleanupLineHeightObserver()
    if (wasActive) {
      this.keepAwakeService.stop()
    }
    if (wasActive) {
      this.onStop?.()
    }
  }

  private stepAutoScroll(timestamp: number): void {
    const content = this.scrollElement
    if (!content) {
      this.stop()
      return
    }

    const moved =
      Math.abs(content.scrollTop - this.expectedScrollTop) >
      this.USER_SCROLL_TOLERANCE

    // Until the page stands still, follow it without pushing: a coast left
    // from before play, then start from where it comes to rest. Its steps
    // reach the web view unevenly, so one still frame is not yet the end.
    // Every pixel counts here: its tail creeps along a pixel a frame.
    if (this.settling) {
      const crept = content.scrollTop !== this.expectedScrollTop
      this.expectedScrollTop = content.scrollTop
      this.expectedScrollHeight = content.scrollHeight
      if (crept || this.stillSince === undefined) {
        this.stillSince = timestamp
      }
      if (timestamp - this.stillSince < this.SETTLE_MS) {
        this.requestNextStep()
        return
      }
      this.settling = false
    }

    // Scrolling by hand takes over: stop, and leave the page where they put it.
    // A reflow moves the page too, but changes its height; carry on from there.
    if (moved && content.scrollHeight === this.expectedScrollHeight) {
      this.stop()
      return
    }
    this.expectedScrollHeight = content.scrollHeight

    if (this.lastAutoScrollTimestamp === undefined) {
      this.lastAutoScrollTimestamp = timestamp
    }

    const deltaSeconds = Math.min(
      0.1,
      (timestamp - this.lastAutoScrollTimestamp) / 1000,
    )
    const lineHeight = this.cachedLineHeight
    const scrollDelta =
      lineHeight * this.autoScrollLinesPerSecond * deltaSeconds

    // Accumulate sub-pixel movement so very slow speeds still advance smoothly
    // without asking the browser to repaint on every tiny fraction.
    this.accumulatedScrollDelta += scrollDelta

    // Only apply scroll when accumulated delta is at least 0.5px to prevent jank
    if (Math.abs(this.accumulatedScrollDelta) >= 0.5) {
      const previousTop = content.scrollTop
      content.scrollTop = Math.min(
        content.scrollHeight - content.clientHeight,
        previousTop + this.accumulatedScrollDelta,
      )
      // Keep what the browser didn't apply. WebKit (Safari, the iOS app) holds
      // whole pixels only, so a dropped half pixel per frame never moved at all.
      this.accumulatedScrollDelta -= content.scrollTop - previousTop
    }
    // What the browser really holds, whole pixels in WebKit, not what was asked.
    this.expectedScrollTop = content.scrollTop

    this.lastAutoScrollTimestamp = timestamp

    const end = content.scrollHeight - content.clientHeight
    if (content.scrollTop + 5 >= end) {
      // Finish at the very end, not a few pixels short of it: that's where
      // the page counts as read through, and the iOS app's bars come back.
      content.scrollTop = end
      this.expectedScrollTop = content.scrollTop
      this.stop()
      return
    }

    if (this.autoScrollEnabled) {
      this.requestNextStep()
    }
  }

  private requestNextStep(): void {
    this.autoScrollFrame = window.requestAnimationFrame((timestamp) => {
      this.stepAutoScroll(timestamp)
    })
  }

  private getLineHeight(): number {
    const container = this.lineHeightElement
    if (!container) {
      return 24
    }

    const computed = window.getComputedStyle(container)
    const fontSize = Number.parseFloat(computed.fontSize || "16")
    const lineHeightValue = computed.lineHeight
    const lineHeight = Number.parseFloat(lineHeightValue)
    if (Number.isFinite(lineHeight)) {
      return lineHeight
    }

    // "normal" line-height is not numeric, so fall back to the computed font size
    // as a reasonable approximation for scroll pacing.
    return fontSize
  }

  private setupLineHeightObserver(): void {
    this.cleanupLineHeightObserver()

    const container = this.lineHeightElement
    if (!container) {
      this.cachedLineHeight = 24
      return
    }

    // Initialize cached line height
    this.cachedLineHeight = this.getLineHeight()

    // Create ResizeObserver to detect font size changes
    this.lineHeightObserver = new ResizeObserver(() => {
      this.cachedLineHeight = this.getLineHeight()
    })

    this.lineHeightObserver.observe(container)
  }

  private cleanupLineHeightObserver(): void {
    if (this.lineHeightObserver) {
      this.lineHeightObserver.disconnect()
      this.lineHeightObserver = undefined
    }
  }
}
