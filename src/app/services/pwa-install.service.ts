import { Injectable, type OnDestroy } from "@angular/core"
import { Capacitor } from "@capacitor/core"
import { BehaviorSubject } from "rxjs"

export type InstallPlatform = "android" | "ios" | "desktop"
export type InstallBrowser = "chrome" | "edge" | "safari" | "firefox" | "other"
export type InstallPromptOutcome = "accepted" | "dismissed" | "unavailable"

/** The non-standard `beforeinstallprompt` event fired by Chromium browsers. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed"
    platform: string
  }>
}

/** Display modes the manifest can resolve to once the PWA is installed. */
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
 * Tracks whether the app can be installed as a PWA on this device and, when the
 * browser exposes a native install prompt, holds on to it until the user asks.
 *
 * Must be instantiated early (it is injected by `AppComponent`) because
 * `beforeinstallprompt` fires only once, shortly after load.
 */
@Injectable({
  providedIn: "root",
})
export class PwaInstallService implements OnDestroy {
  private deferredPrompt: BeforeInstallPromptEvent | null = null
  private readonly canPromptSubject = new BehaviorSubject<boolean>(false)
  private readonly installedSubject = new BehaviorSubject<boolean>(false)

  /** Emits `true` while a captured native install prompt is waiting to be shown. */
  readonly canPromptInstall$ = this.canPromptSubject.asObservable()
  /** Emits `true` once the app runs installed (standalone PWA, native shell, or just installed). */
  readonly installed$ = this.installedSubject.asObservable()

  private readonly onBeforeInstallPrompt = (event: Event): void => {
    // Stop the browser mini-infobar; the onboarding wizard offers the prompt instead.
    event.preventDefault()
    this.deferredPrompt = event as BeforeInstallPromptEvent
    this.canPromptSubject.next(true)
  }

  private readonly onAppInstalled = (): void => {
    this.deferredPrompt = null
    this.canPromptSubject.next(false)
    this.installedSubject.next(true)
  }

  constructor() {
    this.installedSubject.next(this.isRunningInstalled())
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

  get isInstalled(): boolean {
    return this.installedSubject.value
  }

  get canPromptInstall(): boolean {
    return this.canPromptSubject.value
  }

  /** True inside the Capacitor shell or when launched from an installed PWA icon. */
  isRunningInstalled(): boolean {
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

  /**
   * Shows the browser's native install dialog, if one was captured.
   * The captured event can only be used once, so it is released either way.
   */
  async promptInstall(): Promise<InstallPromptOutcome> {
    const event = this.deferredPrompt
    if (!event) return "unavailable"

    this.deferredPrompt = null
    this.canPromptSubject.next(false)

    try {
      await event.prompt()
      const choice = await event.userChoice
      if (choice.outcome === "accepted") {
        this.installedSubject.next(true)
      }
      return choice.outcome
    } catch (error) {
      console.error("PWA install prompt failed", error)
      return "unavailable"
    }
  }
}
