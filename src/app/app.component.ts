
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
} from "@angular/core"
import { DomSanitizer } from "@angular/platform-browser"

import { RouterOutlet } from "@angular/router"

import { SwUpdate } from "@angular/service-worker"
import { MatIconRegistry } from "@angular/material/icon"
import { OfflineDataService } from "./services/offline-data.service"

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [RouterOutlet],
})
export class AppComponent implements OnInit, OnDestroy {
  private installEventFired = false

  private readonly installListener = () => {
    this.installEventFired = true
    this.offlineDataService.preloadAllBooksAndChapters("install")
  }

  constructor(
    private swUpdate: SwUpdate,
    private offlineDataService: OfflineDataService,
    private iconRegistry: MatIconRegistry,
    private sanitizer: DomSanitizer,
  ) {
    this.registerIcons()
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.subscribe((event) => {
        if (event.type === "VERSION_READY") {
          this.swUpdate.activateUpdate().then(() => {
            window.location.reload()
          })
        }
      })
    }
  }

  ngOnInit(): void {
    if (typeof window === "undefined") return

    window.addEventListener("appinstalled", this.installListener)
    // Only preload from standalone check if install event hasn't fired
    if (this.isStandaloneMode() && !this.installEventFired) {
      this.offlineDataService.preloadAllBooksAndChapters("standalone")
    }
  }

  ngOnDestroy(): void {
    if (typeof window === "undefined") return
    window.removeEventListener("appinstalled", this.installListener)
  }

  private isStandaloneMode(): boolean {
    if (typeof window === "undefined") return false
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS standalone mode
      window.navigator.standalone === true
    )
  }

  private registerIcons(): void {
    const icons = [
      "arrow_back",
      "chevron_left",
      "chevron_right",
      "dark_mode",
      "expand_more",
      "light_mode",
      "menu",
      "menu_open",
      "search",
      "share",
      "zoom_in",
      "zoom_out",
    ]
    for (const icon of icons) {
      this.iconRegistry.addSvgIcon(
        icon,
        this.sanitizer.bypassSecurityTrustResourceUrl(`icons/ui/${icon}.svg`),
      )
    }
  }
}
