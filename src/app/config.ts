import { Capacitor } from "@capacitor/core"
import { isBrowser } from "./utils/platform"

export const appConfig = {
  domain: "biblia.capuchinhos.org",
  fallbackDomain: "bible-app-ten-psi.vercel.app",
  /**
   * Base URL of the self-hosted live-update server (see
   * docs/live-updates.md). The native apps fetch
   * `<base>/<platform>/<channel>/manifest.json`. Empty disables live updates.
   */
  liveUpdateBaseUrl: "",
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
