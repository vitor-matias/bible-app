import { DOCUMENT } from "@angular/common"
import { Injectable, inject } from "@angular/core"
import { NavigationEnd, Router } from "@angular/router"
import { Capacitor } from "@capacitor/core"
import { filter, take } from "rxjs"
import { SPLASH_SCREEN_PLUGIN } from "../tokens"

/** Longest the splash may stay up if the first navigation never completes. */
export const SPLASH_MAX_MS = 4000

/**
 * Native-shell setup that has no web equivalent: platform classes for
 * platform-specific styling, and hiding the splash screen once the first page
 * has rendered (capacitor.config.ts sets `launchAutoHide: false`).
 */
@Injectable({
  providedIn: "root",
})
export class NativeShellService {
  private readonly document = inject(DOCUMENT)
  private readonly router = inject(Router)
  private readonly splashScreen = inject(SPLASH_SCREEN_PLUGIN)
  private splashHidden = false

  init(): void {
    if (!Capacitor.isNativePlatform()) return

    this.document.body.classList.add(
      "native-app",
      `platform-${Capacitor.getPlatform()}`,
    )

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        take(1),
      )
      .subscribe(() => {
        // Wait a frame so the page has painted before the splash fades out.
        requestAnimationFrame(() => this.hideSplash())
      })
    // Never strand the user behind the splash.
    setTimeout(() => this.hideSplash(), SPLASH_MAX_MS)
  }

  private hideSplash(): void {
    if (this.splashHidden) return
    // Only a successful hide counts, so the timeout fallback can retry a
    // rejected first attempt instead of leaving the splash up.
    this.splashScreen.hide().then(
      () => {
        this.splashHidden = true
      },
      () => {},
    )
  }
}
