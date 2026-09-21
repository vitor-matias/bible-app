import { Capacitor } from "@capacitor/core"
import { isBrowser } from "./utils/platform"

export const appConfig = {
  domain: "biblia.capuchinhos.org",
  fallbackDomain: "bible-app-ten-psi.vercel.app",
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
