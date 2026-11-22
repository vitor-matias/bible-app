import { isPlatformBrowser } from "@angular/common"
import { Injectable, inject, OnDestroy, PLATFORM_ID } from "@angular/core"

@Injectable({
  providedIn: "root",
})
export class KeepAwakeService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID)
  private wakeLockSentinel?: WakeLockSentinel
  private wakeLockRequest?: Promise<void>
  /** Who wants the screen on (auto-scroll, +365): it stays on while any does. */
  private readonly owners = new Set<string>()
  private get active(): boolean {
    return this.owners.size > 0
  }
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
    this.owners.clear()
    void this.releaseWakeLock()
  }

  start(owner = "default"): void {
    const wasActive = this.active
    this.owners.add(owner)
    if (!wasActive) void this.requestWakeLock()
  }

  stop(owner = "default"): void {
    if (!this.owners.delete(owner) || this.active) {
      return
    }

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
    const sentinel = this.wakeLockSentinel
    if (!sentinel) {
      return
    }

    // Forget it before awaiting: a start() landing mid-release would otherwise
    // see a live sentinel, skip its request, and be left with no lock at all.
    this.wakeLockSentinel = undefined
    try {
      await sentinel.release()
    } catch (error) {
      console.warn("Unable to release wake lock.", error)
    }
  }
}
