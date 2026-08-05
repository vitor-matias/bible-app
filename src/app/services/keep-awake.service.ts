import { Injectable, OnDestroy } from "@angular/core"

@Injectable({
  providedIn: "root",
})
export class KeepAwakeService implements OnDestroy {
  private wakeLockSentinel?: WakeLockSentinel
  private wakeLockRequest?: Promise<void>
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

    // Reuse the current sentinel or the in-flight request instead of stacking
    // duplicate wake lock requests while one is still pending.
    if (this.wakeLockSentinel || this.wakeLockRequest) {
      return this.wakeLockRequest
    }

    this.wakeLockRequest = (async () => {
      try {
        const sentinel = await navigator.wakeLock.request("screen")
        if (!this.active) {
          // stop() ran while the request was pending — don't keep the lock.
          await sentinel.release()
          return
        }
        this.wakeLockSentinel = sentinel
        sentinel.addEventListener("release", () => {
          if (this.wakeLockSentinel === sentinel) {
            this.wakeLockSentinel = undefined
          }
        })
      } catch (error) {
        console.warn("Unable to acquire wake lock.", error)
      } finally {
        this.wakeLockRequest = undefined
      }
    })()

    return this.wakeLockRequest
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
