import { Injectable, OnDestroy } from "@angular/core"

@Injectable({
  providedIn: "root",
})
export class KeepAwakeService implements OnDestroy {
  private wakeLockSentinel?: WakeLockSentinel
  private active = false
  private readonly visibilityHandler = () => {
    if (!this.active) {
      return
    }

    if (document.visibilityState === "visible") {
      void this.requestWakeLock()
    }
  }

  constructor() {
    document.addEventListener("visibilitychange", this.visibilityHandler)
  }

  ngOnDestroy(): void {
    document.removeEventListener("visibilitychange", this.visibilityHandler)
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
