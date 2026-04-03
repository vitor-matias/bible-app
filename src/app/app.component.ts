import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  NgZone,
  type OnDestroy,
  type OnInit,
} from "@angular/core"
import { Router, RouterOutlet } from "@angular/router"
import { App } from "@capacitor/app"
import type { PluginListenerHandle } from "@capacitor/core"
import { Capacitor } from "@capacitor/core"
import { injectSpeedInsights } from "@vercel/speed-insights"
import { appConfig } from "./config"
import { OfflineDataService } from "./services/offline-data.service"
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
  private appUrlOpenHandle?: PluginListenerHandle

  private readonly installListener = () => {
    this.installEventFired = true
  }

  constructor(
    private offlineDataService: OfflineDataService,
    private router: Router,
    private ngZone: NgZone,
    _themeService: ThemeService,
    @Inject(APP_PLUGIN) private appPlugin: typeof App,
  ) {
    injectSpeedInsights()
  }

  ngOnInit(): void {
    if (typeof window === "undefined") return

    window.addEventListener("appinstalled", this.installListener)
    // Only preload from standalone check if install event hasn't fired
    if (this.isStandaloneMode() && !this.installEventFired) {
      this.offlineDataService.preloadAllBooksAndChapters("standalone")
    }

    this.handleShareTarget()
    this.setupAppLinks()
  }

  private setupAppLinks(): void {
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
        this.appUrlOpenHandle = handle
      })
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

    if (!sharedUrl && !sharedText) return

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

    // Fall back: open search with the shared text or URL as the query.
    const query = sharedText ?? sharedUrl ?? ""
    if (query) {
      this.router.navigate(["/search"], { queryParams: { q: query } })
    }
  }

  async ngOnDestroy(): Promise<void> {
    if (typeof window !== "undefined") {
      window.removeEventListener("appinstalled", this.installListener)
    }
    if (this.appUrlOpenHandle) {
      await this.appUrlOpenHandle.remove()
    }
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
