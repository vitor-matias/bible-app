import { CommonModule } from "@angular/common"
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnDestroy,
} from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { AutoScrollService } from "../../services/auto-scroll.service"
import { PreferencesService } from "../../services/preferences.service"

@Component({
  selector: "app-auto-scroll-controls",
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: "./auto-scroll-controls.component.html",
  styleUrls: ["./auto-scroll-controls.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutoScrollControlsComponent implements OnDestroy {
  @Input() scrollElement?: HTMLElement
  @Input() lineHeightElement?: HTMLElement

  constructor(
    private autoScrollService: AutoScrollService,
    private preferencesService: PreferencesService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnDestroy(): void {
    this.stopAutoScroll()
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

    // @ts-expect-error
    if (globalThis.umami) {
      // @ts-expect-error
      globalThis.umami.track("autoscroll_speed", {
        speed: nextSpeed,
      })
    }

    this.cdr.markForCheck()
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

    // @ts-expect-error
    if (globalThis.umami) {
      // @ts-expect-error
      globalThis.umami.track("autoscroll_status", {
        enabled: true,
      })
    }

    this.safeMarkForCheck()
  }

  private stopAutoScroll(): void {
    this.autoScrollService.stop()

    // @ts-expect-error
    if (globalThis.umami) {
      // @ts-expect-error
      globalThis.umami.track("autoscroll_status", {
        enabled: false,
      })
    }

    this.safeMarkForCheck()
  }

  private safeMarkForCheck(): void {
    try {
      this.cdr.markForCheck()
    } catch {
      // Safely ignore errors if change detection cannot be triggered (e.g., component destroyed)
    }
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
