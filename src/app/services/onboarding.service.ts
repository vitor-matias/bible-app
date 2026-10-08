import { Injectable, inject } from "@angular/core"
import { MatDialog, type MatDialogRef } from "@angular/material/dialog"
import {
  OnboardingComponent,
  type OnboardingResult,
  type OnboardingSource,
} from "../components/onboarding/onboarding.component"
import { nativeOnboardingSteps } from "../components/onboarding/onboarding-content"
import { AnalyticsService } from "./analytics.service"
import { NativeChromeService } from "./native-chrome.service"
import { PreferencesService } from "./preferences.service"

/** Let the reader paint before the wizard slides over it on a first visit. */
export const FIRST_LAUNCH_DELAY_MS = 800

@Injectable({
  providedIn: "root",
})
export class OnboardingService {
  private dialogRef: MatDialogRef<
    OnboardingComponent,
    OnboardingResult
  > | null = null
  private nativeOpen = false
  private readonly nativeChrome = inject(NativeChromeService)

  constructor(
    private readonly dialog: MatDialog,
    private readonly preferencesService: PreferencesService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  /** Schedules the wizard on a first visit (never on a share-target launch). */
  showOnFirstLaunch(search: string = defaultSearch()): boolean {
    if (this.preferencesService.getOnboardingSeen()) return false
    if (this.isShareTargetLaunch(search)) return false

    setTimeout(() => {
      // Re-check: the menu can open and close the wizard during the delay.
      if (this.preferencesService.getOnboardingSeen()) return
      this.open("first_launch")
    }, FIRST_LAUNCH_DELAY_MS)
    return true
  }

  /** The wizard's dialog; null in the iOS app, which shows a native sheet. */
  open(
    source: OnboardingSource = "menu",
  ): MatDialogRef<OnboardingComponent, OnboardingResult> | null {
    if (this.nativeChrome.enabled) {
      this.openNative(source)
      return null
    }
    if (this.dialogRef) return this.dialogRef

    const ref = this.dialog.open<
      OnboardingComponent,
      undefined,
      OnboardingResult
    >(OnboardingComponent, {
      panelClass: "onboarding-dialog",
      width: "min(92vw, 520px)",
      maxWidth: "92vw",
      maxHeight: "90vh",
      autoFocus: "dialog",
      ariaLabelledBy: "onboarding-title",
    })
    this.dialogRef = ref

    void this.analyticsService.track("onboarding_open", { source })

    ref.afterClosed().subscribe((result) => {
      this.dialogRef = null
      this.closed(source, result)
    })

    return ref
  }

  private openNative(source: OnboardingSource): void {
    if (this.nativeOpen) return
    this.nativeOpen = true
    void this.analyticsService.track("onboarding_open", { source })
    void this.nativeChrome
      .showOnboarding(nativeOnboardingSteps())
      .then((result) => {
        this.nativeOpen = false
        this.closed(source, result)
      })
  }

  private closed(source: OnboardingSource, result?: OnboardingResult): void {
    // Any dismissal counts as seen.
    this.preferencesService.setOnboardingSeen(true)
    void this.analyticsService.track("onboarding_close", {
      source,
      completed: result?.completed ?? false,
      lastStep: result?.lastStep,
    })
  }

  private isShareTargetLaunch(search: string): boolean {
    // The same three fields as AppComponent.handleShareTarget.
    const params = new URLSearchParams(search)
    return params.has("url") || params.has("text") || params.has("title")
  }
}

function defaultSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search
}
