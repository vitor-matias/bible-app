
import { ChangeDetectionStrategy, Component, NgZone, OnInit } from "@angular/core"

import { RouterOutlet } from "@angular/router"

import { SwUpdate } from "@angular/service-worker"

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [RouterOutlet],
})
export class AppComponent implements OnInit {
  constructor(
    private readonly swUpdate: SwUpdate,
    private readonly ngZone: NgZone,
  ) {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.subscribe((event) => {
        if (event.type === "VERSION_READY") {
          this.swUpdate.activateUpdate().then(() => {
            globalThis.location.reload()
          })
        }
      })
    }
  }

  ngOnInit() {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        // App resumed
        console.log("App resumed, triggering resize")
        this.ngZone.run(() => {
          // Force Angular change detection and DOM reflow
          globalThis.dispatchEvent(new Event("resize"))
          // Or manually reflow: document.body.offsetHeight; // Triggers layout
        })
      }
    })

    // Also handle page show (for iOS suspend/resume)
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        // From bfcache/suspend
        this.ngZone.run(() => globalThis.dispatchEvent(new Event("resize")))
      }
    })
  }
}
