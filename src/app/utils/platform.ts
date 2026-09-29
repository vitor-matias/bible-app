import { Capacitor } from "@capacitor/core"

/**
 * "Am I running in a browser?" for code with no injector to ask — module-level
 * constants and plain factories. Prerendering runs the same bundles in a Node
 * worker without `window` or `document`.
 *
 * Anything Angular constructs should inject `PLATFORM_ID` and use
 * `isPlatformBrowser(platformId)` instead, which specs can override.
 */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined"
}

/**
 * The service worker only caches the web deploy. The native shells bundle the
 * app, so a worker there adds nothing and can serve a stale shell after a
 * store update.
 */
export function isServiceWorkerEnabled(devMode: boolean): boolean {
  return !devMode && !Capacitor.isNativePlatform()
}
