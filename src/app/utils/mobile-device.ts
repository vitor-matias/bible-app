import type { PwaInstallService } from "../services/pwa-install.service"

/**
 * Phones and tablets, native shell included — the same platform split the
 * onboarding wizard uses, so "mobile" means one thing across the app.
 */
export function isMobileDevice(pwaInstallService: PwaInstallService): boolean {
  return pwaInstallService.detectPlatform() !== "desktop"
}
