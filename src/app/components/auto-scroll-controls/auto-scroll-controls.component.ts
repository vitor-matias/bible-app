import { CommonModule } from "@angular/common"
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  Input,
  inject,
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
  /** The app's bars show these controls instead, above their toolbar. */
  readonly bars = this.nativeChrome.bars

  constructor(
    private autoScrollService: AutoScrollService,
    private preferencesService: PreferencesService,
    private cdr: ChangeDetectorRef,
    private analyticsService: AnalyticsService,
  ) {}

  ngOnInit(): void {
    if (!this.bars) return
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
    if (this.bars) this.nativeChrome.setAutoScroll(null)
  }

  toggleAutoScroll(): void {
    if (!this.autoScrollEnabled) {
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

  private safeMarkForCheck(): void {
    try {
      this.cdr.markForCheck()
    } catch {
      // Safely ignore errors if change detection cannot be triggered (e.g., component destroyed)
    }
    this.syncNativeChrome()
  }

  /** Sends what these controls show to the iOS toolbar. */
  private syncNativeChrome(): void {
    if (!this.bars || this.destroyRef.destroyed) return
    this.nativeChrome.setAutoScroll({
      playing: this.autoScrollEnabled,
      speedLabel: `${this.autoScrollSpeedLabel} ln/s`,
      canSlower: this.autoScrollLinesPerSecond > this.MIN_AUTO_SCROLL_LPS,
      canFaster: this.autoScrollLinesPerSecond < this.MAX_AUTO_SCROLL_LPS,
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
