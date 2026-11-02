import { DOCUMENT } from "@angular/common"
import { Injectable, inject } from "@angular/core"
import { NavigationEnd, Router } from "@angular/router"
import { Capacitor, SystemBarsStyle, SystemBarType } from "@capacitor/core"
import { filter, take } from "rxjs"
import { SPLASH_SCREEN_PLUGIN, SYSTEM_BARS_PLUGIN } from "../tokens"
import { LiveUpdateService } from "./live-update.service"
import { NativeChromeService } from "./native-chrome.service"

/** Longest the splash may stay up if the first navigation never completes. */
export const SPLASH_MAX_MS = 4000

/**
 * Native-shell setup that has no web equivalent: platform classes for
 * platform-specific styling, system bar icon styles, hiding the splash
 * screen once the first page has rendered (capacitor.config.ts sets
 * `launchAutoHide: false`), and live updates of the web bundle. Keep native-only behaviour here so the rest of the
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
  private readonly liveUpdate = inject(LiveUpdateService)
  private readonly nativeChrome = inject(NativeChromeService)
  private splashHidden = false

  init(): void {
    if (!Capacitor.isNativePlatform()) return

    this.document.body.classList.add(
      "native-app",
      `platform-${Capacitor.getPlatform()}`,
    )
    this.nativeChrome.init()
    this.noteTextZoom()

    // The web toolbars are always brown, so the status bar icons are always
    // light. SystemBars would otherwise follow the device theme. While the
    // native bars show, the shell sets them from the theme
    // (ChromeViewController.swift, ChromeOverlay.kt).
    this.setBarStyle(SystemBarType.StatusBar, SystemBarsStyle.Dark)

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        take(1),
      )
      .subscribe(() => {
        // Wait a frame so the page has painted before the splash fades out.
        requestAnimationFrame(() => this.hideSplash())
        // A page rendered, so this bundle works. Not on the splash timeout
        // below: a live-update bundle that never renders must roll back.
        void this.liveUpdate.readyAndCheck()
      })
    // Never strand the user behind the splash.
    setTimeout(() => this.hideSplash(), SPLASH_MAX_MS)
  }

  /**
   * Android's WebView zooms every font size by the system's font size
   * (textZoom), but not lengths in em: a box 1em tall in a 100px font stays
   * 100px when the font draws at 200. Their ratio, as --text-zoom on the
   * root, lets a rule hold some text's growth back (the paged copyright,
   * styles.css). The system's font size restarts the activity when it
   * changes, so once is enough.
   */
  private noteTextZoom(): void {
    const view = this.document.defaultView
    if (!view) return
    const probe = this.document.createElement("div")
    probe.style.cssText =
      "position: absolute; visibility: hidden; font-size: 100px; height: 1em"
    this.document.body.appendChild(probe)
    const zoom =
      parseFloat(view.getComputedStyle(probe).fontSize) /
      probe.getBoundingClientRect().height
    probe.remove()
    if (!Number.isFinite(zoom) || zoom <= 0) return
    this.document.documentElement.style.setProperty(
      "--text-zoom",
      `${Math.round(zoom * 100) / 100}`,
    )
  }

  /**
   * The navigation bar draws over the page (the app is edge-to-edge), so its
   * icons follow the in-app theme, which can differ from the device theme.
   * Where the page stops short of the bars instead, the bar shows the brown
   * window background (MainActivity.java), which takes light icons.
   */
  setNavigationBarTheme(isDark: boolean): void {
    if (!Capacitor.isNativePlatform()) return
    const dark = isDark || !this.drawsUnderSystemBars()
    this.setBarStyle(
      SystemBarType.NavigationBar,
      dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
    )
  }

  /**
   * Capacitor's SystemBars only lets the page under the bars on WebView 140
   * and later, the first to report them as safe areas. Older ones (Android 8
   * and 9 stop at 138) get the page laid out between the bars, and a top
   * safe area of 0.
   */
  private drawsUnderSystemBars(): boolean {
    if (Capacitor.getPlatform() !== "android") return true
    const probe = this.document.createElement("div")
    // --app-inset-top lets specs simulate the status bar.
    probe.style.cssText =
      "position: fixed; height: var(--app-inset-top, env(safe-area-inset-top, 0px))"
    this.document.body.append(probe)
    const height = probe.offsetHeight
    probe.remove()
    return height > 0
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
