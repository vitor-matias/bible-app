import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  NgZone,
  type OnDestroy,
  type OnInit,
} from "@angular/core"
import { MatDialog } from "@angular/material/dialog"
import { Router, RouterOutlet } from "@angular/router"
import type { App, BackButtonListenerEvent } from "@capacitor/app"
import type { PluginListenerHandle } from "@capacitor/core"
import {
  Capacitor,
  SystemBars,
  SystemBarsStyle,
  SystemBarType,
} from "@capacitor/core"
import { injectSpeedInsights } from "@vercel/speed-insights"
import { appConfig } from "./config"
import { AnalyticsService } from "./services/analytics.service"
import { BackButtonService } from "./services/back-button.service"
import { NativeShellService } from "./services/native-shell.service"
import { OfflineDataService } from "./services/offline-data.service"
import { OnboardingService } from "./services/onboarding.service"
import { PwaInstallService } from "./services/pwa-install.service"
import { ThemeService } from "./services/theme.service"
import { APP_PLUGIN } from "./tokens"

@Component({
  selector: "app-root",
  templateUrl: "app.component.html",
  styleUrl: "./app.component.css",
  standalone: true,
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  private installEventFired = false
  private readonly listenerHandles: PluginListenerHandle[] = []

  private readonly installListener = () => {
    this.installEventFired = true
  }

  constructor(
    private offlineDataService: OfflineDataService,
    private router: Router,
    private ngZone: NgZone,
    private analyticsService: AnalyticsService,
    private onboardingService: OnboardingService,
    _themeService: ThemeService,
    // Injected early so it captures `beforeinstallprompt`, which fires once.
    _pwaInstallService: PwaInstallService,
    @Inject(APP_PLUGIN) private appPlugin: typeof App,
    private dialog: MatDialog,
    private nativeShell: NativeShellService,
    private backButton: BackButtonService,
  ) {
    // Speed Insights is served by the Vercel deployment; the native apps load
    // from a local origin where its script does not exist.
    if (!Capacitor.isNativePlatform()) injectSpeedInsights()
  }

  ngOnInit(): void {
    if (typeof window === "undefined") return

    window.addEventListener("appinstalled", this.installListener)
    // Only preload from standalone check if install event hasn't fired
    if (this.isStandaloneMode() && !this.installEventFired) {
      this.offlineDataService.preloadAllBooksAndChapters("standalone")
    }

    void this.trackAppOpenEvent()
    this.handleShareTarget()
    this.setupNativeListeners()
    this.setupStatusBar()
    this.nativeShell.init()
    this.onboardingService.showOnFirstLaunch()
  }

  private trackAppOpenEvent(): void {
    void this.analyticsService.track("app_open")
  }

  /**
   * The toolbar is always brown, so the status bar icons must be light. The
   * capacitor.config `StatusBar` block is ignored by Capacitor 8's built-in
   * SystemBars, which otherwise follows the device theme (dark icons on a
   * light-mode phone). The gesture/navigation bar keeps following the theme.
   */
  private setupStatusBar(): void {
    if (!Capacitor.isNativePlatform()) return

    SystemBars.setStyle({
      bar: SystemBarType.StatusBar,
      style: SystemBarsStyle.Dark,
    }).catch(() => {})
  }

  private setupNativeListeners(): void {
    if (!Capacitor.isNativePlatform()) return

    this.appPlugin
      .addListener("appUrlOpen", (event) => {
        this.ngZone.run(() => {
          try {
            const url = new URL(event.url)

            if (
              url.hostname === appConfig.domain ||
              url.hostname === appConfig.fallbackDomain
            ) {
              // Route inside the angular space using path
              this.router.navigateByUrl(url.pathname + url.search + url.hash)
            }
          } catch {
            console.warn("Invalid app URL:", event.url)
          }
        })
      })
      .then((handle) => {
        this.listenerHandles.push(handle)
      })

    this.appPlugin
      .addListener("backButton", (event) => {
        this.ngZone.run(() => this.handleBackButton(event))
      })
      .then((handle) => {
        this.listenerHandles.push(handle)
      })
  }

  /**
   * Android's hardware back button (and back gesture). Registering a listener
   * disables Capacitor's default, which exits the app from any screen: close
   * the topmost overlay or panel first, then go back in history, and on the
   * first screen send the app to the background like other Android apps
   * (exiting would make the next launch a cold start).
   */
  private handleBackButton({ canGoBack }: BackButtonListenerEvent): void {
    const dialogs = this.dialog.openDialogs
    if (dialogs.length > 0) {
      dialogs[dialogs.length - 1].close()
      return
    }
    if (this.backButton.closeTopmost()) return
    if (canGoBack) {
      window.history.back()
      return
    }
    void this.appPlugin.minimizeApp()
  }

  /**
   * Handles incoming share-target launches (Web Share Target API, GET action).
   * When another app shares a URL or text into this PWA, the OS opens it at
   * `/?url=<shared-url>&text=<shared-text>&title=<shared-title>`.
   * - If the shared URL has a recognisable path on our domain, navigate there.
   * - Otherwise fall back to opening the search screen with the text/URL.
   */
  private handleShareTarget(): void {
    const params = new URLSearchParams(window.location.search)
    const sharedUrl = params.get("url")
    const sharedText = params.get("text")
    const sharedTitle = params.get("title")

    if (!sharedUrl && !sharedText && !sharedTitle) return

    // Try to navigate directly if the shared URL is an internal link.
    if (sharedUrl) {
      try {
        const url = new URL(sharedUrl)
        if (
          url.hostname === appConfig.domain ||
          url.hostname === appConfig.fallbackDomain
        ) {
          this.router.navigateByUrl(url.pathname + url.search + url.hash)
          return
        }
      } catch {
        // Not a valid URL — fall through to search.
      }
    }

    // Fall back: open search with the first non-empty of text, URL or title.
    // Not ??: a share sheet may send an empty "?text=".
    const query =
      [sharedText, sharedUrl, sharedTitle].find(
        (value) => !!value && value.trim().length > 0,
      ) ?? ""
    if (query) {
      this.router.navigate(["/search"], { queryParams: { q: query } })
    }
  }

  async ngOnDestroy(): Promise<void> {
    if (typeof window !== "undefined") {
      window.removeEventListener("appinstalled", this.installListener)
    }
    await Promise.all(this.listenerHandles.map((handle) => handle.remove()))
  }

  private isStandaloneMode(): boolean {
    if (typeof window === "undefined") return false
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS standalone mode
      window.navigator.standalone === true ||
      Capacitor.isNativePlatform()
    )
  }
}
