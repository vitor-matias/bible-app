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
