import { DOCUMENT } from "@angular/common"
import { Injectable, inject } from "@angular/core"
import { NavigationEnd, Router } from "@angular/router"
import { Capacitor, SystemBarsStyle, SystemBarType } from "@capacitor/core"
import { filter, take } from "rxjs"
import { SPLASH_SCREEN_PLUGIN, SYSTEM_BARS_PLUGIN } from "../tokens"
import { NativeChromeService } from "./native-chrome.service"

/** Longest the splash may stay up if the first navigation never completes. */
export const SPLASH_MAX_MS = 4000

/**
 * Native-shell setup that has no web equivalent: platform classes for
 * platform-specific styling, system bar icon styles, and hiding the splash
 * screen once the first page has rendered (capacitor.config.ts sets
 * `launchAutoHide: false`). Keep native-only behaviour here so the rest of the
 * app stays platform-agnostic.
 */
@Injectable({
  providedIn: "root",
})
export class NativeShellService {
  private readonly document = inject(DOCUMENT)
  private readonly router = inject(Router)
  private readonly splashScreen = inject(SPLASH_SCREEN_PLUGIN)
  private readonly systemBars = inject(SYSTEM_BARS_PLUGIN)
  private readonly nativeChrome = inject(NativeChromeService)
  private splashHidden = false

  init(): void {
    if (!Capacitor.isNativePlatform()) return

    this.document.body.classList.add(
      "native-app",
      `platform-${Capacitor.getPlatform()}`,
    )
    this.nativeChrome.init()

    // The web toolbars are always brown, so the status bar icons are always
    // light. SystemBars would otherwise follow the device theme. While the iOS
    // native bars show, ChromeViewController.swift sets them from the theme.
    this.setBarStyle(SystemBarType.StatusBar, SystemBarsStyle.Dark)

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

  /**
   * The navigation bar draws over the page (the app is edge-to-edge), so its
   * icons follow the in-app theme, which can differ from the device theme.
   */
  setNavigationBarTheme(isDark: boolean): void {
    if (!Capacitor.isNativePlatform()) return
    this.setBarStyle(
      SystemBarType.NavigationBar,
      isDark ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
    )
  }

  private setBarStyle(bar: SystemBarType, style: SystemBarsStyle): void {
    this.systemBars.setStyle({ bar, style }).catch(() => {})
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
