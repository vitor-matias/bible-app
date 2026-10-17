import { Capacitor } from "@capacitor/core"
import { isBrowser } from "./utils/platform"

export const appConfig = {
  domain: "biblia.capuchinhos.org",
  fallbackDomain: "bible-app-ten-psi.vercel.app",
}

export interface StoreApps {
  /** The App Store's numeric app id, as in apps.apple.com/app/id<id>. */
  appStoreId: string
  /** The Google Play package name. */
  playPackage: string
}

/**
 * The native apps' store listings, for the website to point visitors at. A
 * listing must be public by the time the website ships with it; while one is
 * empty the website keeps to its own install steps on that platform and
 * promotes no store.
 */
export const storeApps: StoreApps = {
  // App Store Connect's "Apple ID" for the app.
  appStoreId: "6823135142",
  playPackage: "org.capuchinhos.biblia",
}

/** API origin while prerendering; PRERENDER_API_ORIGIN points it at a stub. */
export const serverApiOrigin =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.["PRERENDER_API_ORIGIN"] || `https://${appConfig.domain}`

export const apiBaseUrl = Capacitor.isNativePlatform()
  ? `https://${appConfig.domain}/v1`
  : !isBrowser()
    ? `${serverApiOrigin}/v1`
    : "v1"

/**
 * Link to the current page for sharing. The native shells serve the bundled
 * app from a localhost origin, which is useless to whoever receives the link,
 * so point at the public site instead.
 */
export function shareableUrl(
  location: Pick<Location, "href" | "pathname" | "search" | "hash">,
): string {
  if (!Capacitor.isNativePlatform()) return location.href
  const { pathname, search, hash } = location
  return `https://${appConfig.domain}${pathname}${search}${hash}`
}
