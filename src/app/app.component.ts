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

  ngOnInit(): void {
    //when app suspends and resumes (mobile) there were some layout issues with the top bar
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        // App resumed - force layout recalculation
        setTimeout(() => {
          window.dispatchEvent(new Event("resize"))
        }, 100)
      }
    })
  }
}
