import { Capacitor } from "@capacitor/core"
import { isBrowser } from "./utils/platform"

export const appConfig = {
  domain: "biblia.capuchinhos.org",
  fallbackDomain: "bible-app-ten-psi.vercel.app",
}

/** A Vercel deployment (the test site and its previews), not the website. */
export function isVercelHost(hostname: string): boolean {
  return hostname.endsWith(".vercel.app")
}

/** API origin while prerendering; PRERENDER_API_ORIGIN points it at a stub. */
export const serverApiOrigin =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.["PRERENDER_API_ORIGIN"] || `https://${appConfig.domain}`

/**
 * Container builds set PRERENDER_STRICT=true so an unreachable API fails the
 * build instead of silently shipping client-rendered pages. Read per call, not
 * at import time, so tests can flip it.
 */
export const isPrerenderStrict = (): boolean =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.["PRERENDER_STRICT"] === "true"

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
