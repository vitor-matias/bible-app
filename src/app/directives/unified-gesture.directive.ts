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

@Directive({
  selector: "[unifiedGestures]",
  standalone: true,
  exportAs: "unifiedGestures",
})
export class UnifiedGesturesDirective implements OnInit, OnDestroy {
  @Output() swipeLeft = new EventEmitter<void>()
  @Output() swipeRight = new EventEmitter<void>()
  @Output() pinchZoom = new EventEmitter<{ scale: number }>()

  private baseFontSize: number
  private currentFontSize: number
  private readonly FONT_STEP = 5

  // Touch tracking variables
  private touches: { [key: number]: Touch } = {}
  private initialDistance = 0
  private initialScale = 1
  private lastScale = 1

  // Swipe tracking
  private swipeStartX = 0
  private swipeStartY = 0
  private swipeStartTime = 0
  private isSwipeGesture = false
  private isPinchGesture = false

  // Thresholds
  private readonly SWIPE_THRESHOLD = 80
  private readonly SWIPE_MAX_TIME = 500
  private readonly SWIPE_MAX_VERTICAL_DISTANCE = 100
  private readonly MIN_FONT_SIZE = 70
  private readonly MAX_FONT_SIZE = 180
  private readonly boundTouchStart = this.onTouchStart.bind(this)
  private readonly boundTouchMove = this.onTouchMove.bind(this)
  private readonly boundTouchEnd = this.onTouchEnd.bind(this)
  private readonly boundTouchCancel = this.onTouchCancel.bind(this)
  @Input() fontSizeContext?: string

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private preferencesService: PreferencesService,
  ) {
    // Get the initial font size
    const computedStyle = getComputedStyle(this.el.nativeElement)
    this.baseFontSize = Number.parseFloat(computedStyle.fontSize) || 105
    this.currentFontSize = this.baseFontSize
  }

  ngOnInit() {
    const element = this.el.nativeElement
    const storedSize = this.preferencesService.getFontSize(
      this.getFontSizeContext(),
    )

    if (storedSize) {
      this.currentFontSize = storedSize
      this.setFontSize(this.currentFontSize)
    }

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
      this.swipeStartTime = Date.now()
      this.isSwipeGesture = true
      this.isPinchGesture = false
    } else if (e.touches.length === 2) {
      // Two touches - pinch gesture, prevent default to override browser zoom
      e.preventDefault()
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
      // Check if movement is still within swipe parameters
      const deltaY = Math.abs(e.touches[0].clientY - this.swipeStartY)
      const deltaX = Math.abs(e.touches[0].clientX - this.swipeStartX)

      // Once the gesture looks like a horizontal swipe, suppress the browser's
      // native handling so the chapter/page navigation wins consistently.
      if (deltaX > 30 && deltaY < this.SWIPE_MAX_VERTICAL_DISTANCE) {
        e.preventDefault()
      } else if (deltaY > this.SWIPE_MAX_VERTICAL_DISTANCE) {
        this.isSwipeGesture = false // Too much vertical movement
      }
    } else {
      // Gesture changed, reset
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
    this.isSwipeGesture = false
    this.isPinchGesture = false
  }

  private handleSwipeEnd(touch: Touch) {
    const deltaX = touch.clientX - this.swipeStartX
    const deltaY = touch.clientY - this.swipeStartY
    const elapsedTime = Date.now() - this.swipeStartTime

    if (
      elapsedTime < this.SWIPE_MAX_TIME &&
      Math.abs(deltaX) > this.SWIPE_THRESHOLD &&
      Math.abs(deltaY) < this.SWIPE_MAX_VERTICAL_DISTANCE
    ) {
      if (deltaX > 0) {
        this.swipeRight.emit()
      } else {
        this.swipeLeft.emit()
      }
    }
  }

  private handlePinchMove(e: TouchEvent) {
    const currentDistance = this.getDistance(e.touches[0], e.touches[1])
    const scale =
      Number.isFinite(this.initialDistance) && this.initialDistance > 1e-6
        ? (currentDistance / this.initialDistance) * this.initialScale
        : this.initialScale

    // Clamp the gesture so a wild pinch never leaves the text unreadably tiny or huge.
    const clampedScale = Math.max(0.5, Math.min(scale, 3))

    const newFontSize = this.baseFontSize * clampedScale
    const clampedFontSize = Math.max(
      this.MIN_FONT_SIZE,
      Math.min(newFontSize, this.MAX_FONT_SIZE),
    )

    this.setFontSize(clampedFontSize)
    this.currentFontSize = clampedFontSize
  }

  private handlePinchEnd() {
    this.lastScale = this.currentFontSize / this.baseFontSize

    // Store the new font size
    this.preferencesService.setFontSize(
      this.currentFontSize,
      this.getFontSizeContext(),
    )
  }

  private getDistance(touch1: Touch, touch2: Touch): number {
    const dx = touch1.clientX - touch2.clientX
    const dy = touch1.clientY - touch2.clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  public increaseFontSize(): void {
    this.adjustFontSize(this.FONT_STEP)
  }

  public decreaseFontSize(): void {
    this.adjustFontSize(-this.FONT_STEP)
  }

  private adjustFontSize(delta: number): void {
    const nextSize = Math.max(
      this.MIN_FONT_SIZE,
      Math.min(this.MAX_FONT_SIZE, this.currentFontSize + delta),
    )
    this.setFontSize(nextSize)
    this.currentFontSize = nextSize

    this.preferencesService.setFontSize(
      this.currentFontSize,
      this.getFontSizeContext(),
    )
  }

  private setFontSize(fontSize: number) {
    this.renderer.setStyle(this.el.nativeElement, "font-size", `${fontSize}%`)

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
