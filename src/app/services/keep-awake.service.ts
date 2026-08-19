import { isPlatformBrowser } from "@angular/common"
import { Injectable, inject, OnDestroy, PLATFORM_ID } from "@angular/core"

@Injectable({
  providedIn: "root",
})
export class KeepAwakeService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID)
  private wakeLockSentinel?: WakeLockSentinel
  private active = false
  private readonly visibilityHandler = () => {
    if (!this.active) {
      return
    }

    if (document.visibilityState === "visible") {
      // Wake locks can be dropped when the tab backgrounds, so reacquire on return
      // only when the feature is still logically active.
      void this.requestWakeLock()
    }
  }

  constructor() {
    // document is absent while server-rendering; wake locks are browser-only.
    if (isPlatformBrowser(this.platformId)) {
      document.addEventListener("visibilitychange", this.visibilityHandler)
    }
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      document.removeEventListener("visibilitychange", this.visibilityHandler)
    }
    this.stop()
  }

  start(): void {
    if (this.active) {
      return
    }

    this.active = true
    void this.requestWakeLock()
  }

  stop(): void {
    if (!this.active) {
      return
    }

    this.active = false
    void this.releaseWakeLock()
  }

  private async requestWakeLock(): Promise<void> {
    if (!("wakeLock" in navigator)) {
      return
    }

    try {
      // Reuse the current sentinel instead of stacking duplicate wake lock requests.
      if (this.wakeLockSentinel) {
        return
      }
      const sentinel = await navigator.wakeLock.request("screen")
      this.wakeLockSentinel = sentinel
      sentinel.addEventListener("release", () => {
        if (this.wakeLockSentinel === sentinel) {
          this.wakeLockSentinel = undefined
        }
      })
    } catch (error) {
      console.warn("Unable to acquire wake lock.", error)
    }
  }

  private async releaseWakeLock(): Promise<void> {
    if (!this.wakeLockSentinel) {
      return
    }

    try {
      await this.wakeLockSentinel.release()
    } catch (error) {
      console.warn("Unable to release wake lock.", error)
    } finally {
      this.wakeLockSentinel = undefined
    }
  }
}
