
import { ChangeDetectionStrategy, Component } from "@angular/core"

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
export class AppComponent {
  constructor(
    private swUpdate: SwUpdate,
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
}
