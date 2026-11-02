import { Injectable, inject } from "@angular/core"
import { Capacitor } from "@capacitor/core"
import { ImpactStyle, NotificationType } from "@capacitor/haptics"
import { HAPTICS_PLUGIN } from "../tokens"

/**
 * Native tactile feedback. A no-op on the web, where the Vibration API feels
 * nothing like the platform haptics and is unsupported on iOS anyway.
 */
@Injectable({
  providedIn: "root",
})
export class HapticsService {
  private readonly haptics = inject(HAPTICS_PLUGIN)

  /** A light tap, for moving between chapters or pages. */
  light(): void {
    if (!Capacitor.isNativePlatform()) return
    // Haptics are a nicety: a device without them must not surface errors.
    this.haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
  }

  /** Confirms a completed action, such as saving a bookmark. */
  success(): void {
    if (!Capacitor.isNativePlatform()) return
    this.haptics
      .notification({ type: NotificationType.Success })
      .catch(() => {})
  }
}
