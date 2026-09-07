/**
 * "Am I running in a browser?" for code that has no injector to ask — the
 * module-level constants and plain factory functions that run before, or
 * outside, Angular DI. Prerendering executes the same bundles in a Node worker
 * where `window` and `document` do not exist, so every browser-only API has to
 * be reached through one of the two checks below rather than through its own
 * ad-hoc `typeof` test.
 *
 * Anything Angular constructs — services, components, directives — must inject
 * `PLATFORM_ID` and use Angular's `isPlatformBrowser(platformId)` instead: that
 * one is overridable in tests, which is how the server-rendering specs cover
 * their guards.
 */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined"
}
