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
    { value: 1 / 6, label: "1/6" },
    { value: 1 / 5, label: "1/5" },
    { value: 1 / 4, label: "1/4" },
    { value: 1 / 3, label: "1/3" },
    { value: 1 / 2, label: "1/2" },
    { value: 2 / 3, label: "2/3" },
  ]
  private readonly FRACTIONAL_EPSILON = 0.002

  private autoScrollFrame?: number
  private lastAutoScrollTimestamp?: number
  private accumulatedScrollDelta = 0
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

  private getFractionalLabel(value: number): string | null {
    if (value >= 1) {
      return null
    }
    const match = this.FRACTIONAL_SPEED_STEPS.find(
      (step) => Math.abs(step.value - value) <= this.FRACTIONAL_EPSILON,
    )
    return match?.label ?? null
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
    this.autoScrollEnabled = true
    this.keepAwakeService.start()
    this.setupLineHeightObserver()
    this.autoScrollFrame = window.requestAnimationFrame((timestamp) => {
      this.stepAutoScroll(timestamp)
    })
  }

  stop(): void {
    const wasActive = this.autoScrollEnabled
    this.autoScrollEnabled = false
    if (this.autoScrollFrame) {
      window.cancelAnimationFrame(this.autoScrollFrame)
      this.autoScrollFrame = undefined
    }
    this.lastAutoScrollTimestamp = undefined
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

    // Accumulate scroll delta to avoid micro-scrolls at very slow speeds
    this.accumulatedScrollDelta += scrollDelta

    // Only apply scroll when accumulated delta is at least 0.5px to prevent jank
    if (Math.abs(this.accumulatedScrollDelta) >= 0.5) {
      const nextTop = Math.min(
        content.scrollHeight - content.clientHeight,
        content.scrollTop + this.accumulatedScrollDelta,
      )

      content.scrollTop = nextTop
      this.accumulatedScrollDelta = 0
    }

    this.lastAutoScrollTimestamp = timestamp

    if (content.scrollTop + 5 >= content.scrollHeight - content.clientHeight) {
      this.stop()
      return
    }

    if (this.autoScrollEnabled) {
      this.autoScrollFrame = window.requestAnimationFrame((nextTimestamp) => {
        this.stepAutoScroll(nextTimestamp)
      })
    }
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
