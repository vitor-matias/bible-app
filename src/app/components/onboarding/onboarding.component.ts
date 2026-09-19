import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { MatButtonModule } from "@angular/material/button"
import { MatDialogRef } from "@angular/material/dialog"
import { MatIconModule } from "@angular/material/icon"
import { AnalyticsService } from "../../services/analytics.service"
import {
  type InstallBrowser,
  type InstallPlatform,
  type InstallPromptOutcome,
  PwaInstallService,
} from "../../services/pwa-install.service"
import {
  getInstallGuide,
  INSTALL_STEP_ID,
  type InstallGuide,
  ONBOARDING_STEPS,
  type OnboardingStep,
  PLATFORM_OPTIONS,
} from "./onboarding-content"

export type OnboardingSource = "first_launch" | "menu"

export interface OnboardingResult {
  completed: boolean
  lastStep: string
}

@Component({
  selector: "onboarding",
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: "./onboarding.component.html",
  styleUrl: "./onboarding.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent {
  readonly installStepId = INSTALL_STEP_ID
  readonly platforms = PLATFORM_OPTIONS
  readonly steps: readonly OnboardingStep[]
  readonly detectedPlatform: InstallPlatform

  index = 0
  platform: InstallPlatform
  guide: InstallGuide
  installOutcome: InstallPromptOutcome | null = null
  installing = false

  private readonly detectedBrowser: InstallBrowser
  private readonly destroyRef = inject(DestroyRef)
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef)

  constructor(
    private readonly dialogRef: MatDialogRef<
      OnboardingComponent,
      OnboardingResult
    >,
    private readonly pwaInstallService: PwaInstallService,
    private readonly analyticsService: AnalyticsService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.steps = pwaInstallService.isInstalled
      ? ONBOARDING_STEPS.filter((step) => step.id !== INSTALL_STEP_ID)
      : ONBOARDING_STEPS

    this.detectedPlatform = pwaInstallService.detectPlatform()
    this.detectedBrowser = pwaInstallService.detectBrowser()
    this.platform = this.detectedPlatform
    this.guide = getInstallGuide(this.platform, this.detectedBrowser)

    // The native prompt may only become available while the wizard is open.
    pwaInstallService.canPromptInstall$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cdr.markForCheck())
  }

  get step(): OnboardingStep {
    return this.steps[this.index]
  }

  get isFirst(): boolean {
    return this.index === 0
  }

  get isLast(): boolean {
    return this.index === this.steps.length - 1
  }

  /** The native prompt only installs on the device in hand. */
  get canPromptInstall(): boolean {
    return (
      this.platform === this.detectedPlatform &&
      this.pwaInstallService.canPromptInstall &&
      this.installOutcome !== "accepted"
    )
  }

  next(): void {
    if (!this.isLast) this.goTo(this.index + 1)
  }

  back(): void {
    if (!this.isFirst) this.goTo(this.index - 1)
  }

  goTo(index: number): void {
    if (index < 0 || index >= this.steps.length || index === this.index) return
    this.index = index
    // Plain buttons (step dots) don't repaint on their own under coalesced CD.
    this.cdr.detectChanges()
    // Move focus so screen readers hear the new step. The @if re-creates the
    // heading each time, so query it rather than cache a ViewChild.
    this.elementRef.nativeElement
      .querySelector<HTMLElement>("#onboarding-title")
      ?.focus()
  }

  skip(): void {
    this.dialogRef.close({ completed: false, lastStep: this.step.id })
  }

  finish(): void {
    this.dialogRef.close({ completed: true, lastStep: this.step.id })
  }

  selectPlatform(platform: InstallPlatform): void {
    if (platform === this.platform) return
    this.platform = platform
    // Browser-specific tips only apply to the detected platform.
    this.guide = getInstallGuide(
      platform,
      platform === this.detectedPlatform ? this.detectedBrowser : null,
    )
    this.cdr.detectChanges()
  }

  async installNow(): Promise<void> {
    if (this.installing) return
    this.installing = true
    this.cdr.markForCheck()

    const outcome = await this.pwaInstallService.promptInstall()

    this.installing = false
    this.installOutcome = outcome
    // AnalyticsService.track overwrites `platform`, hence the distinct key.
    void this.analyticsService.track("pwa_install_prompt", {
      outcome,
      installPlatform: this.detectedPlatform,
    })
    this.cdr.markForCheck()
  }

  /** On the document: the dialog focuses its container, above this host. */
  @HostListener("document:keydown", ["$event"])
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return

    // The reader behind the dialog turns chapters on the same keys.
    event.stopPropagation()

    // Don't turn steps while the platform switcher has focus.
    const target = event.target as HTMLElement | null
    if (target?.closest?.(".platforms")) return

    event.preventDefault()

    if (event.key === "ArrowRight") {
      this.next()
    } else {
      this.back()
    }
  }
}
