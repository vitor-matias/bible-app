import { DOCUMENT } from "@angular/common"
import { Injectable, inject } from "@angular/core"
import { Capacitor } from "@capacitor/core"

/** `-apple-system-body` at iOS's default text size ("Large"). */
const DEFAULT_BODY_SIZE = 17

/**
 * The text size people chose for the whole iPhone (Settings › Display &
 * Brightness › Text Size), which the iOS app starts from until a size is
 * chosen in the app.
 */
@Injectable({
  providedIn: "root",
})
export class SystemTextSizeService {
  private readonly document = inject(DOCUMENT)

  /**
   * As a percentage of the default size (100 at "Large", about 124 two steps
   * up), or null where the app doesn't follow it: everywhere but the iOS
   * app, whose web view sizes `-apple-system-body` by Dynamic Type.
   */
  percent(): number | null {
    if (Capacitor.getPlatform() !== "ios") return null
    const view = this.document.defaultView
    if (!view?.CSS?.supports("font", "-apple-system-body")) return null
    const probe = this.document.createElement("span")
    probe.style.font = "-apple-system-body"
    probe.style.position = "absolute"
    probe.style.visibility = "hidden"
    this.document.body.appendChild(probe)
    const size = Number.parseFloat(view.getComputedStyle(probe).fontSize)
    probe.remove()
    return Number.isFinite(size) && size > 0
      ? (size / DEFAULT_BODY_SIZE) * 100
      : null
  }
}
