import { Injectable, type OnDestroy } from "@angular/core"
import { Capacitor } from "@capacitor/core"
import { BehaviorSubject } from "rxjs"

export type InstallPlatform = "android" | "ios" | "desktop"
export type InstallBrowser = "chrome" | "edge" | "safari" | "firefox" | "other"
export type InstallPromptOutcome = "accepted" | "dismissed" | "unavailable"

/** The non-standard `beforeinstallprompt` event (Chromium only). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed"
    platform: string
  }>
}

const INSTALLED_DISPLAY_MODES = [
  "(display-mode: standalone)",
  "(display-mode: window-controls-overlay)",
  "(display-mode: fullscreen)",
]

function defaultUserAgent(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent
}

function defaultMaxTouchPoints(): number {
  return typeof navigator === "undefined" ? 0 : (navigator.maxTouchPoints ?? 0)
}

/**
 * Must be instantiated early (`AppComponent` injects it): `beforeinstallprompt`
 * fires only once, shortly after load.
 */
@Injectable({
  providedIn: "root",
})
export class PwaInstallService implements OnDestroy {
  private deferredPrompt: BeforeInstallPromptEvent | null = null
  private readonly canPromptSubject = new BehaviorSubject<boolean>(false)

  readonly canPromptInstall$ = this.canPromptSubject.asObservable()
  isInstalled = this.isRunningInstalled()

  private readonly onBeforeInstallPrompt = (event: Event): void => {
    // Suppress the mini-infobar; the onboarding wizard offers the prompt.
    event.preventDefault()
    this.deferredPrompt = event as BeforeInstallPromptEvent
    this.canPromptSubject.next(true)
  }

  private readonly onAppInstalled = (): void => {
    this.deferredPrompt = null
    this.canPromptSubject.next(false)
    this.isInstalled = true
  }

  constructor() {
    if (typeof window === "undefined") return
    window.addEventListener("beforeinstallprompt", this.onBeforeInstallPrompt)
    window.addEventListener("appinstalled", this.onAppInstalled)
  }

  ngOnDestroy(): void {
    if (typeof window === "undefined") return
    window.removeEventListener(
      "beforeinstallprompt",
      this.onBeforeInstallPrompt,
    )
    window.removeEventListener("appinstalled", this.onAppInstalled)
  }

  get canPromptInstall(): boolean {
    return this.canPromptSubject.value
  }

  private isRunningInstalled(): boolean {
    if (Capacitor.isNativePlatform()) return true
    if (typeof window === "undefined") return false

    const nav = window.navigator as Navigator & { standalone?: boolean }
    if (nav.standalone === true) return true // iOS Safari home-screen apps
    if (typeof window.matchMedia !== "function") return false

    return INSTALLED_DISPLAY_MODES.some(
      (query) => window.matchMedia(query).matches,
    )
  }

  detectPlatform(
    userAgent: string = defaultUserAgent(),
    maxTouchPoints: number = defaultMaxTouchPoints(),
  ): InstallPlatform {
    if (/iPad|iPhone|iPod/i.test(userAgent)) return "ios"
    // iPadOS 13+ reports a desktop Safari user agent; touch points give it away.
    if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios"
    if (/Android/i.test(userAgent)) return "android"
    return "desktop"
  }

  detectBrowser(userAgent: string = defaultUserAgent()): InstallBrowser {
    if (/Edg(A|iOS)?\//i.test(userAgent)) return "edge"
    if (/Firefox\/|FxiOS\//i.test(userAgent)) return "firefox"
    if (/SamsungBrowser\/|OPR\/|OPT\//i.test(userAgent)) return "other"
    if (/CriOS\/|Chrome\/|Chromium\//i.test(userAgent)) return "chrome"
    if (/Safari\//i.test(userAgent)) return "safari"
    return "other"
  }

  /** The captured event is single-use, so it is released either way. */
  async promptInstall(): Promise<InstallPromptOutcome> {
    const event = this.deferredPrompt
    if (!event) return "unavailable"

    this.deferredPrompt = null
    this.canPromptSubject.next(false)

    try {
      await event.prompt()
      const choice = await event.userChoice
      if (choice.outcome === "accepted") {
        this.isInstalled = true
      }
      return choice.outcome
    } catch (error) {
      console.error("PWA install prompt failed", error)
      return "unavailable"
    }
  }
}
