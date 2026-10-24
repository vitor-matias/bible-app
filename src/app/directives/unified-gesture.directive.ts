import {
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  type OnDestroy,
  type OnInit,
  Output,
  Renderer2,
} from "@angular/core"
import { PreferencesService } from "../services/preferences.service"
import { SystemTextSizeService } from "../services/system-text-size.service"

const MIN_FONT_SIZE = 70
/**
 * As large as the iPhone's third accessibility text size (AX3, 235% of the
 * body text). The two above it left a handful of words to a line.
 */
const MAX_FONT_SIZE = 235
const FONT_STEP = 5

/** The text size's range, for a control that shows it (the Android app's sheet). */
export interface TextSize {
  /** Percent of the standard size. */
  percent: number
  min: number
  max: number
  /** Not at the size the text opens at without a choice of the reader's. */
  canReset: boolean
}

/**
 * The text size (%) a reader opens at: the one chosen in the app; until one
 * is, in the iOS app, the iPhone's own text size, to the nearest step (not
 * saved, so it keeps following it); else null, for the standard size.
 * `system` is asked only when no size was chosen.
 */
export function startingFontSize(
  stored: unknown,
  system: () => number | null,
): number | null {
  const clamp = (size: number) =>
    Math.max(MIN_FONT_SIZE, Math.min(size, MAX_FONT_SIZE))
  if (stored !== null && stored !== undefined) {
    const parsed =
      typeof stored === "number" ? stored : parseFloat(String(stored))
    if (Number.isFinite(parsed)) return clamp(parsed)
  }
  const percent = system()
  return percent === null
    ? null
    : clamp(Math.round(percent / FONT_STEP) * FONT_STEP)
}

@Directive({
  selector: "[unifiedGestures]",
  standalone: true,
  exportAs: "unifiedGestures",
})
export class UnifiedGesturesDirective implements OnInit, OnDestroy {
  @Output() swipeLeft = new EventEmitter<void>()
  @Output() swipeRight = new EventEmitter<void>()
  /** A sideways drag under way: how far (px) the finger is from where it came down. */
  @Output() swipeMove = new EventEmitter<number>()
  /** A sideways drag let go without turning: whatever followed it goes back. */
  @Output() swipeCancel = new EventEmitter<void>()
  @Output() pinchZoom = new EventEmitter<{ scale: number }>()
  /** The text size, as it opens and whenever it changes. */
  @Output() textSizeChange = new EventEmitter<TextSize>()

  private readonly BASE_FONT_SIZE = 100
  private currentFontSize: number
  private readonly FONT_STEP = FONT_STEP

  // Touch tracking variables
  private touches: { [key: number]: Touch } = {}
  private initialDistance = 0
  private initialScale = 1
  private lastScale = 1

  // Swipe tracking
  private swipeStartX = 0
  private swipeStartY = 0
  /** The finger's latest positions, for its speed as it lets go. */
  private swipeSamples: { x: number; time: number }[] = []
  private isSwipeGesture = false
  private isPinchGesture = false

  // Swipes. A diagonal flick while scrolling used to change the chapter.
  /** Movement before a gesture commits to an axis; a scroll stays a scroll. */
  private readonly AXIS_LOCK_DISTANCE = 12
  /** A deliberate drag: this share of the width, at any speed. */
  private readonly SWIPE_MIN_SHARE = 0.35
  /** Or a flick: this far (px), this fast as it lets go (px/ms; 0.6 is 600 px/s). */
  private readonly FLICK_MIN_DISTANCE = 60
  private readonly FLICK_MIN_SPEED = 0.6
  /** Moving back this fast as it lets go, the finger takes the swipe back. */
  private readonly REVERSE_MIN_SPEED = 0.2
  /** The speed on letting go is the speed over this last stretch (ms). */
  private readonly RELEASE_WINDOW = 100
  private swipeAxis: "x" | "y" | null = null
  private readonly MIN_FONT_SIZE = MIN_FONT_SIZE
  private readonly MAX_FONT_SIZE = MAX_FONT_SIZE
  /** Past this, lines are too short to justify: they set ragged-right. */
  private readonly JUSTIFY_MAX_FONT_SIZE = 180
  private readonly boundTouchStart = this.onTouchStart.bind(this)
  private readonly boundTouchMove = this.onTouchMove.bind(this)
  private readonly boundTouchEnd = this.onTouchEnd.bind(this)
  private readonly boundTouchCancel = this.onTouchCancel.bind(this)
  @Input() fontSizeContext?: string

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private preferencesService: PreferencesService,
    private systemTextSize: SystemTextSizeService,
  ) {
    this.currentFontSize = this.BASE_FONT_SIZE
  }

  ngOnInit() {
    const element = this.el.nativeElement
    const size = startingFontSize(
      this.preferencesService.getFontSize(this.getFontSizeContext()),
      () => this.systemTextSize.percent(),
    )
    const hasValidSize = size !== null
    if (size !== null) this.currentFontSize = size

    if (hasValidSize) {
      this.setFontSize(this.currentFontSize)
    } else {
      this.currentFontSize = this.BASE_FONT_SIZE
    }

    this.lastScale = this.currentFontSize / this.BASE_FONT_SIZE
    this.emitTextSize()

    // Let the element keep its own scroll behavior while we take ownership of
    // custom swipe and pinch gestures.
    element.style.touchAction = "pan-y pinch-zoom"

    element.addEventListener("touchstart", this.boundTouchStart, {
      passive: false,
    })
    element.addEventListener("touchmove", this.boundTouchMove, {
      passive: false,
    })
    element.addEventListener("touchend", this.boundTouchEnd, {
      passive: false,
    })
    element.addEventListener("touchcancel", this.boundTouchCancel, {
      passive: false,
    })
  }

  ngOnDestroy() {
    const element = this.el.nativeElement
    element.removeEventListener("touchstart", this.boundTouchStart)
    element.removeEventListener("touchmove", this.boundTouchMove)
    element.removeEventListener("touchend", this.boundTouchEnd)
    element.removeEventListener("touchcancel", this.boundTouchCancel)
  }

  private onTouchStart(e: TouchEvent) {
    // Update touches tracking
    for (let i = 0; i < e.touches.length; i++) {
      this.touches[e.touches[i].identifier] = e.touches[i]
    }

    if (e.touches.length === 1) {
      // Single touch - potential swipe
      this.swipeStartX = e.touches[0].clientX
      this.swipeStartY = e.touches[0].clientY
      this.swipeSamples = [{ x: this.swipeStartX, time: Date.now() }]
      this.swipeAxis = null
      this.isSwipeGesture = true
      this.isPinchGesture = false
    } else if (e.touches.length === 2) {
      // Two touches - pinch gesture, prevent default to override browser zoom
      e.preventDefault()
      this.endDrag()
      this.isSwipeGesture = false
      this.isPinchGesture = true
      this.initialDistance = this.getDistance(e.touches[0], e.touches[1])
      this.initialScale = this.lastScale
    }
  }

  private onTouchMove(e: TouchEvent) {
    // Update touches tracking
    for (let i = 0; i < e.touches.length; i++) {
      this.touches[e.touches[i].identifier] = e.touches[i]
    }

    if (this.isPinchGesture && e.touches.length === 2) {
      // Prevent default only for pinch gestures
      e.preventDefault()
      this.handlePinchMove(e)
    } else if (this.isSwipeGesture && e.touches.length === 1) {
      const x = e.touches[0].clientX
      this.recordSample(x, Date.now())
      const deltaX = Math.abs(x - this.swipeStartX)
      const deltaY = Math.abs(e.touches[0].clientY - this.swipeStartY)
      if (
        this.swipeAxis === null &&
        Math.max(deltaX, deltaY) >= this.AXIS_LOCK_DISTANCE
      ) {
        this.swipeAxis = isMostlyHorizontal(deltaX, deltaY) ? "x" : "y"
      }
      if (this.swipeAxis === "y") {
        this.isSwipeGesture = false
      } else if (this.swipeAxis === "x") {
        // A sideways swipe: suppress the browser's own handling so the
        // chapter/page navigation wins consistently.
        e.preventDefault()
        this.swipeMove.emit(x - this.swipeStartX)
      }
    } else {
      // Gesture changed, reset
      this.endDrag()
      this.isSwipeGesture = false
      this.isPinchGesture = false
    }
  }

  private onTouchEnd(e: TouchEvent) {
    // Remove ended touches from tracking
    for (let i = 0; i < e.changedTouches.length; i++) {
      delete this.touches[e.changedTouches[i].identifier]
    }

    if (this.isSwipeGesture && e.changedTouches.length === 1) {
      this.handleSwipeEnd(e.changedTouches[0])
    }

    if (this.isPinchGesture) {
      this.handlePinchEnd()
    }

    // Reset gesture tracking when no touches remain
    if (Object.keys(this.touches).length === 0) {
      this.isSwipeGesture = false
      this.isPinchGesture = false
    }
  }

  private onTouchCancel(e: TouchEvent) {
    // Clear all touches on cancel
    this.touches = {}
    this.endDrag()
    this.isSwipeGesture = false
    this.isPinchGesture = false
  }

  /** Whatever followed a sideways drag goes back: it ended without a turn. */
  private endDrag(): void {
    if (this.isSwipeGesture && this.swipeAxis === "x") this.swipeCancel.emit()
  }

  private recordSample(x: number, time: number): void {
    this.swipeSamples.push({ x, time })
    // Older ones never count towards the speed on letting go.
    while (this.swipeSamples[0].time < time - this.RELEASE_WINDOW) {
      this.swipeSamples.shift()
    }
  }

  /**
   * How fast (px/ms, signed) the finger was moving as it let go: over the
   * last moment only, so a pause before a flick doesn't slow the flick, and a
   * finger held still before lifting reads as still.
   */
  private releaseVelocity(x: number, time: number): number {
    const first = this.swipeSamples.find(
      (sample) => sample.time >= time - this.RELEASE_WINDOW,
    )
    if (!first || time <= first.time) return 0
    return (x - first.x) / (time - first.time)
  }

  // As iOS's own swipes decide: on the finger's speed as it lets go when it
  // is moving, else on how far it went. Pulling back before letting go
  // cancels, however far it had gone.
  private handleSwipeEnd(touch: Touch) {
    const deltaX = touch.clientX - this.swipeStartX
    const distance = Math.abs(deltaX)
    const drift = Math.abs(touch.clientY - this.swipeStartY)
    // Along the swipe: negative when the finger was heading back.
    const speed =
      this.releaseVelocity(touch.clientX, Date.now()) * Math.sign(deltaX)
    const width = this.el.nativeElement.clientWidth || window.innerWidth
    const reversed = speed <= -this.REVERSE_MIN_SPEED
    const deliberate = distance >= width * this.SWIPE_MIN_SHARE
    const flick =
      distance >= this.FLICK_MIN_DISTANCE && speed >= this.FLICK_MIN_SPEED

    // A swipe that locked onto the vertical axis already ended in
    // onTouchMove; this one may still have drifted.
    if (
      isMostlyHorizontal(distance, drift) &&
      !reversed &&
      (deliberate || flick)
    ) {
      if (deltaX > 0) {
        this.swipeRight.emit()
      } else {
        this.swipeLeft.emit()
      }
    } else {
      this.endDrag()
    }
  }

  private handlePinchMove(e: TouchEvent) {
    const currentDistance = this.getDistance(e.touches[0], e.touches[1])
    const scale =
      Number.isFinite(this.initialDistance) && this.initialDistance > 1e-6
        ? (currentDistance / this.initialDistance) * this.initialScale
        : this.initialScale

    // Clamp the gesture so a wild pinch never leaves the text unreadably tiny or huge.
    const newFontSize = this.BASE_FONT_SIZE * scale
    const clampedFontSize = Math.max(
      this.MIN_FONT_SIZE,
      Math.min(newFontSize, this.MAX_FONT_SIZE),
    )

    this.setFontSize(clampedFontSize)
    this.currentFontSize = clampedFontSize
  }

  private handlePinchEnd() {
    this.lastScale = this.currentFontSize / this.BASE_FONT_SIZE

    // Store the new font size
    this.preferencesService.setFontSize(
      this.currentFontSize,
      this.getFontSizeContext(),
    )
    this.emitTextSize()
  }

  private getDistance(touch1: Touch, touch2: Touch): number {
    const dx = touch1.clientX - touch2.clientX
    const dy = touch1.clientY - touch2.clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  /**
   * A size up. A larger `step` (the Android app's 10) lands on its own grid,
   * so 105 goes to 110 rather than 115. The grid is taken from the size as
   * shown: a pinch leaves sizes like 119.6, shown as 120, which would
   * otherwise step to 120 and seem not to move.
   */
  public increaseFontSize(step: number = this.FONT_STEP): void {
    const shown = Math.round(this.currentFontSize)
    this.adjustFontSize(
      (Math.floor(shown / step) + 1) * step - this.currentFontSize,
    )
  }

  public decreaseFontSize(step: number = this.FONT_STEP): void {
    const shown = Math.round(this.currentFontSize)
    this.adjustFontSize(
      (Math.ceil(shown / step) - 1) * step - this.currentFontSize,
    )
  }

  /** Back to the size the text opens at without a choice: standard, or the system's. */
  public resetFontSize(): void {
    this.preferencesService.clearFontSize(this.getFontSizeContext())
    const size = this.defaultFontSize()
    this.setFontSize(size)
    this.currentFontSize = size
    this.lastScale = size / this.BASE_FONT_SIZE
    this.emitTextSize()
  }

  private defaultFontSize(): number {
    return (
      startingFontSize(null, () => this.systemTextSize.percent()) ??
      this.BASE_FONT_SIZE
    )
  }

  private emitTextSize(): void {
    this.textSizeChange.emit({
      percent: Math.round(this.currentFontSize),
      min: this.MIN_FONT_SIZE,
      max: this.MAX_FONT_SIZE,
      // A size of the reader's own: without one the text is at its default.
      canReset:
        this.preferencesService.getFontSize(this.getFontSizeContext()) !== null,
    })
  }

  private adjustFontSize(delta: number): void {
    const nextSize = Math.max(
      this.MIN_FONT_SIZE,
      Math.min(this.MAX_FONT_SIZE, this.currentFontSize + delta),
    )
    this.setFontSize(nextSize)
    this.currentFontSize = nextSize
    this.lastScale = this.currentFontSize / this.BASE_FONT_SIZE

    this.preferencesService.setFontSize(
      this.currentFontSize,
      this.getFontSizeContext(),
    )
    this.emitTextSize()
  }

  private setFontSize(fontSize: number) {
    this.renderer.setStyle(this.el.nativeElement, "font-size", `${fontSize}%`)
    if (fontSize > this.JUSTIFY_MAX_FONT_SIZE) {
      this.renderer.addClass(this.el.nativeElement, "large-text")
    } else {
      this.renderer.removeClass(this.el.nativeElement, "large-text")
    }

    // Headings need a parallel bump so their visual hierarchy survives reader zooming.
    const headings = this.el.nativeElement.querySelectorAll("h1, h2, h3")
    for (const heading of headings) {
      this.renderer.setStyle(heading, "font-size", `${fontSize + 5}%`)
    }
  }

  private getFontSizeContext(): string {
    if (this.fontSizeContext) {
      return this.fontSizeContext
    }

    console.warn(
      "UnifiedGesturesDirective is missing fontSizeContext; falling back to default.",
    )
    return "default"
  }
}

/** Sideways enough to be a swipe: it drifts at most half as far vertically. */
function isMostlyHorizontal(deltaX: number, deltaY: number): boolean {
  return deltaY <= deltaX / 2
}
