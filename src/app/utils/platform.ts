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

/** Installed to the home screen, or running inside a native shell. */
export function isStandaloneApp(): boolean {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // @ts-expect-error iOS standalone mode
    window.navigator.standalone === true ||
    Capacitor.isNativePlatform()
  )
}

/** A click with a modifier opens a new tab or window, not this app's page. */
export const leftToTheBrowser = (event: MouseEvent): boolean =>
  event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
