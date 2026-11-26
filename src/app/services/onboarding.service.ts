import { Injectable, inject } from "@angular/core"
import {
  MatDialog,
  type MatDialogConfig,
  type MatDialogRef,
} from "@angular/material/dialog"
import { NavigationEnd, Router } from "@angular/router"
import { Capacitor } from "@capacitor/core"
import { first } from "rxjs"
import {
  OnboardingComponent,
  type OnboardingResult,
  type OnboardingSource,
} from "../components/onboarding/onboarding.component"
import {
  nativeOnboardingSteps,
  ONBOARDING_STEPS,
} from "../components/onboarding/onboarding-content"
import { AnalyticsService } from "./analytics.service"
import { NativeChromeService } from "./native-chrome.service"
import { PreferencesService } from "./preferences.service"

/** Let the reader paint before the wizard slides over it on a first visit. */
export const FIRST_LAUNCH_DELAY_MS = 800

/**
 * Where new visitors arrive, with or without a trailing slash or query: the
 * /app landing page, and a +365 day sent as a link (/mais365?dia=N), which
 * the wizard would cover.
 */
const isLanding = (url: string) => /^\/(?:app|mais365|365)\/?([?#]|$)/.test(url)

@Injectable({
  providedIn: "root",
})
export class OnboardingService {
  private readonly dialog = inject(MatDialog)
  private readonly preferencesService = inject(PreferencesService)
  private readonly analyticsService = inject(AnalyticsService)

  private dialogRef: MatDialogRef<
    OnboardingComponent,
    OnboardingResult
  > | null = null
  private nativeOpen = false

  /** Whether the wizard is up, in the web page or the native sheet. */
  get isOpen(): boolean {
    return this.dialogRef !== null || this.nativeOpen
  }
  private readonly nativeChrome = inject(NativeChromeService)
  private readonly router = inject(Router)

  /**
   * Schedules the wizard on a first visit (never on a share-target launch),
   * and once more in the Android app for those who saw it before its native
   * bars replaced the web header (☰). On /app, whose countdown a wizard
   * would cover, it waits for the visitor to move on into the site.
   */
  showOnFirstLaunch(
    search: string = defaultSearch(),
    path: string = defaultPath(),
  ): boolean {
    if (this.seen()) return false
    if (this.isShareTargetLaunch(search)) return false
    if (isLanding(path)) {
      // /app is where new visitors arrive, so postponed, never dropped. The
      // store links cancel their navigation and so never end one.
      this.router.events
        .pipe(
          first(
            (e) =>
              e instanceof NavigationEnd && !isLanding(e.urlAfterRedirects),
          ),
        )
        .subscribe(() => this.showOnFirstLaunch(search, ""))
      return false
    }

    setTimeout(() => {
      // Re-check: the menu can open and close the wizard during the delay.
      if (this.seen()) return
      this.open("first_launch")
    }, FIRST_LAUNCH_DELAY_MS)
    return true
  }

  /**
   * The wizard's dialog; null in the native apps, which show their own.
   * restoreFocus: where the focus goes on closing (MatDialogConfig's).
   */
  open(
    source: OnboardingSource = "menu",
    restoreFocus: MatDialogConfig["restoreFocus"] = true,
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
      // onboarding-backdrop: cut open over the button a step names (placeRing).
      backdropClass: ["cdk-overlay-dark-backdrop", "onboarding-backdrop"],
      width: "min(92vw, 520px)",
      maxWidth: "92vw",
      maxHeight: "90vh",
      autoFocus: "dialog",
      ariaLabelledBy: "onboarding-title",
      ariaModal: true,
      restoreFocus,
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
      .showOnboarding(
        nativeOnboardingSteps(
          ONBOARDING_STEPS,
          Capacitor.getPlatform() === "android" ? "android" : "ios",
        ),
      )
      .then((result) => {
        this.nativeOpen = false
        // Never shown: not seen either, so a first launch offers it again.
        if (result) this.closed(source, result)
      })
  }

  /** Seen, and in the Android app seen with its native bars. */
  private seen(): boolean {
    if (!this.preferencesService.getOnboardingSeen()) return false
    return (
      !this.introducesNativeBars() ||
      this.preferencesService.getNativeBarsOnboardingSeen()
    )
  }

  /** The Android app, whose native bars moved what the onboarding points to. */
  private introducesNativeBars(): boolean {
    return this.nativeChrome.enabled && Capacitor.getPlatform() === "android"
  }

  private closed(source: OnboardingSource, result?: OnboardingResult): void {
    // Any dismissal counts as seen.
    this.preferencesService.setOnboardingSeen(true)
    if (this.introducesNativeBars()) {
      this.preferencesService.setNativeBarsOnboardingSeen(true)
    }
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

function defaultPath(): string {
  return typeof window === "undefined" ? "" : window.location.pathname
}

function defaultSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search
}
