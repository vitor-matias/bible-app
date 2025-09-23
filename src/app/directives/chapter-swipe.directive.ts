import {
  Directive,
  ElementRef,
  EventEmitter,
  type OnDestroy,
  type OnInit,
  Output,
} from "@angular/core"

@Directive({
  selector: "[chapterSwipe]",
  standalone: true,
})
export class ChapterSwipeDirective implements OnInit, OnDestroy {
  @Output() nextChapter = new EventEmitter<void>()
  @Output() previousChapter = new EventEmitter<void>()

  private startX = 0
  private startTime = 0
  private threshold = 80 // Minimum swipe distance
  private maxTime = 1000 // Maximum time for swipe

  constructor(private el: ElementRef) {}

  ngOnInit() {
    const element = this.el.nativeElement
    element.addEventListener("touchstart", this.onTouchStart.bind(this), {
      passive: true,
    })
    element.addEventListener("touchend", this.onTouchEnd.bind(this), {
      passive: true,
    })
  }

  ngOnDestroy() {
    const element = this.el.nativeElement
    element.removeEventListener("touchstart", this.onTouchStart)
    element.removeEventListener("touchend", this.onTouchEnd)
  }

  private onTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      this.startX = e.touches[0].clientX
      this.startTime = Date.now()
    }
  }

  private onTouchEnd(e: TouchEvent) {
    if (e.changedTouches.length === 1) {
      const endX = e.changedTouches[0].clientX
      const distance = endX - this.startX
      const elapsedTime = Date.now() - this.startTime

      if (elapsedTime < this.maxTime && Math.abs(distance) > this.threshold) {
        if (distance > 0) {
          this.previousChapter.emit() // Swipe right = previous
        } else {
          this.nextChapter.emit() // Swipe left = next
        }
      }
    }
  }
}
