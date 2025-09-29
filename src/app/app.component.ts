import { CommonModule } from "@angular/common"
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
} from "@angular/core"

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
    private cdr: ChangeDetectorRef,
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
    const repaintStatusBar = () => {
      console.log("Repaint status bar")
      const metas = Array.from(
        document.querySelectorAll('meta[name="theme-color"]'),
      ) as HTMLMetaElement[]
      if (!metas.length) return

      for (const m of metas) {
        const orig = m.getAttribute("content") || "#543D27"
        // Flip to a near-identical color for a frame, then back
        m.setAttribute("content", "#543D28")
        requestAnimationFrame(() => m.setAttribute("content", orig))
      }

      // Hard reflow + compositor nudge (covers rare cases)
      const el = document.documentElement
      el.style.transform = "translateZ(0)"
      // force layout
      void el.offsetHeight
      el.style.transform = ""
    }

    window.addEventListener("focus", repaintStatusBar)
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) repaintStatusBar()
    })
  }
}
