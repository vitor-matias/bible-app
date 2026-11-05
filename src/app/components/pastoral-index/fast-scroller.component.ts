import { DOCUMENT } from "@angular/common"
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { animationFrameScheduler, fromEvent } from "rxjs"
import { auditTime } from "rxjs/operators"
import { HapticsService } from "../../services/haptics.service"

/** The thumb's height; its 48 dp touch target is as wide. */
const THUMB_HEIGHT = 48

/** How long the thumb stays once the page or the finger has stopped. */
const HIDE_AFTER_MS = 1500

/**
 * Android's fast scroller, as its Contacts and Files have (Material 3 has no
 * section index): a thumb on the edge that shows while the list moves, to drag
 * through it, with the letter reached in a bubble beside the finger.
 */
@Component({
  selector: "fast-scroller",
  template: `
    <div
      #thumb
      class="thumb"
      [class.shown]="shown()"
      [class.held]="held()"
      [style.transform]="'translateY(' + top() + 'px)'"
      (pointerdown)="grab($event)"
      (pointermove)="drag($event)"
      (pointerup)="release()"
      (pointercancel)="release()"
    >
      <span class="handle"></span>
      @if (held() && letter()) {
      <span class="bubble">{{ letter() }}</span>
      }
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      z-index: 2;
      /* Where the bars rest, shown or not: their hiding doesn't move the track. */
      top: calc(var(--native-chrome-top, 0px) + 8px);
      bottom: calc(var(--native-chrome-bottom, 0px) + 8px);
      right: var(--app-inset-right, 0px);
      width: 48px;
      pointer-events: none;
    }
    .thumb {
      position: absolute;
      top: 0;
      right: 0;
      width: 48px;
      height: ${THUMB_HEIGHT}px;
      opacity: 0;
      transition: opacity 150ms linear;
      /* A drag here is the thumb's, not the page's scroll. */
      touch-action: none;
    }
    .thumb.shown {
      opacity: 1;
      pointer-events: auto;
    }
    .handle {
      position: absolute;
      top: 0;
      right: 2px;
      bottom: 0;
      width: 4px;
      border-radius: 4px;
      background-color: var(--android-on-surface-variant);
      transition:
        width 150ms cubic-bezier(0.2, 0, 0, 1),
        background-color 150ms linear;
    }
    .held .handle {
      width: 8px;
      background-color: var(--android-primary);
    }
    .bubble {
      position: absolute;
      top: -4px;
      right: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: 50% 50% 4px 50%;
      background-color: var(--android-primary);
      color: var(--android-on-primary);
      font-size: 28px;
      user-select: none;
    }
    @media (prefers-reduced-motion: reduce) {
      .thumb,
      .handle {
        transition: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The letters' own buttons and headings serve TalkBack, as for iOS's index.
  host: { "aria-hidden": "true" },
})
export class FastScrollerComponent {
  /** The letter of the themes on screen. */
  readonly letter = input<string | null>(null)

  readonly shown = signal(false)
  readonly held = signal(false)
  readonly top = signal(0)

  private readonly document = inject(DOCUMENT)
  private readonly haptics = inject(HapticsService)
  private readonly thumb = viewChild.required<ElementRef<HTMLElement>>("thumb")
  /** Where in the thumb the finger took hold. */
  private grabbedAt = 0
  private hideTimer?: ReturnType<typeof setTimeout>

  constructor() {
    const destroyRef = inject(DestroyRef)
    destroyRef.onDestroy(() => clearTimeout(this.hideTimer))
    fromEvent(window, "scroll", { passive: true })
      .pipe(
        auditTime(0, animationFrameScheduler),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe(() => this.pageMoved())
    // A tick for each letter the drag goes through.
    effect(() => {
      this.letter()
      if (untracked(this.held)) this.haptics.selection()
    })
  }

  grab(event: PointerEvent): void {
    const thumb = this.thumb().nativeElement
    thumb.setPointerCapture?.(event.pointerId)
    this.grabbedAt = event.clientY - thumb.getBoundingClientRect().top
    clearTimeout(this.hideTimer)
    this.held.set(true)
  }

  drag(event: PointerEvent): void {
    if (!this.held()) return
    const track = this.track()
    if (track.height <= 0) return
    const at = (event.clientY - this.grabbedAt - track.top) / track.height
    window.scrollTo({
      top: Math.min(1, Math.max(0, at)) * this.scrollRange(),
      behavior: "instant",
    })
  }

  release(): void {
    this.held.set(false)
    this.hideLater()
  }

  private pageMoved(): void {
    const range = this.scrollRange()
    if (range <= 0) return
    this.top.set((this.track().height * window.scrollY) / range)
    this.shown.set(true)
    if (!this.held()) this.hideLater()
  }

  private hideLater(): void {
    clearTimeout(this.hideTimer)
    this.hideTimer = setTimeout(() => this.shown.set(false), HIDE_AFTER_MS)
  }

  /** Where the thumb's top runs, in the viewport. */
  private track(): { top: number; height: number } {
    const host = this.thumb().nativeElement.parentElement
    const box = host?.getBoundingClientRect()
    return {
      top: box?.top ?? 0,
      height: (box?.height ?? 0) - THUMB_HEIGHT,
    }
  }

  private scrollRange(): number {
    return this.document.documentElement.scrollHeight - window.innerHeight
  }
}
