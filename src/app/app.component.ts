import { CommonModule } from "@angular/common"
import { ChangeDetectionStrategy, Component } from "@angular/core"

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
  ) {
    router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        // @ts-ignore
        if (window.umami) window.umami.trackView()
      }
    })
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
        // tiny repaint to eliminate 1px seam on some devices
        requestAnimationFrame(() => {
          document.documentElement.style.transform = "translateZ(0)"
          // clear it on the next frame
          requestAnimationFrame(() => {
            document.documentElement.style.transform = ""
            // ensure scroll is at top if your app is top-anchored
            window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })
          })
        })
      }
    })
  }
}
