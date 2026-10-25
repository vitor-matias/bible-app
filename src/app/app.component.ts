import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  inject,
  NgZone,
  type OnDestroy,
  type OnInit,
} from "@angular/core"
import { MatDialog } from "@angular/material/dialog"
import { Router, RouterOutlet } from "@angular/router"
import type { App, BackButtonListenerEvent } from "@capacitor/app"
import type { PluginListenerHandle } from "@capacitor/core"
import { Capacitor } from "@capacitor/core"
import { injectSpeedInsights } from "@vercel/speed-insights"
import { appConfig, isVercelHost } from "./config"
import { AnalyticsService } from "./services/analytics.service"
import { BackButtonService } from "./services/back-button.service"
import { historyDepth } from "./services/depth-location-strategy"
import { NativeShellService } from "./services/native-shell.service"
import { OfflineDataService } from "./services/offline-data.service"
import { OnboardingService } from "./services/onboarding.service"
import { PwaInstallService } from "./services/pwa-install.service"
import { TextAlignService } from "./services/text-align.service"
import { ThemeService } from "./services/theme.service"
import { ToastService } from "./services/toast.service"
import { APP_PLUGIN, PAGE_HOSTNAME } from "./tokens"

/** How long after a back on the first screen a second one leaves the app. */
export const EXIT_BACK_WINDOW_MS = 2000

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
  /** Until when a back on the first screen leaves the app. */
  private exitBackDeadline = 0

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
    // Injected early so the reader's ragged-right choice applies on load.
    _textAlignService: TextAlignService,
    // Injected early so it captures `beforeinstallprompt`, which fires once.
    _pwaInstallService: PwaInstallService,
    @Inject(APP_PLUGIN) private appPlugin: typeof App,
    private dialog: MatDialog,
    private nativeShell: NativeShellService,
    private backButton: BackButtonService,
    private toast: ToastService,
  ) {
    // Speed Insights is served by Vercel deployments only. The website itself
    // is nginx, where its script 404s on every page, and the native apps load
    // from a local origin where it doesn't exist either.
    if (isVercelHost(inject(PAGE_HOSTNAME))) injectSpeedInsights()
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
    this.nativeShell.init()
    this.onboardingService.showOnFirstLaunch()
  }

  private trackAppOpenEvent(): void {
    void this.analyticsService.track("app_open")
  }

  private setupNativeListeners(): void {
    if (!Capacitor.isNativePlatform()) return

    this.appPlugin
      .addListener("appUrlOpen", (event) => {
        this.ngZone.run(() => {
          const path = this.internalPath(event.url)
          if (!path) {
            console.warn("Ignoring app URL outside this site:", event.url)
            return
          }
          // MainActivity delivers shares from other apps as a share-target
          // URL on the root, like the PWA's.
          const url = new URL(event.url)
          if (
            url.pathname === "/" &&
            this.routeSharedContent(url.searchParams)
          ) {
            return
          }
          this.router.navigateByUrl(path)
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
   * the topmost overlay or panel first, then go back in history. On the first
   * screen, a second back within EXIT_BACK_WINDOW_MS sends the app to the
   * background like other Android apps (exiting would make the next launch a
   * cold start); a lone one only says so, so a stray gesture can't leave.
   */
  private handleBackButton({ canGoBack }: BackButtonListenerEvent): void {
    // Any other back in between (a panel, a page) takes two again.
    const exitArmed = Date.now() < this.exitBackDeadline
    this.exitBackDeadline = 0
    const dialogs = this.dialog.openDialogs
    if (dialogs.length > 0) {
      dialogs[dialogs.length - 1].close()
      return
    }
    if (this.backButton.closeTopmost()) return
    // The WebView's canGoBack misses pages opened from the native bars before
    // any tap on the page (DepthLocationStrategy); the app's own count doesn't.
    if (canGoBack || historyDepth(window.history.state) > 0) {
      window.history.back()
      return
    }
    if (exitArmed) {
      void this.appPlugin.minimizeApp()
      return
    }
    this.exitBackDeadline = Date.now() + EXIT_BACK_WINDOW_MS
    this.toast.show("Volte atrás outra vez para sair.", {
      action: "",
      duration: EXIT_BACK_WINDOW_MS,
    })
  }

  /**
   * Handles incoming share-target launches (Web Share Target API, GET action).
   * When another app shares a URL or text into this PWA, the OS opens it at
   * `/?url=<shared-url>&text=<shared-text>&title=<shared-title>`. The Android
   * app receives the same URL through `appUrlOpen` (MainActivity rewrites
   * share intents into it).
   */
  private handleShareTarget(): void {
    this.routeSharedContent(new URLSearchParams(window.location.search))
  }

  /**
   * Routes shared content, if `params` carries any:
   * - an internal link (the URL, or one inside the text) opens that page;
   * - otherwise the search screen opens with the text, URL or title.
   * Returns whether there was anything to route.
   */
  private routeSharedContent(params: URLSearchParams): boolean {
    const sharedUrl = params.get("url")
    const sharedText = params.get("text")
    const sharedTitle = params.get("title")

    if (!sharedUrl && !sharedText && !sharedTitle) return false

    // Android share sheets usually put the link inside the text.
    const candidates = [
      sharedUrl,
      // Drop punctuation that ends the sentence around the link.
      ...(sharedText?.match(/https?:\/\/\S+/g) ?? []).map((link) =>
        link.replace(/[).,;:!?]+$/, ""),
      ),
    ]
    for (const candidate of candidates) {
      const internalPath = candidate ? this.internalPath(candidate) : null
      if (internalPath) {
        this.router.navigateByUrl(internalPath)
        return true
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
    return true
  }

  /** The in-app path of a link to this site, or null for anything else. */
  private internalPath(link: string): string | null {
    try {
      const url = new URL(link)
      if (
        url.hostname === appConfig.domain ||
        url.hostname === appConfig.fallbackDomain
      ) {
        return url.pathname + url.search + url.hash
      }
    } catch {
      // Not a valid URL.
    }
    return null
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
