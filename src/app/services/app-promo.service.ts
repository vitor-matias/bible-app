import { isPlatformBrowser } from "@angular/common"
import { Injectable, inject, PLATFORM_ID } from "@angular/core"
import { MatDialog } from "@angular/material/dialog"
import { MatSnackBar } from "@angular/material/snack-bar"
import { Capacitor } from "@capacitor/core"
import { TwoActionSnackComponent } from "../components/two-action-snackbar/two-action-snackbar.component"
import type { StoreApps } from "../config"
import { STORE_APPS } from "../tokens"
import { AnalyticsService } from "./analytics.service"
import { PreferencesService } from "./preferences.service"
import { type InstallPlatform, PwaInstallService } from "./pwa-install.service"

/** Where on the website a visitor was sent to a store, for the analytics. */
export type StoreSource = "onboarding" | "prompt" | "menu"

export interface StoreLink {
  store: "app_store" | "play"
  url: string
  /** The store button's label in the install step. */
  label: string
  /** The one-time prompt, which is itself the button. */
  prompt: string
  icon: string
}

/** Long enough into a visit that the visitor has started reading. */
export const PROMPT_DELAY_MS = 30_000
export const PROMPT_DURATION_MS = 12_000

/**
 * The store listing for a platform, or null while it has none. Play's
 * referrer reaches its acquisition reports, which then tell the website's
 * installs apart by where they came from.
 */
export function storeLink(
  platform: InstallPlatform,
  apps: StoreApps,
  source: StoreSource,
): StoreLink | null {
  if (platform === "ios" && apps.appStoreId) {
    return {
      store: "app_store",
      url: `https://apps.apple.com/app/id${encodeURIComponent(apps.appStoreId)}`,
      label: "Obter na App Store",
      prompt: "Obter a aplicação para iPhone e iPad",
      icon: "phone_iphone",
    }
  }
  if (platform === "android" && apps.playPackage) {
    const referrer = `utm_source=web&utm_medium=${source}`
    return {
      store: "play",
      url: `https://play.google.com/store/apps/details?id=${encodeURIComponent(apps.playPackage)}&referrer=${encodeURIComponent(referrer)}`,
      label: "Obter no Google Play",
      prompt: "Obter a aplicação para Android",
      icon: "android",
    }
  }
  return null
}

/**
 * Points website visitors on phones and tablets at the native apps: the
 * install step's store button, a menu entry, and a one-time prompt for those
 * who went through onboarding before the apps existed. Never inside the apps.
 */
@Injectable({
  providedIn: "root",
})
export class AppPromoService {
  private readonly apps = inject(STORE_APPS)
  private readonly pwaInstall = inject(PwaInstallService)
  private readonly preferences = inject(PreferencesService)
  private readonly analytics = inject(AnalyticsService)
  private readonly snackBar = inject(MatSnackBar)
  private readonly dialog = inject(MatDialog)
  private readonly platformId = inject(PLATFORM_ID)

  storeFor(platform: InstallPlatform, source: StoreSource): StoreLink | null {
    if (Capacitor.isNativePlatform()) return null
    return storeLink(platform, this.apps, source)
  }

  /** The store for the device in hand, if it has one. */
  deviceStore(source: StoreSource): StoreLink | null {
    return this.storeFor(this.pwaInstall.detectPlatform(), source)
  }

  /** The visitor has been shown the app for their device: no prompt now. */
  markSeen(): void {
    this.preferences.setAppPromoSeen(true)
  }

  trackStoreOpen(link: StoreLink, source: StoreSource): void {
    void this.analytics.track("app_store_open", { store: link.store, source })
  }

  /**
   * Schedules the prompt for a visitor who has already been through
   * onboarding (whose install step now shows the store), once, on a device
   * with a store app.
   */
  scheduleOnce(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false
    if (!this.canPrompt()) return false
    setTimeout(() => this.showPrompt(), PROMPT_DELAY_MS)
    return true
  }

  private canPrompt(): boolean {
    return (
      !!this.deviceStore("prompt") &&
      this.preferences.getOnboardingSeen() &&
      !this.preferences.getAppPromoSeen()
    )
  }

  private showPrompt(): void {
    // Re-check: onboarding's install step may have shown the store meanwhile.
    if (!this.canPrompt()) return
    // Don't cover a dialog, replace another message such as "Voltar para…",
    // or be missed in a background tab: the next visit tries again.
    if (
      this.dialog.openDialogs.length > 0 ||
      this.snackBar._openedSnackBarRef ||
      document.visibilityState === "hidden"
    ) {
      return
    }

    const link = this.deviceStore("prompt")
    if (!link) return
    this.markSeen()
    void this.analytics.track("app_prompt_shown", { store: link.store })
    this.snackBar.openFromComponent(TwoActionSnackComponent, {
      data: {
        message: link.prompt,
        icon: "install_mobile",
        onTap: () => this.openStore(link, "prompt"),
      },
      duration: PROMPT_DURATION_MS,
    })
  }

  /** In a new tab, so the reading tab stays where it was. */
  private openStore(link: StoreLink, source: StoreSource): void {
    this.trackStoreOpen(link, source)
    window.open(link.url, "_blank", "noopener")
  }
}
