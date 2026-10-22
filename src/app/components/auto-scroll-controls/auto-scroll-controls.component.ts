import { CommonModule } from "@angular/common"
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  Input,
  inject,
  NgZone,
  OnDestroy,
  OnInit,
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { AnalyticsService } from "../../services/analytics.service"
import { AutoScrollService } from "../../services/auto-scroll.service"
import { NativeChromeService } from "../../services/native-chrome.service"
import { PreferencesService } from "../../services/preferences.service"

@Component({
  selector: "app-auto-scroll-controls",
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: "./auto-scroll-controls.component.html",
  styleUrls: ["./auto-scroll-controls.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutoScrollControlsComponent implements OnInit, OnDestroy {
  @Input() scrollElement?: HTMLElement
  @Input() lineHeightElement?: HTMLElement

  private readonly nativeChrome = inject(NativeChromeService)
  private readonly destroyRef = inject(DestroyRef)
  private readonly ngZone = inject(NgZone)
  /** The native apps show these controls in their own toolbar instead. */
  readonly native = this.nativeChrome.enabled

  constructor(
    private autoScrollService: AutoScrollService,
    private preferencesService: PreferencesService,
    private cdr: ChangeDetectorRef,
    private analyticsService: AnalyticsService,
  ) {}

  /** The page is scrolled to its end: there's nothing left to play. */
  atEnd = false

  ngOnInit(): void {
    this.followEnd()
    if (!this.native) return
    this.nativeChrome.actions$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ id }) => {
        if (id === "auto-scroll-toggle") this.toggleAutoScroll()
        if (id === "auto-scroll-slower") this.decreaseAutoScrollSpeed()
        if (id === "auto-scroll-faster") this.increaseAutoScrollSpeed()
      })
    this.syncNativeChrome()
  }

  ngOnDestroy(): void {
    this.stopAutoScroll()
    if (this.native) this.nativeChrome.setAutoScroll(null)
  }

  toggleAutoScroll(): void {
    if (!this.autoScrollEnabled) {
      if (this.scrolledToEnd()) return
      this.startAutoScroll()
    } else {
      this.stopAutoScroll()
    }
  }

  increaseAutoScrollSpeed(): void {
    this.updateAutoScrollSpeed(this.autoScrollService.AUTO_SCROLL_STEP)
  }

  decreaseAutoScrollSpeed(): void {
    this.updateAutoScrollSpeed(-this.autoScrollService.AUTO_SCROLL_STEP)
  }

  private updateAutoScrollSpeed(delta: number): void {
    const nextSpeed = this.autoScrollService.updateAutoScrollSpeed(delta)
    this.preferencesService.setAutoScrollSpeed(nextSpeed)

    void this.analyticsService.track("autoscroll_speed", {
      speed: nextSpeed,
    })

    this.cdr.markForCheck()
    this.syncNativeChrome()
  }

  private startAutoScroll(): void {
    if (!this.scrollElement || !this.lineHeightElement) return

    this.autoScrollService.start({
      scrollElement: this.scrollElement,
      lineHeightElement: this.lineHeightElement,
      onStop: () => {
        this.safeMarkForCheck()
      },
    })

    void this.analyticsService.track("autoscroll_status", {
      enabled: true,
    })

    this.safeMarkForCheck()
  }

  private stopAutoScroll(): void {
    this.autoScrollService.stop()

    void this.analyticsService.track("autoscroll_status", {
      enabled: false,
    })

    this.safeMarkForCheck()
  }

  /**
   * Keeps atEnd current as the page scrolls, or reflows: its text changing
   * size, or the page itself (a window resized).
   */
  private followEnd(): void {
    const element = this.scrollElement
    if (!element) return
    const update = () => {
      const atEnd = this.scrolledToEnd()
      if (atEnd === this.atEnd) return
      this.ngZone.run(() => {
        this.atEnd = atEnd
        this.safeMarkForCheck()
      })
    }
    this.atEnd = this.scrolledToEnd()
    // Scrolling needs no change detection, only a change of atEnd does.
    const resize =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(update)
    this.ngZone.runOutsideAngular(() => {
      element.addEventListener("scroll", update, { passive: true })
      resize?.observe(element)
      if (this.lineHeightElement) resize?.observe(this.lineHeightElement)
    })
    this.destroyRef.onDestroy(() => {
      element.removeEventListener("scroll", update)
      resize?.disconnect()
    })
  }

  /** Down as far as it goes, to the pixel (WebKit keeps whole pixels). */
  private scrolledToEnd(): boolean {
    const element = this.scrollElement
    if (!element) return false
    return element.scrollTop + element.clientHeight >= element.scrollHeight - 1
  }

  private safeMarkForCheck(): void {
    try {
      this.cdr.markForCheck()
    } catch {
      // Safely ignore errors if change detection cannot be triggered (e.g., component destroyed)
    }
    this.syncNativeChrome()
  }

  /** Sends what these controls show to the native toolbar. */
  private syncNativeChrome(): void {
    if (!this.native || this.destroyRef.destroyed) return
    this.nativeChrome.setAutoScroll({
      playing: this.autoScrollEnabled,
      speedLabel: this.autoScrollSpeedLabel,
      speedAccessibilityLabel:
        this.autoScrollService.getAutoScrollSpeedSpokenLabel(
          this.autoScrollLinesPerSecond,
        ),
      canSlower: this.autoScrollLinesPerSecond > this.MIN_AUTO_SCROLL_LPS,
      canFaster: this.autoScrollLinesPerSecond < this.MAX_AUTO_SCROLL_LPS,
      canPlay: !this.atEnd,
    })
  }

  get autoScrollEnabled(): boolean {
    return this.autoScrollService.autoScrollEnabled
  }

  get autoScrollLinesPerSecond(): number {
    return this.autoScrollService.autoScrollLinesPerSecond
  }

  get autoScrollSpeedLabel(): string {
    return this.autoScrollService.getAutoScrollSpeedLabel(
      this.autoScrollLinesPerSecond,
    )
  }

  get MIN_AUTO_SCROLL_LPS(): number {
    return this.autoScrollService.MIN_AUTO_SCROLL_LPS
  }

  get MAX_AUTO_SCROLL_LPS(): number {
    return this.autoScrollService.MAX_AUTO_SCROLL_LPS
  }
}
