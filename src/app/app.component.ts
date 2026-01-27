import {
  ChangeDetectionStrategy,
  Component,
  type OnDestroy,
  type OnInit,
} from "@angular/core"
import { RouterOutlet } from "@angular/router"

import type { SwUpdate } from "@angular/service-worker"
import type { OfflineDataService } from "./services/offline-data.service"

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
  ) {
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
}
