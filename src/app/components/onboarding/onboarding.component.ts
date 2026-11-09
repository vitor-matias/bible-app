import { DOCUMENT, NgTemplateOutlet } from "@angular/common"
import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  viewChild,
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { MatButtonModule } from "@angular/material/button"
import { MatDialogRef } from "@angular/material/dialog"
import { MatIconModule } from "@angular/material/icon"
import { AnalyticsService } from "../../services/analytics.service"
import {
  AppPromoService,
  type StoreLink,
} from "../../services/app-promo.service"
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
  type TextSegment,
  textSegments,
} from "./onboarding-content"

export type OnboardingSource = "first_launch" | "menu"

export interface OnboardingResult {
  completed: boolean
  lastStep: string
}

@Component({
  selector: "onboarding",
  standalone: true,
  imports: [MatButtonModule, MatIconModule, NgTemplateOutlet],
  templateUrl: "./onboarding.component.html",
  styleUrl: "./onboarding.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent {
  private readonly dialogRef =
    inject<MatDialogRef<OnboardingComponent, OnboardingResult>>(MatDialogRef)
  private readonly pwaInstallService = inject(PwaInstallService)
  private readonly analyticsService = inject(AnalyticsService)
  private readonly cdr = inject(ChangeDetectorRef)

  readonly installStepId = INSTALL_STEP_ID
  readonly platforms = PLATFORM_OPTIONS
  readonly steps: readonly OnboardingStep[]
  readonly detectedPlatform: InstallPlatform

  index = 0
  platform: InstallPlatform
  guide: InstallGuide
  /** The native app's store, offered ahead of the website's own install. */
  store: StoreLink | null
  installOutcome: InstallPromptOutcome | null = null
  installing = false

  private readonly detectedBrowser: InstallBrowser
  private readonly destroyRef = inject(DestroyRef)
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef)
  private readonly appPromo = inject(AppPromoService)
  private readonly document = inject(DOCUMENT)
  private readonly ring = viewChild.required<ElementRef<HTMLElement>>("ring")
  /**
   * The ringed button changes size on its own: the home page's label cycles,
   * fonts load late. Window resizes alone left the ring at its old width.
   */
  private readonly buttonResizes =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => this.placeRing())
      : null
  private ringed: Element | null = null

  constructor() {
    const pwaInstallService = this.pwaInstallService

    this.steps = pwaInstallService.isInstalled
      ? ONBOARDING_STEPS.filter((step) => step.id !== INSTALL_STEP_ID)
      : ONBOARDING_STEPS

    this.detectedPlatform = pwaInstallService.detectPlatform()
    this.detectedBrowser = pwaInstallService.detectBrowser()
    this.platform = this.detectedPlatform
    this.guide = getInstallGuide(this.platform, this.detectedBrowser)
    this.store = this.appPromo.storeFor(this.platform, "onboarding")
    // The install step's device switcher can show either store's badge.
    this.appPromo.preloadBadge("ios")
    this.appPromo.preloadBadge("android")

    // The native prompt may only become available while the wizard is open.
    pwaInstallService.canPromptInstall$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cdr.markForCheck())

    afterNextRender(() => this.placeRing())
    this.destroyRef.onDestroy(() => this.buttonResizes?.disconnect())
  }

  /** A step's text split around its inline [[icon]] markers. */
  segments(text: string): readonly TextSegment[] {
    return textSegments(text)
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
    this.noteStoreShown()
    // Plain buttons (step dots) don't repaint on their own under coalesced CD.
    this.cdr.detectChanges()
    // Move focus so screen readers hear the new step. The @if re-creates the
    // heading each time, so query it rather than cache a ViewChild.
    this.elementRef.nativeElement
      .querySelector<HTMLElement>("#onboarding-title")
      ?.focus()
    this.placeRing()
  }

  /**
   * Rings the header button the step names. The ring is a popover of its own,
   * shown after the dialog's, so it draws above the backdrop (z-index can't).
   */
  @HostListener("window:resize")
  placeRing(): void {
    const ring = this.ring().nativeElement
    // Browsers without the popover API (Safari before 17) go without.
    if (typeof ring.showPopover !== "function") return
    const key = this.step.highlight
    const target = key
      ? this.document.querySelector(`[data-tour="${key}"]`)
      : null
    if (target !== this.ringed) {
      this.buttonResizes?.disconnect()
      if (target) this.buttonResizes?.observe(target)
      this.ringed = target
    }
    const rect = target?.getBoundingClientRect()
    const dialog = this.elementRef.nativeElement.getBoundingClientRect()
    // Not over the dialog itself, as on a short screen.
    const overlaps =
      !!rect &&
      rect.left < dialog.right &&
      dialog.left < rect.right &&
      rect.top < dialog.bottom &&
      dialog.top < rect.bottom
    if (!rect?.width || overlaps) {
      if (ring.matches(":popover-open")) ring.hidePopover()
      this.cutBackdrop(null)
      return
    }
    const gap = 4
    const box = new DOMRect(
      rect.left - gap,
      rect.top - gap,
      rect.width + 2 * gap,
      rect.height + 2 * gap,
    )
    ring.style.top = `${box.top}px`
    ring.style.left = `${box.left}px`
    ring.style.width = `${box.width}px`
    ring.style.height = `${box.height}px`
    if (!ring.matches(":popover-open")) ring.showPopover()
    this.cutBackdrop(box)
  }

  /**
   * Clears the backdrop's shade inside the ring, so the button shows as it
   * is: the backdrop clipped to everything but the ring's rounded box.
   */
  private cutBackdrop(hole: DOMRect | null): void {
    const backdrop = this.document.querySelector<HTMLElement>(
      ".onboarding-backdrop",
    )
    if (!backdrop) return
    if (!hole) {
      backdrop.style.clipPath = ""
      return
    }
    const page = backdrop.getBoundingClientRect()
    const x = hole.left - page.left
    const y = hole.top - page.top
    const { width: w, height: h } = hole
    const r = Math.min(w, h) / 2
    const arc = `A${r} ${r} 0 0 1`
    backdrop.style.clipPath =
      `path(evenodd, "M0 0H${page.width}V${page.height}H0Z ` +
      `M${x + r} ${y}H${x + w - r}${arc} ${x + w} ${y + r}V${y + h - r}` +
      `${arc} ${x + w - r} ${y + h}H${x + r}${arc} ${x} ${y + h - r}` +
      `V${y + r}${arc} ${x + r} ${y}Z")`
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
    this.store = this.appPromo.storeFor(platform, "onboarding")
    this.noteStoreShown()
    this.cdr.detectChanges()
  }

  /** The link itself opens the store. */
  onStoreClick(store: StoreLink): void {
    this.appPromo.trackStoreOpen(store, "onboarding")
  }

  /** Told about the app for their own device, the visitor needs no prompt. */
  private noteStoreShown(): void {
    if (
      this.step.id === INSTALL_STEP_ID &&
      this.platform === this.detectedPlatform &&
      this.store
    ) {
      this.appPromo.markSeen()
    }
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
