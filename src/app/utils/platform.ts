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
