import { Injectable, OnDestroy } from "@angular/core"

@Injectable({
  providedIn: "root",
})
export class KeepAwakeService implements OnDestroy {
  private wakeLockSentinel?: WakeLockSentinel
  private keepAwakeAudioContext?: AudioContext
  private keepAwakeAudioSource?: OscillatorNode
  private keepAwakeAudioGain?: GainNode
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
      this.startAudioKeepAwake()
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
      console.warn("Unable to acquire wake lock during auto-scroll.", error)
      this.startAudioKeepAwake()
    }
  }

  private async releaseWakeLock(): Promise<void> {
    this.stopAudioKeepAwake()
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

  private startAudioKeepAwake(): void {
    if (this.keepAwakeAudioContext) {
      void this.keepAwakeAudioContext.resume()
      return
    }

    try {
      const AudioContextConstructor =
        window.AudioContext ||
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext
          }
        ).webkitAudioContext
      if (!AudioContextConstructor) {
        return
      }

      const context = new AudioContextConstructor()
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      gain.gain.value = 0.0001

      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start()

      this.keepAwakeAudioContext = context
      this.keepAwakeAudioSource = oscillator
      this.keepAwakeAudioGain = gain
    } catch (error) {
      console.warn("Unable to start audio keep-awake fallback.", error)
    }
  }

  private stopAudioKeepAwake(): void {
    if (this.keepAwakeAudioSource) {
      try {
        this.keepAwakeAudioSource.stop()
      } catch {
        // ignore
      }
      this.keepAwakeAudioSource.disconnect()
      this.keepAwakeAudioSource = undefined
    }
    if (this.keepAwakeAudioGain) {
      this.keepAwakeAudioGain.disconnect()
      this.keepAwakeAudioGain = undefined
    }
    if (this.keepAwakeAudioContext) {
      void this.keepAwakeAudioContext.close()
      this.keepAwakeAudioContext = undefined
    }
  }
}
