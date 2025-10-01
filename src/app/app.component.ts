import { CommonModule } from "@angular/common"
import { ChangeDetectionStrategy, Component, NgZone } from "@angular/core"

import { NavigationEnd, Router, RouterOutlet } from "@angular/router"

import { SwUpdate } from "@angular/service-worker"

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, RouterOutlet],
})
export class AppComponent {
  constructor(
    private swUpdate: SwUpdate,
    router: Router,
    private ngZone: NgZone,
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

  ngOnInit() {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        // App resumed
        console.log("App resumed, triggering resize")
        this.ngZone.run(() => {
          // Force Angular change detection and DOM reflow
          window.dispatchEvent(new Event("resize"))
          // Or manually reflow: document.body.offsetHeight; // Triggers layout
        })
      }
    })

    // Also handle page show (for iOS suspend/resume)
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        // From bfcache/suspend
        this.ngZone.run(() => window.dispatchEvent(new Event("resize")))
      }
    })
  }
}
